/**
 * Data Commons integration.
 *
 * Fetches subnational statistics (population, GDP, unemployment, etc.)
 * from Data Commons REST V2 API and joins to static admin1 geometry.
 *
 * Uses an AI call (Haiku) to interpret any prompt in any language
 * and extract structured intent (country, metric, admin level).
 * No keyword lists needed for detection.
 */

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

const DC_API_BASE = "https://api.datacommons.org/v2";
const OBSERVATION_TIMEOUT_MS = 6_000;
const NODE_TIMEOUT_MS = 4_000;
const AI_TIMEOUT_MS = 3_500;
const INTENT_MODEL = "claude-haiku-4-5-20251001";

// ─── Country config ─────────────────────────────────────────

interface CountryConfig {
  dcid: string;       // e.g. "country/BRA"
  adminType: string;  // e.g. "State", "EurostatNUTS1"
  geoFile: string;    // e.g. "geo/br/admin1.geojson"
}

const DC_COUNTRY_CONFIG: Record<string, CountryConfig> = {
  AU: { dcid: "country/AUS", adminType: "State", geoFile: "geo/au/admin1.geojson" },
  BR: { dcid: "country/BRA", adminType: "State", geoFile: "geo/br/admin1.geojson" },
  CA: { dcid: "country/CAN", adminType: "Province", geoFile: "geo/ca/admin1.geojson" },
  CN: { dcid: "country/CHN", adminType: "Province", geoFile: "geo/cn/admin1.geojson" },
  DE: { dcid: "country/DEU", adminType: "EurostatNUTS1", geoFile: "geo/de/admin1.geojson" },
  DK: { dcid: "country/DNK", adminType: "AdministrativeArea1", geoFile: "geo/dk/admin1.geojson" },
  ES: { dcid: "country/ESP", adminType: "EurostatNUTS2", geoFile: "geo/es/admin1.geojson" },
  FI: { dcid: "country/FIN", adminType: "AdministrativeArea1", geoFile: "geo/fi/admin1.geojson" },
  FR: { dcid: "country/FRA", adminType: "AdministrativeArea1", geoFile: "geo/fr/admin1.geojson" },
  GB: { dcid: "country/GBR", adminType: "AdministrativeArea1", geoFile: "geo/gb/admin1.geojson" },
  ID: { dcid: "country/IDN", adminType: "Province", geoFile: "geo/id/admin1.geojson" },
  IN: { dcid: "country/IND", adminType: "State", geoFile: "geo/in/admin1.geojson" },
  IT: { dcid: "country/ITA", adminType: "EurostatNUTS2", geoFile: "geo/it/admin1.geojson" },
  JP: { dcid: "country/JPN", adminType: "Prefecture", geoFile: "geo/jp/prefectures.geojson" },
  KR: { dcid: "country/KOR", adminType: "AdministrativeArea1", geoFile: "geo/kr/admin1.geojson" },
  MX: { dcid: "country/MEX", adminType: "State", geoFile: "geo/mx/admin1.geojson" },
  NG: { dcid: "country/NGA", adminType: "State", geoFile: "geo/ng/admin1.geojson" },
  NL: { dcid: "country/NLD", adminType: "Province", geoFile: "geo/nl/admin1.geojson" },
  NO: { dcid: "country/NOR", adminType: "AdministrativeArea1", geoFile: "geo/no/admin1.geojson" },
  PL: { dcid: "country/POL", adminType: "EurostatNUTS2", geoFile: "geo/pl/admin1.geojson" },
  RU: { dcid: "country/RUS", adminType: "AdministrativeArea1", geoFile: "geo/ru/admin1.geojson" },
  SE: { dcid: "country/SWE", adminType: "AdministrativeArea1", geoFile: "geo/se/admin1.geojson" },
  TR: { dcid: "country/TUR", adminType: "Province", geoFile: "geo/tr/admin1.geojson" },
  US: { dcid: "country/USA", adminType: "State", geoFile: "geo/us/states.geojson" },
  ZA: { dcid: "country/ZAF", adminType: "Province", geoFile: "geo/za/admin1.geojson" },
};

// ─── Variable mapping ───────────────────────────────────────

interface VariableConfig {
  dcid: string;
  label: string;
}

/** Metric keyword (English, normalized by AI) → Data Commons variable. */
const DC_VARIABLES: Record<string, VariableConfig> = {
  population: { dcid: "Count_Person", label: "Population" },
  unemployment: { dcid: "UnemploymentRate_Person", label: "Unemployment Rate" },
  gdp: { dcid: "Amount_EconomicActivity_GrossDomesticProduct_Nominal", label: "GDP" },
  poverty: { dcid: "Count_Person_BelowPovertyLevelInThePast12Months", label: "Poverty" },
  income: { dcid: "Median_Income_Person", label: "Median Income" },
  crime: { dcid: "Count_CriminalActivities_CombinedCrime", label: "Crime" },
  "life expectancy": { dcid: "LifeExpectancy_Person", label: "Life Expectancy" },
};

// ─── Name normalization ─────────────────────────────────────

const NAME_PREFIXES = /^(state of |province of |region of |departamento de |estado de |prefectura de )/i;

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(NAME_PREFIXES, "")
    .trim();
}

// ─── AI intent extraction ───────────────────────────────────

interface IntentResult {
  isSubnational: boolean;
  countryCode: string | null;
  metric: string | null;
  englishPrompt: string;
}

const SUPPORTED_COUNTRIES = Object.keys(DC_COUNTRY_CONFIG).join(", ");
const SUPPORTED_METRICS = Object.keys(DC_VARIABLES).join(", ");

const INTENT_SYSTEM = `You extract structured intent from map prompts. Any language.

Reply with a single JSON object:
{
  "isSubnational": true/false,
  "countryCode": "XX" or null,
  "metric": "keyword" or null,
  "englishPrompt": "translated prompt"
}

Rules:
- isSubnational: true if the user wants data by state, province, region, prefecture, county, municipality, etc.
- countryCode: ISO 3166-1 alpha-2 code. Only use these supported countries: ${SUPPORTED_COUNTRIES}. null if not in list or not mentioned.
- metric: map to the closest English keyword from: ${SUPPORTED_METRICS}. null if no metric mentioned.
- englishPrompt: translate the prompt to concise English (max 15 words).

Output ONLY the JSON object, nothing else.`;

async function extractIntent(query: string): Promise<IntentResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey });
    const promise = client.messages.create({
      model: INTENT_MODEL,
      max_tokens: 128,
      system: INTENT_SYSTEM,
      messages: [{ role: "user", content: query }],
    });
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), AI_TIMEOUT_MS),
    );
    const res = await Promise.race([promise, timeout]);
    if (!res) return null;

    const text = res.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    )?.text.trim();
    if (!text) return null;

    // Parse JSON — handle markdown fences
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return null;

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    return {
      isSubnational: !!parsed.isSubnational,
      countryCode: typeof parsed.countryCode === "string" ? parsed.countryCode.toUpperCase() : null,
      metric: typeof parsed.metric === "string" ? parsed.metric.toLowerCase() : null,
      englishPrompt: typeof parsed.englishPrompt === "string" ? parsed.englishPrompt : query,
    };
  } catch {
    return null;
  }
}

// ─── API calls ──────────────────────────────────────────────

interface ObservationData {
  entityDcid: string;
  value: number;
  date: string;
}

async function fetchObservations(
  config: CountryConfig,
  variableDcid: string,
  apiKey: string | undefined,
): Promise<ObservationData[]> {
  const expression = `${config.dcid}<-containedInPlace+{typeOf:${config.adminType}}`;
  const params = new URLSearchParams({
    "entity.expression": expression,
    "variable.dcids": variableDcid,
    date: "LATEST",
    select: "entity",
  });
  params.append("select", "variable");
  params.append("select", "value");
  params.append("select", "date");
  if (apiKey) params.set("key", apiKey);

  const url = `${DC_API_BASE}/observation?${params}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(OBSERVATION_TIMEOUT_MS) });
  if (!res.ok) return [];

  const json = await res.json();
  const byEntity = json?.byVariable?.[variableDcid]?.byEntity;
  if (!byEntity || typeof byEntity !== "object") return [];

  const results: ObservationData[] = [];
  for (const [entityDcid, entityData] of Object.entries(byEntity)) {
    const facets = (entityData as { orderedFacets?: { observations?: { date: string; value: number }[] }[] }).orderedFacets;
    if (!facets || facets.length === 0) continue;
    const obs = facets[0].observations;
    if (!obs || obs.length === 0) continue;
    results.push({
      entityDcid,
      value: obs[0].value,
      date: obs[0].date,
    });
  }

  return results;
}

async function resolveNames(
  entityDcids: string[],
  apiKey: string | undefined,
): Promise<Map<string, string>> {
  if (entityDcids.length === 0) return new Map();

  const params = new URLSearchParams({ "property": "->name" });
  for (const dcid of entityDcids) {
    params.append("nodes", dcid);
  }
  if (apiKey) params.set("key", apiKey);

  const url = `${DC_API_BASE}/node?${params}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(NODE_TIMEOUT_MS) });
  if (!res.ok) return new Map();

  const json = await res.json();
  const dataMap = json?.data;
  if (!dataMap || typeof dataMap !== "object") return new Map();

  const names = new Map<string, string>();
  for (const [dcid, nodeData] of Object.entries(dataMap)) {
    const nameNodes = (nodeData as { arcs?: { name?: { nodes?: { value: string }[] } } }).arcs?.name?.nodes;
    if (nameNodes && nameNodes.length > 0) {
      names.set(dcid, nameNodes[0].value);
    }
  }

  return names;
}

// ─── Geometry loading ───────────────────────────────────────

async function loadGeometry(geoFile: string): Promise<GeoJSON.FeatureCollection | null> {
  try {
    const filePath = join(process.cwd(), "public", geoFile);
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    if (data?.type === "FeatureCollection" && Array.isArray(data.features)) {
      return data as GeoJSON.FeatureCollection;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Main search function ───────────────────────────────────

export interface DataCommonsResult extends DataSearchResult {
  /** English translation of the prompt (from AI intent extraction). */
  englishPrompt?: string;
}

/** Country name hints for fast keyword pre-filter (avoids expensive AI call). */
const DC_COUNTRY_NAMES: Record<string, string[]> = {
  AU: ["australia"], BR: ["brazil", "brasil"],
  CA: ["canada"], CN: ["china"],
  DE: ["germany", "deutschland"], DK: ["denmark", "danmark"],
  ES: ["spain", "españa", "espana"], FI: ["finland"],
  FR: ["france"], GB: ["united kingdom", "uk", "britain"],
  ID: ["indonesia"], IN: ["india"],
  IT: ["italy", "italia"], JP: ["japan"],
  KR: ["korea", "south korea"], MX: ["mexico", "méxico"],
  NG: ["nigeria"], NL: ["netherlands", "holland"],
  NO: ["norway", "norge"], PL: ["poland", "polska"],
  RU: ["russia"], SE: ["sweden", "sverige"],
  TR: ["turkey", "türkiye"], US: ["united states", "usa", "america"],
  ZA: ["south africa"],
};

export async function searchDataCommons(query: string): Promise<DataCommonsResult> {
  // Fast pre-filter: if the prompt mentions a known country but none of the
  // DC metric keywords (population, unemployment, etc.), skip the AI call.
  // Saves ~3.5s for prompts that will inevitably fail at the metric check.
  const lower = query.toLowerCase();
  const mentionsCountry = Object.values(DC_COUNTRY_NAMES).some((names) =>
    names.some((n) => lower.includes(n)),
  );
  if (mentionsCountry) {
    const metricKeys = Object.keys(DC_VARIABLES);
    const hasMetric = metricKeys.some((k) => lower.includes(k));
    if (!hasMetric) return { found: false };
  }

  // AI extracts intent — handles any language, any phrasing
  const intent = await extractIntent(query);
  if (!intent) return { found: false };
  if (!intent.isSubnational) return { found: false };
  if (!intent.countryCode) return { found: false };
  if (!intent.metric) return { found: false };

  const config = DC_COUNTRY_CONFIG[intent.countryCode];
  if (!config) return { found: false };

  const variable = DC_VARIABLES[intent.metric];
  if (!variable) return { found: false, englishPrompt: intent.englishPrompt };

  const cacheKey = `dc-${intent.countryCode}-${variable.dcid}`;

  // Check cache
  const cached = await getCachedData(cacheKey);
  if (cached) {
    return {
      found: true,
      source: "Data Commons",
      description: cached.description,
      featureCount: cached.profile.featureCount,
      geometryType: cached.profile.geometryType,
      attributes: cached.profile.attributes.map((a) => a.name),
      cacheKey,
      profile: cached.profile,
      englishPrompt: intent.englishPrompt,
    };
  }

  const apiKey = process.env.DATA_COMMONS_API_KEY;

  try {
    // Step 1: Fetch observations
    const observations = await fetchObservations(config, variable.dcid, apiKey);
    if (observations.length === 0) return { found: false, error: "No Data Commons observations found", englishPrompt: intent.englishPrompt };

    // Step 2: Resolve entity names
    const dcids = observations.map((o) => o.entityDcid);
    const names = await resolveNames(dcids, apiKey);
    if (names.size === 0) return { found: false, error: "Could not resolve entity names", englishPrompt: intent.englishPrompt };

    // Step 3: Load geometry
    const geometry = await loadGeometry(config.geoFile);
    if (!geometry) return { found: false, error: `Geometry not found: ${config.geoFile}`, englishPrompt: intent.englishPrompt };

    // Step 4: Build name → observation lookup
    const valueByNorm = new Map<string, ObservationData>();
    for (const obs of observations) {
      const name = names.get(obs.entityDcid);
      if (name) {
        valueByNorm.set(normalizeName(name), obs);
      }
    }

    // Step 5: Join to geometry
    const features: GeoJSON.Feature[] = [];
    for (const feature of geometry.features) {
      const geoName = feature.properties?.name as string | undefined;
      if (!geoName) continue;

      const normalized = normalizeName(geoName);
      const obs = valueByNorm.get(normalized);
      if (!obs) continue;

      features.push({
        type: "Feature",
        geometry: feature.geometry,
        properties: {
          ...feature.properties,
          [variable.label.toLowerCase().replace(/\s+/g, "_")]: obs.value,
          data_date: obs.date,
        },
      });
    }

    // Coverage check — need at least 50%
    const coverage = features.length / geometry.features.length;
    if (coverage < 0.5) {
      return { found: false, error: `Low coverage: ${features.length}/${geometry.features.length} matched`, englishPrompt: intent.englishPrompt };
    }

    // Step 6: Build FeatureCollection
    const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
    const profile = profileDataset(fc);

    const description = `${variable.label} by ${config.adminType.toLowerCase()} in ${intent.countryCode}, ${features.length} regions (Data Commons)`;

    // Step 7: Cache
    const entry: CacheEntry = {
      data: fc,
      profile,
      source: "Data Commons",
      description,
      timestamp: Date.now(),
    };
    await setCache(cacheKey, entry);

    return {
      found: true,
      source: "Data Commons",
      description,
      featureCount: features.length,
      geometryType: profile.geometryType,
      attributes: profile.attributes.map((a) => a.name),
      cacheKey,
      profile,
      englishPrompt: intent.englishPrompt,
    };
  } catch {
    return { found: false, error: "Data Commons request failed", englishPrompt: intent.englishPrompt };
  }
}
