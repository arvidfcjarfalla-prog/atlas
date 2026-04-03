/**
 * Public data search tool.
 *
 * Fetches and validates GeoJSON/JSON from known public data APIs.
 * Used by the clarification AI via tool use to find datasets
 * that match the user's prompt.
 *
 * Two-layer cache:
 *   L1: In-memory Map (1 hour TTL, instant, volatile on serverless)
 *   L2: Supabase data_cache table (24 hour TTL, survives cold starts)
 *
 * Supported sources:
 * - World Bank API (population, GDP, HDI, etc.)
 * - Direct GeoJSON URLs
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { profileDataset } from "../profiler";
import { getServiceClient } from "../../supabase/service";
import type { DatasetProfile } from "../types";
import type { NormalizedDimension, SourceMetadata } from "./normalized-result";
import type { Json } from "../../supabase/types";
import { resolveWorldBankIndicator } from "./worldbank-indicator-resolver";
import { parseWbJson } from "./worldbank-json";

// ─── Types ──────────────────────────────────────────────────

/** Lightweight subset of NormalizedSourceResult for deterministic manifest generation. */
export interface NormalizedMeta {
  sourceMetadata: SourceMetadata;
  dimensions: NormalizedDimension[];
  candidateMetricFields: string[];
}

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
  /** Translated prompt (used by web research, Data Commons, Eurostat). */
  englishPrompt?: string;
}

// ─── Cache ──────────────────────────────────────────────────

export interface CacheEntry {
  data: GeoJSON.FeatureCollection;
  profile: DatasetProfile;
  source: string;
  description: string;
  timestamp: number;
  /** Pipeline resolution status at cache-write time (absent in legacy entries). */
  resolutionStatus?: "map_ready" | "tabular_only";
  /** Lightweight metadata from the source adapter — used by deterministic manifest generation. */
  normalizedMeta?: NormalizedMeta;
}

// L1: In-memory cache (fast, volatile — survives within a single lambda invocation)
const memoryCache = new Map<string, CacheEntry>();
const MEMORY_TTL_MS = 60 * 60 * 1000; // 1 hour

// L2: Supabase data_cache table (durable — survives serverless cold starts)
const DB_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function readDbCache(key: string): Promise<CacheEntry | null> {
  const client = getServiceClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("data_cache")
      .select("data, profile, source, description, resolution_status, created_at, normalized_meta")
      .eq("cache_key", key)
      .maybeSingle();
    if (error || !data) return null;
    // TTL: 24h from last write (created_at is reset on every upsert)
    if (Date.now() - new Date(data.created_at).getTime() > DB_TTL_MS) return null;
    return {
      data: data.data as unknown as GeoJSON.FeatureCollection,
      profile: data.profile as unknown as DatasetProfile,
      source: data.source,
      description: data.description,
      timestamp: new Date(data.created_at).getTime(),
      resolutionStatus: data.resolution_status as CacheEntry["resolutionStatus"],
      normalizedMeta: (data.normalized_meta as unknown as NormalizedMeta) ?? undefined,
    };
  } catch {
    return null;
  }
}

async function writeDbCache(key: string, entry: CacheEntry): Promise<void> {
  const client = getServiceClient();
  if (!client) return;
  try {
    await client.from("data_cache").upsert(
      {
        cache_key: key,
        data: entry.data as unknown as Json,
        profile: entry.profile as unknown as Json,
        source: entry.source,
        description: entry.description,
        resolution_status: entry.resolutionStatus ?? null,
        normalized_meta: (entry.normalizedMeta as unknown as Json) ?? null,
        // Reset created_at on every upsert so TTL measures time since last
        // refresh, not first insert.
        created_at: new Date().toISOString(),
      },
      { onConflict: "cache_key" },
    );
  } catch {
    // Non-critical — in-memory cache still works for this invocation
  }
}

/**
 * Get cached data by key. Checks L1 (memory) then L2 (Supabase).
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

  // L2: Supabase
  const dbEntry = await readDbCache(key);
  if (dbEntry) {
    // Promote to L1 with fresh timestamp — L2 TTL already validated the entry,
    // so L1 gets a full 1-hour window from this moment.
    const promoted = { ...dbEntry, timestamp: Date.now() };
    memoryCache.set(key, promoted);
    return promoted;
  }

  return null;
}

/**
 * Synchronous L1-only cache check (used by the /api/geo/cached/[key] route
 * for fast serving without async overhead when the entry is already in memory).
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

/** Write to both L1 (memory) and L2 (Supabase). */
export async function setCache(key: string, entry: CacheEntry): Promise<void> {
  // Normalize timestamp so L1 TTL always measures from write time,
  // regardless of what the caller passes.
  const stamped = { ...entry, timestamp: Date.now() };
  memoryCache.set(key, stamped);
  await writeDbCache(key, entry);
}

// ─── World Bank API ─────────────────────────────────────────

const COUNTRIES_GEO_FILE = "geo/global/admin0_110m.geojson";

// ─── Scope detection for server-side filtering ────────────────

/** Country group definitions for sub-regional filtering (ISO 3166-1 alpha-3). */
const COUNTRY_GROUPS: Record<string, Set<string>> = {
  EU: new Set(["AUT","BEL","BGR","HRV","CYP","CZE","DNK","EST","FIN","FRA","DEU","GRC","HUN","IRL","ITA","LVA","LTU","LUX","MLT","NLD","POL","PRT","ROU","SVK","SVN","ESP","SWE"]),
  NORDIC: new Set(["SWE","NOR","DNK","FIN","ISL"]),
  SCANDINAVIA: new Set(["SWE","NOR","DNK"]),
  BALTICS: new Set(["EST","LVA","LTU"]),
  OECD: new Set(["AUS","AUT","BEL","CAN","CHL","COL","CRI","CZE","DNK","EST","FIN","FRA","DEU","GRC","HUN","ISL","IRL","ISR","ITA","JPN","KOR","LVA","LTU","LUX","MEX","NLD","NZL","NOR","POL","PRT","SVK","SVN","ESP","SWE","CHE","TUR","GBR","USA"]),
  WESTERN_EUROPE: new Set(["AUT","BEL","FRA","DEU","IRL","LUX","MCO","NLD","CHE","GBR","LIE"]),
  EASTERN_EUROPE: new Set(["BLR","BGR","CZE","HUN","MDA","POL","ROU","RUS","SVK","UKR"]),
  SOUTHEAST_ASIA: new Set(["BRN","KHM","IDN","LAO","MYS","MMR","PHL","SGP","THA","TLS","VNM"]),
  MIDDLE_EAST: new Set(["BHR","IRN","IRQ","ISR","JOR","KWT","LBN","OMN","PSE","QAT","SAU","SYR","ARE","YEM","TUR"]),
  SUB_SAHARAN_AFRICA: new Set(["AGO","BEN","BWA","BFA","BDI","CPV","CMR","CAF","TCD","COM","COG","COD","CIV","DJI","GNQ","ERI","SWZ","ETH","GAB","GMB","GHA","GIN","GNB","KEN","LSO","LBR","MDG","MWI","MLI","MRT","MUS","MOZ","NAM","NER","NGA","RWA","STP","SEN","SYC","SLE","SOM","ZAF","SSD","SDN","TZA","TGO","UGA","ZMB","ZWE"]),
};

/** Same groups but in ISO 3166-1 alpha-2 / NUTS0 codes (used by Eurostat). */
// Note: Eurostat uses "EL" for Greece (not "GR") and covers EEA (incl. NO, IS, CH, LI).
export const COUNTRY_GROUPS_ISO2: Record<string, Set<string>> = {
  EU: new Set(["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","EL","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE"]),
  NORDIC: new Set(["SE","NO","DK","FI","IS"]),
  SCANDINAVIA: new Set(["SE","NO","DK"]),
  BALTICS: new Set(["EE","LV","LT"]),
  OECD: new Set(["AU","AT","BE","CA","CL","CO","CR","CZ","DK","EE","FI","FR","DE","EL","HU","IS","IE","IL","IT","JP","KR","LV","LT","LU","MX","NL","NZ","NO","PL","PT","SK","SI","ES","SE","CH","TR","UK","US"]),
  WESTERN_EUROPE: new Set(["AT","BE","FR","DE","IE","LU","NL","CH","LI","UK"]),
  EASTERN_EUROPE: new Set(["BG","CZ","HU","PL","RO","SK","UA"]),
};

const EU_WORD_RE = /\beu\b/;

/** Scope keyword checks — order matters (specific before broad). */
const SCOPE_CHECKS: { keywords: string[]; regex?: RegExp; key: string }[] = [
  { keywords: ["sub-saharan", "sub saharan"], key: "SUB_SAHARAN_AFRICA" },
  { keywords: ["southeast asia", "south-east asia", "sydostasien", "südostasien"], key: "SOUTHEAST_ASIA" },
  { keywords: ["western europe", "västeuropa"], key: "WESTERN_EUROPE" },
  { keywords: ["eastern europe", "östeuropa"], key: "EASTERN_EUROPE" },
  { keywords: ["middle east", "mellanöstern", "midtøsten"], key: "MIDDLE_EAST" },
  { keywords: ["scandinavia", "skandinavien"], key: "SCANDINAVIA" },
  { keywords: ["nordic", "norden"], key: "NORDIC" },
  { keywords: ["baltic", "baltikum", "baltiske"], key: "BALTICS" },
  { keywords: ["oecd"], key: "OECD" },
  { keywords: ["european union", "europeiska unionen", "eu-"], regex: EU_WORD_RE, key: "EU" },
];

/** Detect a country group scope from a query string. Returns ISO3 set or null. */
export function detectScope(query: string): { key: string; countries: Set<string> } | null {
  const lower = query.toLowerCase();
  for (const { keywords, regex, key } of SCOPE_CHECKS) {
    if (keywords.some((kw) => lower.includes(kw)) || regex?.test(lower)) {
      return { key, countries: COUNTRY_GROUPS[key] };
    }
  }
  // Continent-level: return null (no filtering — too broad to be useful)
  return null;
}

/** ISO 3166-1 alpha-3 → continent mapping for World Bank data filtering. */
const ISO_TO_CONTINENT: Record<string, string> = {
  // Europe
  ALB:"Europe",AND:"Europe",AUT:"Europe",BLR:"Europe",BEL:"Europe",BIH:"Europe",
  BGR:"Europe",HRV:"Europe",CYP:"Europe",CZE:"Europe",DNK:"Europe",EST:"Europe",
  FIN:"Europe",FRA:"Europe",DEU:"Europe",GRC:"Europe",HUN:"Europe",ISL:"Europe",
  IRL:"Europe",ITA:"Europe",XKX:"Europe",LVA:"Europe",LIE:"Europe",LTU:"Europe",
  LUX:"Europe",MLT:"Europe",MDA:"Europe",MCO:"Europe",MNE:"Europe",NLD:"Europe",
  MKD:"Europe",NOR:"Europe",POL:"Europe",PRT:"Europe",ROU:"Europe",RUS:"Europe",
  SMR:"Europe",SRB:"Europe",SVK:"Europe",SVN:"Europe",ESP:"Europe",SWE:"Europe",
  CHE:"Europe",UKR:"Europe",GBR:"Europe",VAT:"Europe",
  // Africa
  DZA:"Africa",AGO:"Africa",BEN:"Africa",BWA:"Africa",BFA:"Africa",BDI:"Africa",
  CPV:"Africa",CMR:"Africa",CAF:"Africa",TCD:"Africa",COM:"Africa",COG:"Africa",
  COD:"Africa",CIV:"Africa",DJI:"Africa",EGY:"Africa",GNQ:"Africa",ERI:"Africa",
  SWZ:"Africa",ETH:"Africa",GAB:"Africa",GMB:"Africa",GHA:"Africa",GIN:"Africa",
  GNB:"Africa",KEN:"Africa",LSO:"Africa",LBR:"Africa",LBY:"Africa",MDG:"Africa",
  MWI:"Africa",MLI:"Africa",MRT:"Africa",MUS:"Africa",MAR:"Africa",MOZ:"Africa",
  NAM:"Africa",NER:"Africa",NGA:"Africa",RWA:"Africa",STP:"Africa",SEN:"Africa",
  SYC:"Africa",SLE:"Africa",SOM:"Africa",ZAF:"Africa",SSD:"Africa",SDN:"Africa",
  TZA:"Africa",TGO:"Africa",TUN:"Africa",UGA:"Africa",ZMB:"Africa",ZWE:"Africa",
  // Asia
  AFG:"Asia",ARM:"Asia",AZE:"Asia",BHR:"Asia",BGD:"Asia",BTN:"Asia",BRN:"Asia",
  KHM:"Asia",CHN:"Asia",GEO:"Asia",IND:"Asia",IDN:"Asia",IRN:"Asia",IRQ:"Asia",
  ISR:"Asia",JPN:"Asia",JOR:"Asia",KAZ:"Asia",KWT:"Asia",KGZ:"Asia",LAO:"Asia",
  LBN:"Asia",MYS:"Asia",MDV:"Asia",MNG:"Asia",MMR:"Asia",NPL:"Asia",PRK:"Asia",
  OMN:"Asia",PAK:"Asia",PSE:"Asia",PHL:"Asia",QAT:"Asia",SAU:"Asia",SGP:"Asia",
  KOR:"Asia",LKA:"Asia",SYR:"Asia",TWN:"Asia",TJK:"Asia",THA:"Asia",TLS:"Asia",
  TUR:"Asia",TKM:"Asia",ARE:"Asia",UZB:"Asia",VNM:"Asia",YEM:"Asia",
  // North America
  ATG:"North America",BHS:"North America",BRB:"North America",BLZ:"North America",
  CAN:"North America",CRI:"North America",CUB:"North America",DMA:"North America",
  DOM:"North America",SLV:"North America",GRD:"North America",GTM:"North America",
  HTI:"North America",HND:"North America",JAM:"North America",MEX:"North America",
  NIC:"North America",PAN:"North America",KNA:"North America",LCA:"North America",
  VCT:"North America",TTO:"North America",USA:"North America",
  // South America
  ARG:"South America",BOL:"South America",BRA:"South America",CHL:"South America",
  COL:"South America",ECU:"South America",GUY:"South America",PRY:"South America",
  PER:"South America",SUR:"South America",URY:"South America",VEN:"South America",
  // Oceania
  AUS:"Oceania",FJI:"Oceania",KIR:"Oceania",MHL:"Oceania",FSM:"Oceania",
  NRU:"Oceania",NZL:"Oceania",PLW:"Oceania",PNG:"Oceania",WSM:"Oceania",
  SLB:"Oceania",TON:"Oceania",TUV:"Oceania",VUT:"Oceania",
};

let countriesGeoCache: GeoJSON.FeatureCollection | null = null;

async function loadCountryGeometry(): Promise<GeoJSON.FeatureCollection | null> {
  if (countriesGeoCache) return countriesGeoCache;
  try {
    const filePath = join(process.cwd(), "public", COUNTRIES_GEO_FILE);
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    if (data?.type === "FeatureCollection" && Array.isArray(data.features)) {
      countriesGeoCache = data as GeoJSON.FeatureCollection;
      return countriesGeoCache;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Search World Bank API for a matching indicator.
 * Returns country-level data joined with local Natural Earth geometries.
 *
 * Uses keyword matching first (fast, no AI call), then AI intent extraction
 * as fallback for non-English prompts.
 *
 * Skips if the prompt explicitly asks for sub-national data (e.g. "US states")
 * since World Bank only provides country-level statistics.
 */
export async function searchWorldBank(query: string): Promise<DataSearchResult> {
  const lower = query.toLowerCase();
  const resolved = await resolveWorldBankIndicator(query, { allowAiFallback: true });
  if (!resolved.isCountryLevel) {
    return { found: false, error: "World Bank only has country-level data; prompt asks for sub-national" };
  }
  const matched = resolved.indicator;

  if (!matched) {
    return { found: false, error: "No matching World Bank indicator found" };
  }

  // Reject known false-positive indicator matches — the AI fallback
  // can map semantically wrong prompts to related-but-incorrect indicators
  // (e.g. "deforestation" → forest area, "healthcare spending" → total GDP).
  const INDICATOR_BLACKLIST: Record<string, string[]> = {
    "AG.LND.FRST.ZS": ["deforestation", "forest loss", "wildfire", "fire", "bränder", "skogsbrand", "avskogning"],
    "NY.GDP.MKTP.CD": ["healthcare", "health spending", "education spending", "military spending", "research spending", "r&d", "forskning", "sjukvård", "hälsa"],
    // Crude death rate (all ages) must not match child/infant/neonatal mortality queries
    "SP.DYN.CDRT.IN": ["child mortality", "under-5", "infant mortality", "neonatal", "barnmortalitet", "barnadödlighet", "spädbarnsdödlighet"],
    // Child mortality must not match crude death rate queries
    "SH.DYN.MORT": ["death rate", "crude death", "dödstal"],
  };
  const blacklistTerms = INDICATOR_BLACKLIST[matched.code];
  if (blacklistTerms?.some((term) => lower.includes(term))) {
    return { found: false, error: "Indicator does not match user intent" };
  }

  // Detect sub-regional scope for server-side filtering
  const scope = detectScope(query);
  const cacheKey = scope
    ? `worldbank-${matched.code}-${scope.key.toLowerCase()}`
    : `worldbank-${matched.code}`;
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

    const json = await parseWbJson(res);
    const parsed = Array.isArray(json) ? json : [];
    const records = parsed[1] as Array<{
      country: { id: string; value: string };
      countryiso3code: string;
      value: number | null;
      date: string;
    }> | undefined;

    if (!records || records.length === 0) {
      return { found: false, error: "No data returned from World Bank" };
    }

    // Load local country geometries
    const geoData = await loadCountryGeometry();
    if (!geoData) return { found: false, error: `Country geometry not found: ${COUNTRIES_GEO_FILE}` };

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
            continent: ISO_TO_CONTINENT[iso as string] ?? "",
            [matched!.code]: data.value,
            value: data.value,
            year: data.date,
          },
        };
      });

    // Apply sub-regional scope filter (EU, Nordic, OECD, etc.)
    const filtered = scope
      ? features.filter((f) => scope.countries.has(f.properties?.iso_a3 as string))
      : features;

    if (filtered.length === 0) {
      return { found: false, error: "No countries matched between World Bank and geometry data" };
    }

    const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: filtered };
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
      description: `${matched.label} by country (${matched.unit}), ${filtered.length} countries${scope ? ` (${scope.key})` : ""}`,
      featureCount: filtered.length,
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
          coordinates: unknown;
          magnitudeValue?: number;
          magnitudeUnit?: string;
        }>;
      }>;
    };

    if (!json.events || json.events.length === 0) {
      return { found: false, error: "No active events found" };
    }

    // Use latest geometry entry for each event, preserving the actual geometry type
    const features: GeoJSON.Feature[] = json.events
      .filter((e) => e.geometry.length > 0)
      .map((e) => {
        const latest = e.geometry[e.geometry.length - 1];
        const geomType = latest.type ?? "Point";
        return {
          type: "Feature" as const,
          geometry: {
            type: geomType,
            coordinates: latest.coordinates,
          } as GeoJSON.Geometry,
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

// ─── Numeric data check ─────────────────────────────────────

/** Property names that are administrative metadata, not data. */
const METADATA_PROPS = new Set([
  "name", "shapename", "shapeiso", "shapeid", "shapegroup", "shapetype",
  "iso_a2", "iso_a3", "iso_3166_2", "admin", "id", "fid", "objectid",
  "type", "code", "level", "boundary",
  // CartoDB / database IDs
  "cartodb_id", "gid", "ogc_fid",
  // Common admin code fields
  "codigo_ibg", "codigo_ibge", "cod_ibge", "geocodigo",
  "hasc", "iso", "iso_code",
]);

/** Patterns for property names that are metadata, not data. */
const METADATA_SUFFIXES = ["_id", "_code", "_iso", "_fid"];

/**
 * Check if a property name looks like administrative metadata.
 */
function isMetadataKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (METADATA_PROPS.has(lower)) return true;
  for (const suffix of METADATA_SUFFIXES) {
    if (lower.endsWith(suffix)) return true;
  }
  return false;
}

/**
 * Check if a FeatureCollection has at least one numeric data property
 * (not just boundary metadata like shapeName, shapeISO, ids, codes, etc.).
 *
 * Samples up to 5 features. Returns false for geometry-only datasets.
 */
export function hasNumericProperties(fc: GeoJSON.FeatureCollection): boolean {
  const sample = fc.features.slice(0, 5);
  for (const feature of sample) {
    const props = feature.properties;
    if (!props) continue;
    for (const [key, value] of Object.entries(props)) {
      if (isMetadataKey(key)) continue;
      if (typeof value === "number" && isFinite(value)) return true;
    }
  }
  return false;
}

/**
 * Return true when a FeatureCollection is worth serving as a map layer.
 *
 * Statistical data requires numeric properties (choropleth / proportional symbol).
 * Point-of-interest data (landmarks, locations, etc.) is valid with only string
 * properties — the user just wants to see where things are, not compare values.
 *
 * A dataset is usable when:
 *   - It has numeric properties (statistical/metric data), OR
 *   - All sampled features have Point geometry and at least one non-metadata
 *     string property (name, title, description, etc.)
 */
export function isUsableDataset(fc: GeoJSON.FeatureCollection): boolean {
  if (fc.features.length === 0) return false;
  if (hasNumericProperties(fc)) return true;

  // Accept pure point datasets with at least one named property
  const sample = fc.features.slice(0, 5);
  const allPoints = sample.every(
    (f) => f.geometry?.type === "Point" || f.geometry?.type === "MultiPoint",
  );
  if (!allPoints) {
    // Accept polygon/multipolygon data with categorical/name fields
    // (e.g. historical boundaries, empire extents, land use zones)
    const allPolygons = sample.every(
      (f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon",
    );
    if (allPolygons) {
      return sample.some((f) => {
        if (!f.properties) return false;
        return Object.entries(f.properties).some(
          ([k, v]) => !isMetadataKey(k) && typeof v === "string" && v.length > 0,
        );
      });
    }
    return false;
  }

  const NAME_KEYS = /^(name|title|label|description|site|place|location|monument|wonder|heritage)/i;
  return sample.some((f) => {
    const props = f.properties;
    if (!props) return false;
    return Object.entries(props).some(
      ([k, v]) => typeof v === "string" && v.length > 0 && !isMetadataKey(k) && NAME_KEYS.test(k),
    );
  });
}

// ─── Direct URL fetch ───────────────────────────────────────

/**
 * Fetch a URL and try to parse it as GeoJSON.
 */
export async function fetchGeoJSON(
  url: string,
  options?: { requireNumericData?: boolean },
): Promise<DataSearchResult> {
  const cacheKey = `url-${url}`;
  const cached = await getCachedData(cacheKey);
  if (cached) {
    // Reject cached boundary-only data when numeric data is required
    if (options?.requireNumericData && !hasNumericProperties(cached.data)) {
      return { found: false, error: "Cached data has no numeric properties (boundary-only)" };
    }
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

    // Reject boundary-only GeoJSON when numeric data is required
    if (options?.requireNumericData && !hasNumericProperties(fc)) {
      return { found: false, error: "GeoJSON has no numeric properties (boundary-only)" };
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
 * Tries EONET first (natural events are unambiguous — wildfires, earthquakes),
 * then World Bank (country-level stats), then REST Countries.
 */
export async function searchPublicData(
  query: string,
  url?: string,
): Promise<DataSearchResult> {
  // Try NASA EONET first (natural events/disasters) — prevents World Bank
  // AI fallback from matching "wildfires" → forest area, etc.
  const eonetResult = await searchEONET(query);
  if (eonetResult.found) return eonetResult;

  // Try World Bank (country-level statistics)
  const wbResult = await searchWorldBank(query);
  if (wbResult.found) return wbResult;

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
