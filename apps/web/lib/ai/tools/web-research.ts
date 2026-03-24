/**
 * Web research tool.
 *
 * Handles free-text prompts that require web search to find geographic data.
 * Uses a 3-step pipeline:
 *
 * 1. **Haiku** generates search queries (~$0.001)
 * 2. **Playwright** scrapes top results (free)
 * 3. **Haiku** extracts structured geographic data (~$0.002)
 *
 * Total cost: ~$0.003 per search. Compare to Sonnet+web_search: ~$0.05-0.10.
 *
 * Supports 4 visualization types:
 * - points: stores, people, landmarks
 * - route: journeys, tours, expeditions
 * - regions: countries, territories
 * - flow: origin→destination connections
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { profileDataset } from "../profiler";
import {
  getCachedData,
  setCache,
  type DataSearchResult,
  type CacheEntry,
} from "./data-search";

// ─── Constants ──────────────────────────────────────────────

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const MAX_FEATURES = 50;
const PHOTON_TIMEOUT_MS = 3_000;
const SCRAPE_TIMEOUT_MS = 8_000;
const MAX_TEXT_PER_PAGE = 6_000;
const CACHE_PREFIX = "webres-";

// ─── Types ──────────────────────────────────────────────────

type VisualizationType = "points" | "route" | "regions" | "flow";

interface RawFeature {
  name: string;
  location: string;
  country?: string;
  category?: string;
  description?: string;
  order?: number;
  value?: number;
  destination?: string;
  destinationCountry?: string;
}

interface GeocodedFeature extends RawFeature {
  lat: number;
  lng: number;
}

interface ExtractedData {
  visualization: VisualizationType;
  features: RawFeature[];
  summary: string;
}

// ─── Coordinate validation ──────────────────────────────────

export function isValidCoord(
  lat: number | null | undefined,
  lng: number | null | undefined,
): boolean {
  if (lat == null || lng == null) return false;
  if (!isFinite(lat) || !isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

// ─── Negative filter ────────────────────────────────────────

const METRIC_TERMS = [
  "population", "gdp", "unemployment", "inflation", "poverty", "gini",
  "mortality", "fertility", "literacy", "emissions", "co2", "hdi",
  "life expectancy", "birth rate", "death rate", "trade",
  "renewable energy", "forest area", "internet users",
  "military spending", "education spending", "healthcare spending",
  "befolkning", "arbetslöshet", "livslängd", "medellivslängd",
  "fattigdom", "utsläpp", "dödstal", "födelsetal",
  "dataset", "geojson", "csv", "data file", "data source", "download",
];

const METRIC_PATTERNS = /\b(per capita|per 100k|percentage|\w+ rate|index|density)\b/i;

export function shouldSkipWebResearch(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  if (METRIC_PATTERNS.test(lower)) return true;
  if (METRIC_TERMS.some((term) => lower.includes(term))) return true;
  return false;
}

// ─── Photon geocoding ───────────────────────────────────────

async function geocodeWithPhoton(
  query: string,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(PHOTON_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data.features?.[0]?.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;
    const [lng, lat] = coords as [number, number];
    if (!isValidCoord(lat, lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

async function geocodeEntity(
  entity: RawFeature,
): Promise<{ lat: number; lng: number } | null> {
  const country = entity.country ?? "";
  const specific = `${entity.name} ${entity.location} ${country}`.trim();
  const result = await geocodeWithPhoton(specific);
  if (result) return result;

  const broader = `${entity.location} ${country}`.trim();
  return geocodeWithPhoton(broader);
}

// ─── Batched geocoding ──────────────────────────────────────

/** Process Photon geocode calls in batches to avoid unbounded concurrency. */
async function batchGeocodePhoton(
  keys: string[],
  batchSize = 10,
): Promise<Map<string, [number, number]>> {
  const results = new Map<string, [number, number]>();
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    const coords = await Promise.all(batch.map((k) => geocodeWithPhoton(k)));
    batch.forEach((k, j) => {
      const c = coords[j];
      if (c) results.set(k, [c.lng, c.lat]);
    });
  }
  return results;
}

/** Geocode a list of RawFeature entities in batches of 10. */
async function batchGeocodeEntities(
  features: RawFeature[],
  batchSize = 10,
): Promise<({ lat: number; lng: number } | null)[]> {
  const results: ({ lat: number; lng: number } | null)[] = new Array(features.length).fill(null);
  for (let i = 0; i < features.length; i += batchSize) {
    const batch = features.slice(i, i + batchSize);
    const coords = await Promise.all(batch.map((f) => geocodeEntity(f)));
    coords.forEach((c, j) => { results[i + j] = c; });
  }
  return results;
}

// ─── GeoJSON builders ───────────────────────────────────────

export function buildPointsGeoJSON(
  entities: GeocodedFeature[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: entities.map((e) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [e.lng, e.lat] },
      properties: {
        name: e.name,
        location: e.location,
        ...(e.country && { country: e.country }),
        ...(e.category && { category: e.category }),
        ...(e.description && { description: e.description }),
        ...(e.value != null && { value: e.value }),
        _source: "web-research",
      },
    })),
  };
}

export function buildRouteGeoJSON(
  entities: GeocodedFeature[],
): GeoJSON.FeatureCollection {
  const sorted = [...entities].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const features: GeoJSON.Feature[] = [];

  if (sorted.length >= 2) {
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: sorted.map((e) => [e.lng, e.lat]),
      },
      properties: { name: "Route", _type: "route-line", _source: "web-research" },
    });
  }

  for (const e of sorted) {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [e.lng, e.lat] },
      properties: {
        name: e.name,
        location: e.location,
        _stop_number: e.order ?? 0,
        ...(e.country && { country: e.country }),
        ...(e.category && { category: e.category }),
        ...(e.description && { description: e.description }),
        _source: "web-research",
      },
    });
  }

  return { type: "FeatureCollection", features };
}

let _countryGeoCache: GeoJSON.FeatureCollection | null = null;

async function loadCountryGeo(): Promise<GeoJSON.FeatureCollection | null> {
  if (_countryGeoCache) return _countryGeoCache;
  try {
    const filePath = join(process.cwd(), "public", "geo", "global", "admin0_110m.geojson");
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    if (data?.type === "FeatureCollection") {
      _countryGeoCache = data as GeoJSON.FeatureCollection;
      return _countryGeoCache;
    }
    return null;
  } catch {
    return null;
  }
}

export async function buildRegionsGeoJSON(
  features: RawFeature[],
): Promise<GeoJSON.FeatureCollection> {
  const geo = await loadCountryGeo();
  if (!geo) return { type: "FeatureCollection", features: [] };

  const result: GeoJSON.Feature[] = [];
  for (const entity of features) {
    const name = entity.location.toLowerCase();
    const country = entity.country?.toLowerCase() ?? name;

    const match = geo.features.find((f) => {
      const p = f.properties ?? {};
      const candidates = [
        p.NAME, p.NAME_LONG, p.ADMIN, p.SOVEREIGNT,
        p.ISO_A2, p.ISO_A3, p.ISO_A2_EH, p.ISO_A3_EH,
      ].filter(Boolean).map((v: string) => v.toLowerCase());
      return candidates.includes(name) || candidates.includes(country);
    });

    if (match) {
      result.push({
        type: "Feature",
        geometry: match.geometry,
        properties: {
          name: match.properties?.NAME ?? entity.location,
          ...(entity.category && { category: entity.category }),
          ...(entity.description && { description: entity.description }),
          ...(entity.value != null && { _atlas_value: entity.value }),
          _source: "web-research",
        },
      });
    }
  }

  return { type: "FeatureCollection", features: result };
}

export async function buildFlowGeoJSON(
  features: RawFeature[],
): Promise<GeoJSON.FeatureCollection> {
  const locationSet = new Map<string, string>();
  for (const f of features) {
    const originKey = `${f.location} ${f.country ?? ""}`.trim();
    locationSet.set(originKey, originKey);
    if (f.destination) {
      const destKey = `${f.destination} ${f.destinationCountry ?? ""}`.trim();
      locationSet.set(destKey, destKey);
    }
  }

  const keys = [...locationSet.keys()];
  const batchResults = await batchGeocodePhoton(keys);
  const coordMap = new Map<string, { lat: number; lng: number }>();
  for (const [k, [lng, lat]] of batchResults) {
    coordMap.set(k, { lat, lng });
  }

  const result: GeoJSON.Feature[] = [];
  for (const f of features) {
    const originKey = `${f.location} ${f.country ?? ""}`.trim();
    const origin = coordMap.get(originKey);
    if (!origin) continue;

    if (f.destination) {
      const destKey = `${f.destination} ${f.destinationCountry ?? ""}`.trim();
      const dest = coordMap.get(destKey);
      if (!dest) continue;

      result.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [[origin.lng, origin.lat], [dest.lng, dest.lat]],
        },
        properties: {
          name: f.name,
          origin: f.location,
          destination: f.destination,
          ...(f.value != null && { weight: f.value }),
          ...(f.category && { category: f.category }),
          _source: "web-research",
        },
      });
    }
  }

  return { type: "FeatureCollection", features: result };
}

// ─── Web scraper (fetch-based, no browser dependency) ───────

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Strip HTML tags and collapse whitespace. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract result URLs from DuckDuckGo HTML search page. */
function extractDDGLinks(html: string): string[] {
  const links: string[] = [];
  const regex = /href="(https?:\/\/[^"]+)"/g;
  const resultSection = html.split('class="results"')[1] ?? html;
  let match;
  while ((match = regex.exec(resultSection)) !== null) {
    const url = match[1];
    // Skip DDG internal links
    if (url.includes("duckduckgo.com")) continue;
    if (url.includes("duck.co")) continue;
    if (!links.includes(url)) links.push(url);
    if (links.length >= 5) break;
  }
  return links;
}

/**
 * Search DuckDuckGo and fetch text from top results.
 * Pure fetch — no browser, works in serverless.
 */
async function scrapeSearchResults(
  queries: string[],
  maxPages = 3,
): Promise<string> {
  const results: string[] = [];
  const visited = new Set<string>();

  for (const query of queries) {
    if (results.length >= maxPages) break;

    try {
      // Search DuckDuckGo HTML (no JS required)
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const searchRes = await fetch(searchUrl, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
      });
      if (!searchRes.ok) continue;
      const searchHtml = await searchRes.text();
      const links = extractDDGLinks(searchHtml);

      // Fetch top result pages
      for (const link of links) {
        if (results.length >= maxPages) break;
        if (visited.has(link)) continue;
        visited.add(link);

        try {
          const pageRes = await fetch(link, {
            headers: { "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
          });
          if (!pageRes.ok) continue;
          const contentType = pageRes.headers.get("content-type") ?? "";
          if (!contentType.includes("html")) continue;

          const html = await pageRes.text();
          const text = htmlToText(html);
          if (text.length > 100) {
            results.push(text.slice(0, MAX_TEXT_PER_PAGE));
          }
        } catch {
          // Page failed — skip
        }
      }
    } catch {
      // Search failed — try next query
    }
  }

  return results.join("\n\n---\n\n");
}

// ─── Haiku: generate search queries ─────────────────────────

async function generateSearchQueries(
  client: Anthropic,
  prompt: string,
): Promise<string[]> {
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 200,
    system: `Generate 2-3 web search queries to find geographic/location data for the user's request. Return ONLY the queries, one per line. No numbering, no explanation.`,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 5)
    .slice(0, 3);
}

// ─── Haiku: extract geographic data ─────────────────────────

const EXTRACT_SYSTEM = `You are a geographic data extractor. Given web page text, extract geographic entities for map visualization.

## Visualization types
- **points**: Individual locations (stores, people, events, landmarks)
- **route**: Ordered journey/path (tour dates, expedition, road trip)
- **regions**: Named countries/territories/areas
- **flow**: Origin→destination connections (trade routes, flights)

## Rules
- Choose the best visualization type for the data
- For routes: include \`order\` (1, 2, 3...) for sequence
- For flows: include \`destination\` and \`destinationCountry\`
- For regions: \`location\` = country/region name
- For points: most specific location possible (venue > city)
- Set \`country\` for every feature
- Only extract data actually present in the text
- Call extract_geographic_data with results`;

const EXTRACT_TOOL: Anthropic.Tool = {
  name: "extract_geographic_data",
  description: "Return structured geographic data extracted from web page text.",
  input_schema: {
    type: "object" as const,
    properties: {
      visualization: {
        type: "string",
        enum: ["points", "route", "regions", "flow"],
      },
      features: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            location: { type: "string" },
            country: { type: "string" },
            category: { type: "string" },
            description: { type: "string" },
            order: { type: "number" },
            value: { type: "number" },
            destination: { type: "string" },
            destinationCountry: { type: "string" },
          },
          required: ["name", "location"],
        },
      },
      summary: { type: "string" },
    },
    required: ["visualization", "features"],
  },
};

function extractGeoData(response: Anthropic.Message): ExtractedData | null {
  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "extract_geographic_data") {
      const input = block.input as {
        visualization?: string;
        features?: RawFeature[];
        summary?: string;
      };
      if (Array.isArray(input.features)) {
        return {
          visualization: (input.visualization as VisualizationType) ?? "points",
          features: input.features.slice(0, MAX_FEATURES),
          summary: input.summary ?? "",
        };
      }
    }
  }
  return null;
}

// ─── Main search function ───────────────────────────────────

export async function searchWebResearch(
  query: string,
): Promise<DataSearchResult & { englishPrompt?: string }> {
  if (shouldSkipWebResearch(query)) {
    return { found: false };
  }

  const hash = createHash("md5")
    .update(query.toLowerCase().trim())
    .digest("hex")
    .slice(0, 12);
  const cacheKey = `${CACHE_PREFIX}${hash}`;

  const cached = await getCachedData(cacheKey);
  if (cached) {
    return {
      found: true,
      source: cached.source,
      description: cached.description,
      featureCount: cached.data.features.length,
      geometryType: cached.profile.geometryType,
      cacheKey,
      profile: cached.profile,
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { found: false };

  const client = new Anthropic({ apiKey });

  // Step 1: Haiku generates search queries (~200ms, $0.001)
  console.log(`[web-research] generating queries for: "${query.slice(0, 60)}"`);
  const searchQueries = await generateSearchQueries(client, query);
  if (searchQueries.length === 0) return { found: false };
  console.log(`[web-research] queries: ${searchQueries.join(" | ")}`);

  // Step 2: Playwright scrapes results (~3-5s, free)
  let scrapedText: string;
  try {
    scrapedText = await scrapeSearchResults(searchQueries);
  } catch (err) {
    console.log(`[web-research] scraping failed:`, err);
    return { found: false };
  }

  if (scrapedText.length < 100) {
    console.log(`[web-research] insufficient scraped text (${scrapedText.length} chars)`);
    return { found: false };
  }
  console.log(`[web-research] scraped ${scrapedText.length} chars from web`);

  // Step 3: Haiku extracts structured data (~300ms, $0.002)
  const extractResponse = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 4096,
    system: EXTRACT_SYSTEM,
    messages: [
      {
        role: "user",
        content: `User's question: ${query}\n\n---\n\nWeb page content:\n${scrapedText}`,
      },
    ],
    tools: [EXTRACT_TOOL],
  });

  const extracted = extractGeoData(extractResponse);

  if (!extracted || extracted.features.length === 0) {
    console.log(`[web-research] no features extracted from text`);
    return { found: false };
  }
  console.log(`[web-research] extracted ${extracted.features.length} features, viz=${extracted.visualization}`);

  // Step 4: Build GeoJSON based on visualization type
  let fc: GeoJSON.FeatureCollection;

  switch (extracted.visualization) {
    case "regions":
      fc = await buildRegionsGeoJSON(extracted.features);
      break;

    case "flow":
      fc = await buildFlowGeoJSON(extracted.features);
      break;

    case "route":
    case "points":
    default: {
      const geocodeResults = await batchGeocodeEntities(extracted.features);
      const geocoded: GeocodedFeature[] = [];
      for (let i = 0; i < extracted.features.length; i++) {
        const coords = geocodeResults[i];
        if (coords) {
          geocoded.push({ ...extracted.features[i], ...coords });
        }
      }
      if (geocoded.length === 0) {
        return { found: false, error: "No features could be geocoded" };
      }
      fc =
        extracted.visualization === "route"
          ? buildRouteGeoJSON(geocoded)
          : buildPointsGeoJSON(geocoded);
      break;
    }
  }

  if (fc.features.length === 0) {
    return { found: false, error: "No geographic features could be resolved" };
  }

  // Step 5: Profile + cache
  const profile = profileDataset(fc);

  const entry: CacheEntry = {
    data: fc,
    profile,
    source: "web-research",
    description: extracted.summary || `Web research: ${query}`,
    timestamp: Date.now(),
  };

  await setCache(cacheKey, entry);

  return {
    found: true,
    source: "web-research",
    description: entry.description,
    featureCount: fc.features.length,
    geometryType: profile.geometryType,
    cacheKey,
    profile,
  };
}

// Re-export for backwards compatibility with tests
export const buildEntityGeoJSON = buildPointsGeoJSON;
