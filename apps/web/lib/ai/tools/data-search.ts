/**
 * Public data search tool.
 *
 * Fetches and validates GeoJSON/JSON from known public data APIs.
 * Used by the clarification AI via tool use to find datasets
 * that match the user's prompt.
 *
 * Two-layer cache:
 *   L1: In-memory Map (1 hour TTL, instant)
 *   L2: File-based (.next/cache/atlas-data/, 24 hour TTL, survives restart)
 *
 * Supported sources:
 * - World Bank API (population, GDP, HDI, etc.)
 * - Direct GeoJSON URLs
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { profileDataset } from "../profiler";
import type { DatasetProfile } from "../types";

// ─── Types ──────────────────────────────────────────────────

export interface DataSearchResult {
  found: boolean;
  source?: string;
  description?: string;
  featureCount?: number;
  geometryType?: string;
  attributes?: string[];
  /** Internal cache key — used to build the proxy URL. */
  cacheKey?: string;
  profile?: DatasetProfile;
  error?: string;
}

// ─── Cache ──────────────────────────────────────────────────

export interface CacheEntry {
  data: GeoJSON.FeatureCollection;
  profile: DatasetProfile;
  source: string;
  description: string;
  timestamp: number;
}

// L1: In-memory cache (fast, volatile)
const memoryCache = new Map<string, CacheEntry>();
const MEMORY_TTL_MS = 60 * 60 * 1000; // 1 hour

// L2: File cache (slower, persistent across restarts)
const FILE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_DIR = join(process.cwd(), ".next", "cache", "atlas-data");
let cacheDirReady = false;

/** Sanitize cache key for use as filename. */
function toFileName(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json";
}

async function ensureCacheDir(): Promise<void> {
  if (cacheDirReady) return;
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    cacheDirReady = true;
  } catch {
    // Directory might already exist or be unwritable
  }
}

async function readFileCache(key: string): Promise<CacheEntry | null> {
  try {
    await ensureCacheDir();
    const filePath = join(CACHE_DIR, toFileName(key));
    const raw = await readFile(filePath, "utf-8");
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.timestamp > FILE_TTL_MS) {
      return null; // Expired
    }
    return entry;
  } catch {
    return null;
  }
}

async function writeFileCache(key: string, entry: CacheEntry): Promise<void> {
  try {
    await ensureCacheDir();
    const filePath = join(CACHE_DIR, toFileName(key));
    await writeFile(filePath, JSON.stringify(entry));
  } catch {
    // File write failed — non-critical, memory cache still works
  }
}

/**
 * Get cached data by key. Checks L1 (memory) then L2 (file).
 * On L2 hit, promotes to L1 for faster subsequent access.
 */
export async function getCachedData(key: string): Promise<CacheEntry | null> {
  // L1: memory
  const memEntry = memoryCache.get(key);
  if (memEntry) {
    if (Date.now() - memEntry.timestamp > MEMORY_TTL_MS) {
      memoryCache.delete(key);
    } else {
      return memEntry;
    }
  }

  // L2: file
  const fileEntry = await readFileCache(key);
  if (fileEntry) {
    // Promote to L1
    memoryCache.set(key, fileEntry);
    return fileEntry;
  }

  return null;
}

/**
 * Synchronous L1-only cache check (used by the /api/geo/cached/[key] route
 * for fast serving without async overhead).
 */
export function getCachedDataSync(key: string): CacheEntry | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > MEMORY_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return entry;
}

/** Write to both L1 and L2. */
export async function setCache(key: string, entry: CacheEntry): Promise<void> {
  memoryCache.set(key, entry);
  await writeFileCache(key, entry);
}

// ─── World Bank API ─────────────────────────────────────────

/**
 * Known World Bank indicator codes.
 */
const WORLD_BANK_INDICATORS: Record<string, { code: string; label: string; unit: string }> = {
  population: { code: "SP.POP.TOTL", label: "Total Population", unit: "people" },
  befolkning: { code: "SP.POP.TOTL", label: "Total Population", unit: "people" },
  gdp: { code: "NY.GDP.MKTP.CD", label: "GDP (current US$)", unit: "USD" },
  bnp: { code: "NY.GDP.MKTP.CD", label: "GDP (current US$)", unit: "USD" },
  "gdp per capita": { code: "NY.GDP.PCAP.CD", label: "GDP per capita (current US$)", unit: "USD" },
  "bnp per capita": { code: "NY.GDP.PCAP.CD", label: "GDP per capita (current US$)", unit: "USD" },
  "life expectancy": { code: "SP.DYN.LE00.IN", label: "Life Expectancy at Birth", unit: "years" },
  livslängd: { code: "SP.DYN.LE00.IN", label: "Life Expectancy at Birth", unit: "years" },
  "co2": { code: "EN.GHG.CO2.MT.CE.AR5", label: "CO2 Emissions (Mt CO2e, excl. LULUCF)", unit: "Mt CO2e" },
  "co2 emissions": { code: "EN.GHG.CO2.MT.CE.AR5", label: "CO2 Emissions (Mt CO2e, excl. LULUCF)", unit: "Mt CO2e" },
  literacy: { code: "SE.ADT.LITR.ZS", label: "Literacy Rate", unit: "%" },
  unemployment: { code: "SL.UEM.TOTL.ZS", label: "Unemployment Rate", unit: "%" },
  arbetslöshet: { code: "SL.UEM.TOTL.ZS", label: "Unemployment Rate", unit: "%" },
  "infant mortality": { code: "SP.DYN.IMRT.IN", label: "Infant Mortality Rate", unit: "per 1,000 live births" },
  fertility: { code: "SP.DYN.TFRT.IN", label: "Fertility Rate", unit: "births per woman" },
  "internet users": { code: "IT.NET.USER.ZS", label: "Internet Users", unit: "% of population" },
  internet: { code: "IT.NET.USER.ZS", label: "Internet Users", unit: "% of population" },
  "renewable energy": { code: "EG.FEC.RNEW.ZS", label: "Renewable Energy Consumption", unit: "% of total" },
  "forest area": { code: "AG.LND.FRST.ZS", label: "Forest Area", unit: "% of land area" },
  skogsareal: { code: "AG.LND.FRST.ZS", label: "Forest Area", unit: "% of land area" },
  skogsyta: { code: "AG.LND.FRST.ZS", label: "Forest Area", unit: "% of land area" },
  "urban population": { code: "SP.URB.TOTL.IN.ZS", label: "Urban Population", unit: "% of total" },
  hdi: { code: "HD.HCI.OVRL", label: "Human Capital Index", unit: "index" },
};

/**
 * Words indicating the user wants sub-national data.
 * World Bank only has country-level data, so skip if these appear.
 */
const SUBNATIONAL_KEYWORDS = [
  "state", "states", "province", "provinces", "county", "counties",
  "district", "districts", "municipality", "municipalities",
  "län", "kommun", "kommuner",
];

/**
 * Search World Bank API for a matching indicator.
 * Returns country-level data joined with Natural Earth geometries.
 *
 * Skips if the prompt explicitly asks for sub-national data (e.g. "US states")
 * since World Bank only provides country-level statistics.
 */
export async function searchWorldBank(query: string): Promise<DataSearchResult> {
  const lower = query.toLowerCase();
  const words = lower.split(/\s+/);

  // Skip if user wants sub-national data — World Bank is country-level only
  const wantsSubnational = SUBNATIONAL_KEYWORDS.some((kw) => words.includes(kw));
  if (wantsSubnational) {
    return { found: false, error: "World Bank only has country-level data; prompt asks for sub-national" };
  }

  // Find matching indicator — sort by keyword length (longest first)
  // so "gdp per capita" matches before "gdp"
  let matched: { code: string; label: string; unit: string } | null = null;
  const sortedEntries = Object.entries(WORLD_BANK_INDICATORS)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [keyword, indicator] of sortedEntries) {
    if (lower.includes(keyword)) {
      matched = indicator;
      break;
    }
  }

  if (!matched) {
    return { found: false, error: "No matching World Bank indicator found" };
  }

  const cacheKey = `worldbank-${matched.code}`;
  const cached = await getCachedData(cacheKey);
  if (cached) {
    return {
      found: true,
      source: "World Bank",
      description: `${matched.label} by country (${matched.unit})`,
      featureCount: cached.profile.featureCount,
      geometryType: cached.profile.geometryType,
      attributes: cached.profile.attributes.map((a) => a.name),
      cacheKey,
      profile: cached.profile,
    };
  }

  try {
    // Fetch latest data for all countries
    const url = `https://api.worldbank.org/v2/country/all/indicator/${matched.code}?format=json&per_page=300&mrnev=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { found: false, error: "World Bank API error" };

    const json = await res.json();
    const records = json[1] as Array<{
      country: { id: string; value: string };
      countryiso3code: string;
      value: number | null;
      date: string;
    }> | undefined;

    if (!records || records.length === 0) {
      return { found: false, error: "No data returned from World Bank" };
    }

    // Fetch country geometries
    const geoRes = await fetch("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson", {
      signal: AbortSignal.timeout(10_000),
    });
    if (!geoRes.ok) return { found: false, error: "Failed to fetch country geometries" };

    const geoData = await geoRes.json() as GeoJSON.FeatureCollection;

    // Build lookup: ISO_A3 → World Bank value
    const valueLookup = new Map<string, { value: number; date: string; countryName: string }>();
    for (const rec of records) {
      if (rec.value != null && rec.countryiso3code) {
        valueLookup.set(rec.countryiso3code, {
          value: rec.value,
          date: rec.date,
          countryName: rec.country.value,
        });
      }
    }

    // Join data with geometries
    const features: GeoJSON.Feature[] = geoData.features
      .filter((f) => {
        const iso = f.properties?.["ISO_A3"] ?? f.properties?.["iso_a3"];
        return iso && valueLookup.has(iso);
      })
      .map((f) => {
        const iso = f.properties?.["ISO_A3"] ?? f.properties?.["iso_a3"];
        const data = valueLookup.get(iso)!;
        return {
          type: "Feature" as const,
          geometry: f.geometry,
          properties: {
            name: data.countryName,
            iso_a3: iso,
            continent: f.properties?.["CONTINENT"] ?? f.properties?.["continent"] ?? "",
            [matched!.code]: data.value,
            value: data.value,
            year: data.date,
          },
        };
      });

    if (features.length === 0) {
      return { found: false, error: "No countries matched between World Bank and geometry data" };
    }

    const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
    const profile = profileDataset(fc);

    const entry: CacheEntry = {
      data: fc,
      profile,
      source: "World Bank",
      description: `${matched.label} by country (${matched.unit})`,
      timestamp: Date.now(),
    };

    await setCache(cacheKey, entry);

    return {
      found: true,
      source: "World Bank",
      description: `${matched.label} by country (${matched.unit}), ${features.length} countries`,
      featureCount: features.length,
      geometryType: "Polygon",
      attributes: profile.attributes.map((a) => a.name),
      cacheKey,
      profile,
    };
  } catch (err) {
    return { found: false, error: err instanceof Error ? err.message : "World Bank search failed" };
  }
}

// ─── NASA EONET (Natural Events) ────────────────────────────

/**
 * EONET event category keywords.
 */
const EONET_CATEGORIES: Record<string, { id: string; label: string }> = {
  wildfire: { id: "wildfires", label: "Wildfires" },
  wildfires: { id: "wildfires", label: "Wildfires" },
  bränder: { id: "wildfires", label: "Wildfires" },
  skogsbrand: { id: "wildfires", label: "Wildfires" },
  volcano: { id: "volcanoes", label: "Volcanoes" },
  volcanoes: { id: "volcanoes", label: "Volcanoes" },
  vulkan: { id: "volcanoes", label: "Volcanoes" },
  storm: { id: "severeStorms", label: "Severe Storms" },
  storms: { id: "severeStorms", label: "Severe Storms" },
  hurricane: { id: "severeStorms", label: "Severe Storms" },
  cyclone: { id: "severeStorms", label: "Severe Storms" },
  typhoon: { id: "severeStorms", label: "Severe Storms" },
  flood: { id: "floods", label: "Floods" },
  floods: { id: "floods", label: "Floods" },
  översvämning: { id: "floods", label: "Floods" },
  drought: { id: "drought", label: "Drought" },
  torka: { id: "drought", label: "Drought" },
  iceberg: { id: "seaLakeIce", label: "Sea and Lake Ice" },
  "sea ice": { id: "seaLakeIce", label: "Sea and Lake Ice" },
  landslide: { id: "landslides", label: "Landslides" },
  "natural events": { id: "", label: "All Natural Events" },
  "natural disasters": { id: "", label: "All Natural Events" },
  naturkatastrofer: { id: "", label: "All Natural Events" },
};

/**
 * Search NASA EONET for natural events.
 * Returns point features for each event with coordinates.
 */
export async function searchEONET(query: string): Promise<DataSearchResult> {
  const lower = query.toLowerCase();

  let matched: { id: string; label: string } | null = null;
  for (const [keyword, cat] of Object.entries(EONET_CATEGORIES)) {
    if (lower.includes(keyword)) {
      matched = cat;
      break;
    }
  }

  if (!matched) {
    return { found: false, error: "No matching EONET category found" };
  }

  const cacheKey = `eonet-${matched.id || "all"}`;
  const cached = await getCachedData(cacheKey);
  if (cached) {
    return {
      found: true,
      source: "NASA EONET",
      description: `${matched.label} (active events)`,
      featureCount: cached.profile.featureCount,
      geometryType: cached.profile.geometryType,
      attributes: cached.profile.attributes.map((a) => a.name),
      cacheKey,
      profile: cached.profile,
    };
  }

  try {
    const categoryParam = matched.id ? `&category=${matched.id}` : "";
    const url = `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=200${categoryParam}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { found: false, error: "NASA EONET API error" };

    const json = await res.json() as {
      events: Array<{
        id: string;
        title: string;
        categories: Array<{ id: string; title: string }>;
        geometry: Array<{
          date: string;
          type: string;
          coordinates: [number, number];
          magnitudeValue?: number;
          magnitudeUnit?: string;
        }>;
      }>;
    };

    if (!json.events || json.events.length === 0) {
      return { found: false, error: "No active events found" };
    }

    // Use latest geometry point for each event
    const features: GeoJSON.Feature[] = json.events
      .filter((e) => e.geometry.length > 0)
      .map((e) => {
        const latest = e.geometry[e.geometry.length - 1];
        return {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: latest.coordinates, // [lon, lat]
          },
          properties: {
            name: e.title,
            event_id: e.id,
            category: e.categories[0]?.title ?? "",
            date: latest.date,
            magnitude: latest.magnitudeValue ?? null,
            magnitude_unit: latest.magnitudeUnit ?? "",
          },
        };
      });

    if (features.length === 0) {
      return { found: false, error: "No events with coordinates" };
    }

    const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
    const profile = profileDataset(fc);

    const entry: CacheEntry = {
      data: fc,
      profile,
      source: "NASA EONET",
      description: `${matched.label} (active events)`,
      timestamp: Date.now(),
    };

    await setCache(cacheKey, entry);

    return {
      found: true,
      source: "NASA EONET",
      description: `${matched.label}, ${features.length} active events`,
      featureCount: features.length,
      geometryType: "Point",
      attributes: profile.attributes.map((a) => a.name),
      cacheKey,
      profile,
    };
  } catch (err) {
    return { found: false, error: err instanceof Error ? err.message : "EONET search failed" };
  }
}

// ─── REST Countries ─────────────────────────────────────────

/**
 * Keywords that trigger REST Countries data.
 * Used when the user wants country-level data that World Bank doesn't cover
 * (e.g. area, region, capitals) or as a lightweight alternative.
 */
const REST_COUNTRIES_KEYWORDS = [
  "all countries", "world countries", "list countries",
  "alla länder", "land area", "yta",
  "capitals", "huvudstäder", "capital cities",
];

/**
 * Search REST Countries API.
 * Returns country points (capital coordinates) with population, area, region.
 */
export async function searchRESTCountries(query: string): Promise<DataSearchResult> {
  const lower = query.toLowerCase();

  const isMatch = REST_COUNTRIES_KEYWORDS.some((kw) => lower.includes(kw));
  if (!isMatch) {
    return { found: false, error: "No matching REST Countries query" };
  }

  const cacheKey = "rest-countries-all";
  const cached = await getCachedData(cacheKey);
  if (cached) {
    return {
      found: true,
      source: "REST Countries",
      description: "Countries with population, area, region",
      featureCount: cached.profile.featureCount,
      geometryType: cached.profile.geometryType,
      attributes: cached.profile.attributes.map((a) => a.name),
      cacheKey,
      profile: cached.profile,
    };
  }

  try {
    const url = "https://restcountries.com/v3.1/all?fields=name,cca3,region,subregion,population,area,latlng,capitalInfo,capital";
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { found: false, error: "REST Countries API error" };

    const countries = await res.json() as Array<{
      name: { common: string; official: string };
      cca3: string;
      region: string;
      subregion: string;
      population: number;
      area: number;
      latlng: [number, number];
      capital?: string[];
      capitalInfo?: { latlng?: [number, number] };
    }>;

    if (!countries || countries.length === 0) {
      return { found: false, error: "No countries returned" };
    }

    const features: GeoJSON.Feature[] = countries
      .filter((c) => {
        // Need valid coordinates
        const coords = c.capitalInfo?.latlng ?? c.latlng;
        return coords && coords.length === 2 && isFinite(coords[0]) && isFinite(coords[1]);
      })
      .map((c) => {
        // Prefer capital coordinates, fall back to country center
        const coords = c.capitalInfo?.latlng ?? c.latlng;
        return {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [coords[1], coords[0]], // [lon, lat] — REST Countries returns [lat, lon]
          },
          properties: {
            name: c.name.common,
            iso_a3: c.cca3,
            capital: c.capital?.[0] ?? "",
            region: c.region,
            subregion: c.subregion,
            population: c.population,
            area: c.area,
          },
        };
      });

    if (features.length === 0) {
      return { found: false, error: "No countries with coordinates" };
    }

    const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
    const profile = profileDataset(fc);

    const entry: CacheEntry = {
      data: fc,
      profile,
      source: "REST Countries",
      description: "Countries with population, area, region",
      timestamp: Date.now(),
    };

    await setCache(cacheKey, entry);

    return {
      found: true,
      source: "REST Countries",
      description: `World countries, ${features.length} countries with population, area, region`,
      featureCount: features.length,
      geometryType: "Point",
      attributes: profile.attributes.map((a) => a.name),
      cacheKey,
      profile,
    };
  } catch (err) {
    return { found: false, error: err instanceof Error ? err.message : "REST Countries search failed" };
  }
}

// ─── Direct URL fetch ───────────────────────────────────────

/**
 * Fetch a URL and try to parse it as GeoJSON.
 */
export async function fetchGeoJSON(url: string): Promise<DataSearchResult> {
  const cacheKey = `url-${url}`;
  const cached = await getCachedData(cacheKey);
  if (cached) {
    return {
      found: true,
      source: url,
      description: cached.description,
      featureCount: cached.profile.featureCount,
      geometryType: cached.profile.geometryType,
      attributes: cached.profile.attributes.map((a) => a.name),
      cacheKey,
      profile: cached.profile,
    };
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { found: false, error: `HTTP ${res.status}` };

    const data = await res.json();
    if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) {
      return { found: false, error: "Response is not a GeoJSON FeatureCollection" };
    }

    const fc = data as GeoJSON.FeatureCollection;
    if (fc.features.length === 0) {
      return { found: false, error: "Empty FeatureCollection" };
    }

    const profile = profileDataset(fc);

    const entry: CacheEntry = {
      data: fc,
      profile,
      source: url,
      description: `GeoJSON from ${new URL(url).hostname}`,
      timestamp: Date.now(),
    };

    await setCache(cacheKey, entry);

    return {
      found: true,
      source: url,
      description: `GeoJSON from ${new URL(url).hostname}, ${fc.features.length} features`,
      featureCount: fc.features.length,
      geometryType: profile.geometryType,
      attributes: profile.attributes.map((a) => a.name),
      cacheKey,
      profile,
    };
  } catch (err) {
    return { found: false, error: err instanceof Error ? err.message : "Fetch failed" };
  }
}

// ─── Unified search ─────────────────────────────────────────

/**
 * Search all available public data sources.
 * Tries World Bank first (fastest for country-level stats),
 * then falls back to direct URL fetch if a URL is provided.
 */
export async function searchPublicData(
  query: string,
  url?: string,
): Promise<DataSearchResult> {
  // Try World Bank (country-level statistics)
  const wbResult = await searchWorldBank(query);
  if (wbResult.found) return wbResult;

  // Try NASA EONET (natural events/disasters)
  const eonetResult = await searchEONET(query);
  if (eonetResult.found) return eonetResult;

  // Try REST Countries (country metadata)
  const rcResult = await searchRESTCountries(query);
  if (rcResult.found) return rcResult;

  // Try direct URL
  if (url) {
    const urlResult = await fetchGeoJSON(url);
    if (urlResult.found) return urlResult;
  }

  return { found: false, error: "No matching public dataset found" };
}
