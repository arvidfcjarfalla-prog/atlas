/**
 * Web dataset search tool.
 *
 * When the internal catalog and public API search fail to find data,
 * this module uses Claude with web search to discover real datasets
 * on the internet, then fetches, validates, converts, and caches them.
 *
 * Supports GeoJSON and CSV (auto-converted to GeoJSON).
 * Never invents or hallucinates URLs — only uses real web search results.
 */

import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { profileDataset } from "../profiler";
import {
  getCachedData,
  setCache,
  fetchGeoJSON,
  hasNumericProperties,
  isUsableDataset,
  type DataSearchResult,
  type CacheEntry,
} from "./data-search";
import {
  extractIntent,
  buildSearchQuery,
  registerDataset,
  type DatasetIntent,
} from "./dataset-registry";
import { csvToGeoFeatures } from "../csv-geo-resolver";

// ─── Constants ──────────────────────────────────────────────

const SEARCH_MODEL = "claude-haiku-4-5-20251001";
const MAX_CANDIDATES = 3;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_CSV_ROWS = 10_000;
const MAX_GEOJSON_FEATURES = 50_000;

/**
 * Country name → ISO2 code lookup.
 * Covers countries with static admin1 geometry in public/geo/.
 * Used to pass country hints when joining CSVs to subnational geometry.
 */
const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  brazil: "BR", brasil: "BR",
  germany: "DE", deutschland: "DE", tyskland: "DE",
  france: "FR", frankrike: "FR",
  india: "IN", indien: "IN",
  japan: "JP",
  mexico: "MX",
  australia: "AU", australien: "AU",
  canada: "CA", kanada: "CA",
  china: "CN", kina: "CN",
  spain: "ES", spanien: "ES", españa: "ES",
  italy: "IT", italien: "IT", italia: "IT",
  indonesia: "ID", indonesien: "ID",
  nigeria: "NG",
  "south africa": "ZA", sydafrika: "ZA",
  "united states": "US", usa: "US",
  "united kingdom": "GB", uk: "GB", storbritannien: "GB",
  sweden: "SE", sverige: "SE",
  norway: "NO", norge: "NO",
  finland: "FI",
  denmark: "DK", danmark: "DK",
  netherlands: "NL", holland: "NL", nederländerna: "NL",
  poland: "PL", polen: "PL",
  turkey: "TR", turkiet: "TR", türkiye: "TR",
  argentina: "AR",
  colombia: "CO",
  thailand: "TH",
};

/**
 * Extract ISO2 country code from a query string.
 */
function extractCountryCode(query: string): string | undefined {
  const lower = query.toLowerCase();
  for (const [name, code] of Object.entries(COUNTRY_NAME_TO_ISO2)) {
    if (lower.includes(name)) return code;
  }
  return undefined;
}

const ALLOWED_DOMAINS = [
  "data.gov",
  "data.humdata.org",
  "github.com",
  "raw.githubusercontent.com",
  "gist.githubusercontent.com",
  "opendata.arcgis.com",
  "data.worldbank.org",
  "data.un.org",
  "datahub.io",
  "catalog.data.gov",
  "data.europa.eu",
  "naturalearthdata.com",
  "ourworldindata.org",
  "earthquake.usgs.gov",
  "data.cityofnewyork.us",
  "data.sfgov.org",
  "opendata.dc.gov",
];

// ─── Types ──────────────────────────────────────────────────

interface WebDatasetCandidate {
  datasetName: string;
  url: string;
  format: "geojson" | "csv" | "api";
  metricField?: string;
  geographyField?: string;
}

// ─── CSV parsing ────────────────────────────────────────────

/**
 * Detect delimiter by checking first line for tab, semicolon, or comma.
 */
function detectDelimiter(firstLine: string): string {
  if (firstLine.includes("\t")) return "\t";
  if (firstLine.includes(";")) return ";";
  return ",";
}

/**
 * Parse a single CSV line respecting quoted fields.
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Parse CSV text into an array of header-keyed objects.
 * Caps at MAX_CSV_ROWS to prevent memory issues.
 */
export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCSVLine(lines[0], delimiter);
  const rows: Record<string, string>[] = [];

  const limit = Math.min(lines.length, MAX_CSV_ROWS + 1);
  for (let i = 1; i < limit; i++) {
    const values = parseCSVLine(lines[i], delimiter);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? "";
    }
    rows.push(row);
  }

  return rows;
}

// ─── Column detection ───────────────────────────────────────

const LAT_PATTERNS = ["lat", "latitude", "y", "lat_dd", "decimallatitude"];
const LNG_PATTERNS = ["lng", "lon", "long", "longitude", "x", "lng_dd", "decimallongitude"];

/**
 * Detect latitude/longitude column names from CSV headers.
 */
export function detectLatLngColumns(
  headers: string[],
): { lat: string; lng: string } | null {
  const lower = headers.map((h) => h.toLowerCase());

  let latCol: string | null = null;
  let lngCol: string | null = null;

  for (let i = 0; i < headers.length; i++) {
    if (!latCol && LAT_PATTERNS.includes(lower[i])) latCol = headers[i];
    if (!lngCol && LNG_PATTERNS.includes(lower[i])) lngCol = headers[i];
  }

  if (latCol && lngCol) return { lat: latCol, lng: lngCol };
  return null;
}

const ISO3_PATTERNS = ["iso3", "iso_a3", "iso3code", "country_code_iso3", "iso_alpha3", "cca3"];
const ISO2_PATTERNS = ["iso2", "iso_a2", "iso2code", "country_code", "iso_alpha2", "cca2"];
const NAME_PATTERNS = ["country", "country_name", "nation", "countryname", "country_or_area"];

/**
 * Detect country identifier column from CSV headers.
 */
export function detectCountryColumn(
  headers: string[],
): { column: string; type: "iso3" | "iso2" | "name" } | null {
  const lower = headers.map((h) => h.toLowerCase());

  for (let i = 0; i < headers.length; i++) {
    if (ISO3_PATTERNS.includes(lower[i])) return { column: headers[i], type: "iso3" };
  }
  for (let i = 0; i < headers.length; i++) {
    if (ISO2_PATTERNS.includes(lower[i])) return { column: headers[i], type: "iso2" };
  }
  for (let i = 0; i < headers.length; i++) {
    if (NAME_PATTERNS.includes(lower[i])) return { column: headers[i], type: "name" };
  }

  return null;
}

// ─── CSV → GeoJSON conversion ───────────────────────────────

/**
 * Convert CSV rows with lat/lng to GeoJSON Point features.
 */
export function csvToPointFeatures(
  rows: Record<string, string>[],
  latCol: string,
  lngCol: string,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const row of rows) {
    const lat = parseFloat(row[latCol]);
    const lng = parseFloat(row[lngCol]);
    if (!isFinite(lat) || !isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;

    const properties: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(row)) {
      if (key === latCol || key === lngCol) continue;
      const num = parseFloat(val);
      properties[key] = val !== "" && isFinite(num) ? num : val;
    }

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties,
    });
  }

  return { type: "FeatureCollection", features };
}

/**
 * Convert CSV rows with country identifiers to GeoJSON Polygon features
 * by joining with Natural Earth geometries.
 */
async function csvToCountryFeatures(
  rows: Record<string, string>[],
  countryCol: string,
  countryType: "iso3" | "iso2" | "name",
): Promise<GeoJSON.FeatureCollection> {
  // Fetch Natural Earth country geometries
  const geoRes = await fetch(
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!geoRes.ok) throw new Error("Failed to fetch country geometries");
  const geoData = (await geoRes.json()) as GeoJSON.FeatureCollection;

  // Build lookup from CSV rows
  const dataByKey = new Map<string, Record<string, string>>();
  for (const row of rows) {
    const key = row[countryCol]?.trim();
    if (key) dataByKey.set(key.toUpperCase(), row);
  }

  // Determine which Natural Earth property to match against
  const geoKeyProp = countryType === "iso3" ? "ISO_A3"
    : countryType === "iso2" ? "ISO_A2"
    : "NAME";

  const features: GeoJSON.Feature[] = [];

  for (const geoFeature of geoData.features) {
    const geoKey = String(geoFeature.properties?.[geoKeyProp] ?? "").toUpperCase();
    const csvRow = dataByKey.get(geoKey);
    if (!csvRow) continue;

    const properties: Record<string, unknown> = {
      name: geoFeature.properties?.["NAME"] ?? "",
      iso_a3: geoFeature.properties?.["ISO_A3_EH"] ?? geoFeature.properties?.["ISO_A3"] ?? "",
    };

    for (const [key, val] of Object.entries(csvRow)) {
      if (key === countryCol) continue;
      const num = parseFloat(val);
      properties[key] = val !== "" && isFinite(num) ? num : val;
    }

    features.push({
      type: "Feature",
      geometry: geoFeature.geometry,
      properties,
    });
  }

  return { type: "FeatureCollection", features };
}

// ─── Data quality checks ─────────────────────────────────────

// hasNumericProperties is imported from data-search.ts

// ─── Fetch + validate a candidate URL ───────────────────────

/**
 * Try to fetch a candidate URL and convert to GeoJSON.
 * Returns null if the URL doesn't contain usable geographic data.
 */
async function fetchCandidate(
  candidate: WebDatasetCandidate,
  countryHint?: string,
  requireMetrics = false,
): Promise<{ fc: GeoJSON.FeatureCollection; description: string } | null> {
  try {
    const res = await fetch(candidate.url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();

    // Try GeoJSON first
    if (
      candidate.format === "geojson" ||
      contentType.includes("json") ||
      candidate.url.endsWith(".geojson") ||
      candidate.url.endsWith(".json")
    ) {
      try {
        const data = JSON.parse(text);
        if (data?.type === "FeatureCollection" && Array.isArray(data.features)) {
          const fc = data as GeoJSON.FeatureCollection;
          if (fc.features.length === 0) return null;
          if (fc.features.length > MAX_GEOJSON_FEATURES) {
            fc.features = fc.features.slice(0, MAX_GEOJSON_FEATURES);
          }
          // Reject boundary-only GeoJSON — for statistical queries, require numeric data
          if (requireMetrics && !hasNumericProperties(fc)) return null;
          if (!isUsableDataset(fc)) return null;
          return { fc, description: `${candidate.datasetName} (GeoJSON, ${fc.features.length} features)` };
        }
      } catch {
        // Not valid JSON — fall through to CSV
      }
    }

    // Try CSV
    if (
      candidate.format === "csv" ||
      contentType.includes("csv") ||
      contentType.includes("text/plain") ||
      candidate.url.endsWith(".csv")
    ) {
      const rows = parseCSV(text);
      if (rows.length === 0) return null;

      const headers = Object.keys(rows[0]);

      // Try lat/lng columns first
      const latLng = detectLatLngColumns(headers);
      if (latLng) {
        const fc = csvToPointFeatures(rows, latLng.lat, latLng.lng);
        if (fc.features.length === 0) return null;
        return { fc, description: `${candidate.datasetName} (CSV → Points, ${fc.features.length} features)` };
      }

      // Try country column join
      const countryCol = detectCountryColumn(headers);
      if (countryCol) {
        const fc = await csvToCountryFeatures(rows, countryCol.column, countryCol.type);
        if (fc.features.length === 0) return null;
        return { fc, description: `${candidate.datasetName} (CSV → Countries, ${fc.features.length} features)` };
      }

      // Fallback: full geography pipeline (subnational ISO 3166-2, region names, etc.)
      try {
        const geoResult = await csvToGeoFeatures(text, countryHint);
        if (geoResult.features && geoResult.features.features.length > 0) {
          return {
            fc: geoResult.features,
            description: `${candidate.datasetName} (CSV → ${geoResult.geoType ?? "regions"}, ${geoResult.features.features.length} features)`,
          };
        }
      } catch {
        // Pipeline failed — fall through
      }

      return null; // CSV but no geographic columns
    }

    return null; // Unknown format
  } catch {
    return null;
  }
}

// ─── Extract candidates from AI response ────────────────────

function extractCandidates(
  response: Anthropic.Message,
): WebDatasetCandidate[] {
  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "extract_dataset_urls") {
      const input = block.input as { candidates?: WebDatasetCandidate[] };
      if (Array.isArray(input.candidates)) {
        return input.candidates.slice(0, MAX_CANDIDATES);
      }
    }
  }
  return [];
}

// ─── Main search function ───────────────────────────────────

/**
 * Search the web for downloadable geographic datasets.
 *
 * Uses Claude Haiku with the web_search_20250305 server tool
 * to discover real dataset URLs, then fetches, validates,
 * converts (if CSV), profiles, and caches the data.
 *
 * Returns a DataSearchResult compatible with the existing pipeline.
 */
export async function searchWebDatasets(
  query: string,
  officialSourceHints?: Array<{ agencyName: string; baseUrl: string; formats: string[] }>,
): Promise<DataSearchResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { found: false, error: "No API key for web dataset search" };
  }

  const intent = extractIntent(query);
  const searchQuery = buildSearchQuery(intent);
  const countryHint = extractCountryCode(query);
  // Include full query in hash so different prompts with same intent don't collide
  const hash = createHash("sha256").update(query + "|" + searchQuery).digest("hex").slice(0, 12);
  const cacheKey = `web-${hash}`;

  // Check cache first — validate cached data is relevant to current query
  const cached = await getCachedData(cacheKey);
  if (cached) {
    const cachedDesc = (cached.description ?? cached.source ?? "").toLowerCase();
    const topicWords = intent.topic.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const descOverlap = topicWords.filter((w) => cachedDesc.includes(w)).length;

    if (descOverlap > 0 || topicWords.length === 0) {
      return {
        found: true,
        source: cached.source,
        description: cached.description,
        featureCount: cached.profile.featureCount,
        geometryType: cached.profile.geometryType,
        attributes: cached.profile.attributes.map((a) => a.name),
        cacheKey,
        profile: cached.profile,
      };
    }
    // Cached data description doesn't match current query — skip, do fresh search
  }

  try {
    const client = new Anthropic({ apiKey });

    const sourceHintBlock = officialSourceHints && officialSourceHints.length > 0
      ? `\n\nKnown official statistics sources for this query:\n${officialSourceHints.map((s) => `- ${s.agencyName}: ${s.baseUrl} (formats: ${s.formats.join(", ")})`).join("\n")}\nSearch for downloadable CSV/JSON data from these agencies or their open data portals.`
      : "";

    const systemPrompt = `You are a dataset search assistant. Find downloadable datasets with ACTUAL DATA VALUES (not just boundaries/geometry).

The user needs data about:
- Topic: ${intent.topic}
- Metric: ${intent.metric ?? "any relevant metric"}
- Geography: ${intent.geography ?? "global"}
- Timeframe: ${intent.timeframe ?? "latest available"}${sourceHintBlock}

Rules:
- Only return REAL URLs you found via web search
- For statistical/metric queries: prefer CSV or GeoJSON with numeric data columns (population, GDP, rates, etc.)
- For location/POI queries (landmarks, sites, wonders, heritage, etc.): GeoJSON or CSV with lat/lon + name columns is perfect
- Avoid: boundary-only GeoJSON (just polygon shapes, no names or data), HTML tables, API docs, paywalled sources
- Prioritize: Our World in Data, data.gov, HDX, GitHub raw data files, Wikipedia-derived datasets, UNESCO, natural-earth
- Never invent or guess URLs — every URL must come from a search result
- Call the extract_dataset_urls tool with your findings
- If you find nothing downloadable, call extract_dataset_urls with an empty candidates array`;

    // Use web search + structured extraction
    const aiResponse = await client.messages.create({
      model: SEARCH_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Find downloadable geographic datasets for: ${searchQuery}`,
        },
      ],
      tools: [
        {
          type: "web_search_20250305" as const,
          name: "web_search",
          max_uses: 3,
        } as unknown as Anthropic.Tool,
        {
          name: "extract_dataset_urls",
          description:
            "Return structured dataset candidates found via web search. Only include URLs that point to actual downloadable data files (GeoJSON, CSV), not documentation or landing pages.",
          input_schema: {
            type: "object" as const,
            properties: {
              candidates: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    datasetName: {
                      type: "string",
                      description: "Human-readable name of the dataset",
                    },
                    url: {
                      type: "string",
                      description: "Direct download URL for the data file",
                    },
                    format: {
                      type: "string",
                      enum: ["geojson", "csv", "api"],
                      description: "File format",
                    },
                    metricField: {
                      type: "string",
                      description: "Primary metric column/field name if known",
                    },
                    geographyField: {
                      type: "string",
                      description: "Geographic identifier column/field name if known",
                    },
                  },
                  required: ["datasetName", "url", "format"],
                },
              },
            },
            required: ["candidates"],
          },
        },
      ],
    });

    // If the AI called extract_dataset_urls, get candidates directly
    let candidates = extractCandidates(aiResponse);

    // If the AI wants to continue (tool_use for extract_dataset_urls),
    // we just read the input — no need to feed back a result
    if (candidates.length === 0 && aiResponse.stop_reason === "tool_use") {
      // The tool_use might be for web_search — continue the conversation
      // to let the AI process search results and call extract_dataset_urls
      const toolUseBlocks = aiResponse.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      if (toolUseBlocks.some((b) => b.name === "web_search")) {
        // Web search was server-side, results are embedded. Send dummy
        // tool results for any non-server tools and continue.
        const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks
          .filter((b) => b.name !== "web_search")
          .map((b) => ({
            type: "tool_result" as const,
            tool_use_id: b.id,
            content: JSON.stringify({ status: "ok" }),
          }));

        if (toolResults.length > 0) {
          const continueResponse = await client.messages.create({
            model: SEARCH_MODEL,
            max_tokens: 1024,
            system: systemPrompt,
            messages: [
              { role: "user", content: `Find downloadable geographic datasets for: ${searchQuery}` },
              { role: "assistant", content: aiResponse.content },
              { role: "user", content: toolResults },
            ],
            tools: [
              {
                type: "web_search_20250305" as const,
                name: "web_search",
                max_uses: 3,
              } as unknown as Anthropic.Tool,
              {
                name: "extract_dataset_urls",
                description: "Return structured dataset candidates found via web search.",
                input_schema: {
                  type: "object" as const,
                  properties: {
                    candidates: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          datasetName: { type: "string" },
                          url: { type: "string" },
                          format: { type: "string", enum: ["geojson", "csv", "api"] },
                          metricField: { type: "string" },
                          geographyField: { type: "string" },
                        },
                        required: ["datasetName", "url", "format"],
                      },
                    },
                  },
                  required: ["candidates"],
                },
              },
            ],
          });

          candidates = extractCandidates(continueResponse);
        }
      }
    }

    if (candidates.length === 0) {
      return { found: false, error: "dataset_not_found" };
    }

    // Try each candidate URL
    for (const candidate of candidates) {
      // For GeoJSON URLs, try the existing fetchGeoJSON first (it handles caching)
      if (candidate.format === "geojson") {
        const result = await fetchGeoJSON(candidate.url, { requireNumericData: intent.metric !== undefined });
        if (result.found && result.cacheKey && result.profile) {
          // Re-cache under the web search key for topic-based lookup
          const cachedEntry = await getCachedData(result.cacheKey);
          if (cachedEntry) {
            await setCache(cacheKey, {
              ...cachedEntry,
              source: `Web: ${candidate.datasetName}`,
              description: candidate.datasetName,
            });
          }

          // Register in persistent registry
          await registerDataset(intent, {
            keywords: searchQuery.split(/\s+/).filter((w) => w.length > 2),
            datasetUrl: candidate.url,
            format: candidate.format,
            metricField: candidate.metricField,
            geographyField: candidate.geographyField,
            cacheKey,
            confidence: 0.8,
          });

          return {
            found: true,
            source: `Web: ${candidate.datasetName}`,
            description: `${candidate.datasetName} (${result.featureCount} features)`,
            featureCount: result.featureCount,
            geometryType: result.geometryType,
            attributes: result.attributes,
            cacheKey,
            profile: result.profile,
          };
        }
      }

      // General fetch + validate
      const fetchResult = await fetchCandidate(candidate, countryHint, intent.metric !== undefined);
      if (fetchResult) {
        const profile = profileDataset(fetchResult.fc);

        const entry: CacheEntry = {
          data: fetchResult.fc,
          profile,
          source: `Web: ${candidate.datasetName}`,
          description: fetchResult.description,
          timestamp: Date.now(),
        };

        await setCache(cacheKey, entry);

        // Register in persistent registry
        await registerDataset(intent, {
          keywords: searchQuery.split(/\s+/).filter((w) => w.length > 2),
          datasetUrl: candidate.url,
          format: candidate.format,
          metricField: candidate.metricField,
          geographyField: candidate.geographyField,
          cacheKey,
          confidence: 0.8,
        });

        return {
          found: true,
          source: `Web: ${candidate.datasetName}`,
          description: fetchResult.description,
          featureCount: profile.featureCount,
          geometryType: profile.geometryType,
          attributes: profile.attributes.map((a) => a.name),
          cacheKey,
          profile,
        };
      }
    }

    // All candidates failed
    return { found: false, error: "dataset_not_found" };
  } catch (err) {
    return {
      found: false,
      error: err instanceof Error ? err.message : "Web dataset search failed",
    };
  }
}
