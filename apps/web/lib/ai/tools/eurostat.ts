/**
 * Eurostat integration.
 *
 * Fetches European country-level statistics (minimum wage, GDP, unemployment,
 * energy, emissions, etc.) from the Eurostat SDMX REST API and joins to
 * static NUTS0 geometry.
 *
 * Uses an AI call (Haiku) to interpret any prompt in any language and
 * extract structured intent (dataset code, filters). No keyword lists needed.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateText } from "ai";
import { MODELS } from "../ai-client";
import { profileDataset } from "../profiler";
import {
  getCachedData,
  setCache,
  detectScope,
  COUNTRY_GROUPS_ISO2,
  type DataSearchResult,
  type CacheEntry,
} from "./data-search";

// ─── Constants ──────────────────────────────────────────────

const EUROSTAT_API_BASE =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";
const API_TIMEOUT_MS = 8_000;
const AI_TIMEOUT_MS = 2_500;
const NUTS0_GEO_FILE = "geo/eu/nuts0.geojson";

// ─── Dataset catalog ────────────────────────────────────────

interface DatasetConfig {
  code: string;
  label: string;
  /** Property name for the value in the output GeoJSON. */
  property: string;
  /** Fixed filter params appended to the API URL (pre-selects the right slice). */
  filters: string;
}

/**
 * Curated Eurostat datasets. The AI picks from this list.
 * Each entry includes fixed filters to select the most useful slice
 * (e.g. EUR currency, total sex, per-capita unit).
 */
const EUROSTAT_DATASETS: Record<string, DatasetConfig> = {
  minimum_wage: {
    code: "earn_mw_cur",
    label: "Monthly Minimum Wage",
    property: "minimum_wage_eur",
    filters: "currency=EUR",
  },
  gdp_per_capita: {
    code: "sdg_08_10",
    label: "GDP per Capita",
    property: "gdp_per_capita",
    filters: "na_item=B1GQ&unit=CLV10_EUR_HAB",
  },
  unemployment: {
    code: "une_rt_a",
    label: "Unemployment Rate",
    property: "unemployment_rate",
    filters: "sex=T&age=Y15-74&unit=PC_ACT",
  },
  inflation: {
    code: "prc_hicp_aind",
    label: "Inflation (HICP)",
    property: "inflation_index",
    filters: "coicop=CP00&unit=INX_A_AVG",
  },
  life_expectancy: {
    code: "demo_mlexpec",
    label: "Life Expectancy at Birth",
    property: "life_expectancy",
    filters: "sex=T&age=Y_LT1",
  },
  fertility: {
    code: "demo_find",
    label: "Total Fertility Rate",
    property: "fertility_rate",
    filters: "indic_de=TOTFERRT",
  },
  renewable_energy: {
    code: "nrg_ind_ren",
    label: "Renewable Energy Share",
    property: "renewable_energy_pct",
    filters: "nrg_bal=REN&unit=PC",
  },
  greenhouse_gas: {
    code: "env_air_gge",
    label: "Greenhouse Gas Emissions",
    property: "ghg_emissions",
    filters: "airpol=GHG&src_crf=TOTXMEMONIA&unit=MIO_T",
  },
  population: {
    code: "demo_pjan",
    label: "Population",
    property: "population",
    filters: "sex=T&age=TOTAL",
  },
  median_income: {
    code: "ilc_di03",
    label: "Median Equivalised Net Income",
    property: "median_income_eur",
    filters: "indic_il=MEI_E&unit=EUR",
  },
  poverty_rate: {
    code: "ilc_li02",
    label: "At-Risk-of-Poverty Rate",
    property: "poverty_rate",
    filters: "indic_il=LI_R_MD60&unit=PC&sex=T",
  },
  gini: {
    code: "ilc_di12",
    label: "Gini Coefficient",
    property: "gini_coefficient",
    filters: "",
  },
  healthcare_spending: {
    code: "hlth_sha11_hf",
    label: "Healthcare Expenditure",
    property: "healthcare_spending_pct_gdp",
    filters: "icha11_hf=TOT_HF&unit=PC_GDP",
  },
  education_spending: {
    code: "educ_uoe_fine09",
    label: "Education Expenditure",
    property: "education_spending_pct_gdp",
    filters: "unit=PC_GDP&isced11=ED0-8&sector=S13",
  },
  homicide_rate: {
    code: "crim_off_cat",
    label: "Intentional Homicides",
    property: "homicides",
    filters: "iccs=ICCS0101",
  },
  internet_usage: {
    code: "isoc_ci_ifp_iu",
    label: "Internet Usage",
    property: "internet_users_pct",
    filters: "unit=PC_IND&indic_is=I_IUSE&ind_type=IND_TOTAL",
  },
  house_prices: {
    code: "prc_hpi_a",
    label: "House Price Index",
    property: "house_price_index",
    filters: "purchase=TOTAL&unit=INX_Q",
  },
  tourism: {
    code: "tour_occ_ninat",
    label: "Tourism Nights Spent",
    property: "tourism_nights",
    filters: "unit=NR&nace_r2=I551-I553&c_resid=TOTAL",
  },
};

const DATASET_KEYS = Object.keys(EUROSTAT_DATASETS);
const DATASET_DESCRIPTIONS = DATASET_KEYS.map(
  (k) => `${k}: ${EUROSTAT_DATASETS[k].label} (${EUROSTAT_DATASETS[k].code})`,
).join("\n");

// ─── Keyword-based intent extraction (no AI credits) ────────

const EUROPE_KEYWORDS = [
  "europe", "european", "europa", "europeisk",
  "eu-länder", "eu countries", "eurozone",
];
const EU_WORD_REGEX = /\beu\b/i;

/** Keyword → Eurostat dataset key. Sorted longest-first at lookup time. */
const EUROSTAT_KEYWORDS: Record<string, string> = {
  // minimum_wage
  "minimum wage": "minimum_wage",
  minimilön: "minimum_wage",
  mindestlohn: "minimum_wage",
  // gdp_per_capita
  "gdp per capita": "gdp_per_capita",
  "bnp per capita": "gdp_per_capita",
  // unemployment
  unemployment: "unemployment",
  arbetslöshet: "unemployment",
  // inflation
  inflation: "inflation",
  // life_expectancy
  "life expectancy": "life_expectancy",
  livslängd: "life_expectancy",
  medellivslängd: "life_expectancy",
  // fertility
  "fertility rate": "fertility",
  fertility: "fertility",
  fertilitet: "fertility",
  födelsetal: "fertility",
  // renewable_energy
  "renewable energy": "renewable_energy",
  "förnybar energi": "renewable_energy",
  // greenhouse_gas
  "greenhouse gas": "greenhouse_gas",
  växthusgaser: "greenhouse_gas",
  "co2 emission": "greenhouse_gas",
  "carbon emission": "greenhouse_gas",
  koldioxidutsläpp: "greenhouse_gas",
  // population
  population: "population",
  befolkning: "population",
  // median_income
  "median income": "median_income",
  medianinkomst: "median_income",
  income: "median_income",
  inkomst: "median_income",
  // poverty_rate
  poverty: "poverty_rate",
  fattigdom: "poverty_rate",
  // gini
  gini: "gini",
  inequality: "gini",
  ojämlikhet: "gini",
  // healthcare_spending
  "healthcare spending": "healthcare_spending",
  "health expenditure": "healthcare_spending",
  sjukvårdskostnad: "healthcare_spending",
  hälsovårdsutgifter: "healthcare_spending",
  // education_spending
  "education spending": "education_spending",
  utbildningskostnad: "education_spending",
  // homicide_rate
  homicide: "homicide_rate",
  murder: "homicide_rate",
  mord: "homicide_rate",
  // internet_usage
  "internet usage": "internet_usage",
  internetanvändning: "internet_usage",
  // house_prices
  "house price": "house_prices",
  bostadspris: "house_prices",
  huspriser: "house_prices",
  // tourism
  tourism: "tourism",
  turism: "tourism",
};

const EUROSTAT_KEYWORD_ENTRIES = Object.entries(EUROSTAT_KEYWORDS)
  .sort((a, b) => b[0].length - a[0].length);

/**
 * Keyword-based intent extraction — no AI credits needed.
 * Requires both a Europe keyword and a topic keyword match.
 */
function keywordExtractIntent(query: string): IntentResult | null {
  const lower = query.toLowerCase();

  const isEuropean = EUROPE_KEYWORDS.some((kw) => lower.includes(kw)) || EU_WORD_REGEX.test(lower);
  if (!isEuropean) return null;

  for (const [keyword, datasetKey] of EUROSTAT_KEYWORD_ENTRIES) {
    if (lower.includes(keyword)) {
      return { isEuropean: true, datasetKey, englishPrompt: query };
    }
  }
  return null;
}

// ─── AI intent extraction (fallback) ────────────────────────

interface IntentResult {
  isEuropean: boolean;
  datasetKey: string | null;
  englishPrompt: string;
}

const INTENT_SYSTEM = `You extract structured intent from map prompts about European statistics. Any language.

Reply with a single JSON object:
{
  "isEuropean": true/false,
  "datasetKey": "key" or null,
  "englishPrompt": "translated prompt"
}

Rules:
- isEuropean: true ONLY if the prompt explicitly mentions Europe, EU, European Union, or names 2+ European countries. Single-country queries (even European ones) are false — they belong to that country's national statistics.
  Examples: "GDP in Europe" → true. "Unemployment in EU countries" → true. "Minimilön i Europa" → true.
  Counter-examples: "Income by county Norway" → false. "Population Sweden" → false. "Life expectancy by country" → false. "CO2 emissions per country" → false. "GDP per capita globally" → false.
- datasetKey: pick the best match from the list below. null if none match.
- englishPrompt: translate the prompt to concise English (max 15 words).

Available datasets:
${DATASET_DESCRIPTIONS}

Output ONLY the JSON object, nothing else.`;

async function extractIntent(query: string): Promise<IntentResult | null> {
  try {
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), AI_TIMEOUT_MS),
    );
    const aiPromise = generateText({
      model: MODELS.utility(),
      maxOutputTokens: 128,
      system: INTENT_SYSTEM,
      messages: [{ role: "user", content: query }],
    }).then((r) => r.text.trim());

    const text = await Promise.race([aiPromise, timeout]);
    if (!text) return null;

    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return null;

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    return {
      isEuropean: !!parsed.isEuropean,
      datasetKey:
        typeof parsed.datasetKey === "string" &&
        DATASET_KEYS.includes(parsed.datasetKey)
          ? parsed.datasetKey
          : null,
      englishPrompt:
        typeof parsed.englishPrompt === "string"
          ? parsed.englishPrompt
          : query,
    };
  } catch {
    return null;
  }
}

// ─── JSON-stat 2.0 parser ───────────────────────────────────

interface ParsedObservation {
  geoCode: string;
  value: number;
  timePeriod: string;
}

type DimCategory = { category?: { index?: Record<string, number> } };

/**
 * Parse Eurostat JSON-stat 2.0 response (Statistics API v1.0).
 *
 * With `geoLevel=country` the API only returns 2-char country codes.
 * With `lastTimePeriod=1` it returns only the latest period.
 * Values are a flat array indexed by dimension strides.
 */
function parseJsonStat(
  data: Record<string, unknown>,
): ParsedObservation[] {
  const dimIds = data.id as string[] | undefined;
  const sizes = data.size as number[] | undefined;
  const values = data.value as (number | null)[] | undefined;
  const dimensions = data.dimension as Record<string, DimCategory> | undefined;

  if (!dimIds || !sizes || !values || !dimensions) return [];

  const geoIdx = dimIds.indexOf("geo");
  if (geoIdx === -1) return [];

  const geoDim = dimensions.geo?.category?.index;
  if (!geoDim) return [];

  // Get time period label (single value with lastTimePeriod=1)
  let timePeriod = "latest";
  const timeIdx = dimIds.indexOf("time");
  if (timeIdx !== -1) {
    const timeIndex = dimensions.time?.category?.index;
    if (timeIndex) timePeriod = Object.keys(timeIndex)[0] ?? "latest";
  }

  // Compute dimension strides for flat index decoding
  const strides: number[] = new Array(dimIds.length);
  strides[dimIds.length - 1] = 1;
  for (let i = dimIds.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  const results: ParsedObservation[] = [];
  for (const [geoCode, geoPos] of Object.entries(geoDim)) {
    // Safety: skip aggregate codes if the API returns any
    if (geoCode.length > 2) continue;

    // Compute flat index across all dimensions.
    // - geo dimension: use geoPos
    // - time dimension: use sizes[i] - 1 (last = most recent period)
    // - all other dimensions: use 0 (first value)
    // This handles the case where lastTimePeriod=1 filter is ignored and
    // multiple time periods are returned.
    let flatIdx = 0;
    for (let i = 0; i < dimIds.length; i++) {
      if (i === geoIdx) {
        flatIdx += geoPos * strides[i];
      } else if (dimIds[i] === "time") {
        flatIdx += (sizes[i] - 1) * strides[i];
      }
      // All other dimensions: position 0, contributes 0 * stride = 0
    }

    const value = values[flatIdx];
    if (value == null) continue;

    results.push({ geoCode, value, timePeriod });
  }

  return results;
}

// ─── Geometry loading ───────────────────────────────────────

async function loadNuts0(): Promise<GeoJSON.FeatureCollection | null> {
  try {
    const filePath = join(process.cwd(), "public", NUTS0_GEO_FILE);
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

export interface EurostatResult extends DataSearchResult {
  englishPrompt?: string;
}

export async function searchEurostat(
  query: string,
): Promise<EurostatResult> {
  // Keyword match first (instant, no credits), AI fallback if needed
  const intent = keywordExtractIntent(query) ?? await extractIntent(query);
  if (!intent) return { found: false };
  if (!intent.isEuropean) return { found: false };
  if (!intent.datasetKey) return { found: false };

  const config = EUROSTAT_DATASETS[intent.datasetKey];
  if (!config) return { found: false, englishPrompt: intent.englishPrompt };

  // Detect sub-regional scope for server-side filtering
  const scope = detectScope(query);
  const cacheKey = scope
    ? `eurostat-${config.code}-${scope.key.toLowerCase()}`
    : `eurostat-${config.code}`;

  // Check cache
  const cached = await getCachedData(cacheKey);
  if (cached) {
    return {
      found: true,
      source: "Eurostat",
      description: cached.description,
      featureCount: cached.profile.featureCount,
      geometryType: cached.profile.geometryType,
      attributes: cached.profile.attributes.map((a) => a.name),
      cacheKey,
      profile: cached.profile,
      englishPrompt: intent.englishPrompt,
    };
  }

  try {
    // Step 1: Fetch data from Eurostat (JSON-stat Statistics API)
    const filterStr = config.filters ? `&${config.filters}` : "";
    const url = `${EUROSTAT_API_BASE}/${config.code}?lang=EN&geoLevel=country&lastTimePeriod=1${filterStr}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!res.ok) {
      return {
        found: false,
        error: `Eurostat API error: ${res.status}`,
        englishPrompt: intent.englishPrompt,
      };
    }

    const json = await res.json();
    const observations = parseJsonStat(json as Record<string, unknown>);
    if (observations.length === 0) {
      return {
        found: false,
        error: "No Eurostat observations found",
        englishPrompt: intent.englishPrompt,
      };
    }

    // Step 2: Load geometry
    const geometry = await loadNuts0();
    if (!geometry) {
      return {
        found: false,
        error: `Geometry not found: ${NUTS0_GEO_FILE}`,
        englishPrompt: intent.englishPrompt,
      };
    }

    // Step 3: Build geoCode → observation lookup
    const valueByGeo = new Map<string, ParsedObservation>();
    for (const obs of observations) {
      valueByGeo.set(obs.geoCode, obs);
    }

    // Step 4: Join to geometry
    const features: GeoJSON.Feature[] = [];
    for (const feature of geometry.features) {
      const nutsId = feature.properties?.nuts_id as string | undefined;
      if (!nutsId) continue;

      const obs = valueByGeo.get(nutsId);
      if (!obs) continue;

      features.push({
        type: "Feature",
        geometry: feature.geometry,
        properties: {
          ...feature.properties,
          [config.property]: obs.value,
          data_date: obs.timePeriod,
        },
      });
    }

    // Coverage check — need at least 40% (EU has many non-reporting countries)
    const coverage = features.length / geometry.features.length;
    if (coverage < 0.4) {
      return {
        found: false,
        error: `Low coverage: ${features.length}/${geometry.features.length} matched`,
        englishPrompt: intent.englishPrompt,
      };
    }

    // Apply sub-regional scope filter (Nordic, Baltics, EU, etc.)
    // Skip scopes not mapped to ISO2 (e.g. MIDDLE_EAST, SUB_SAHARAN_AFRICA — not in Eurostat)
    const scopeIso2 = scope ? COUNTRY_GROUPS_ISO2[scope.key] : undefined;
    if (scope && !scopeIso2) {
      return {
        found: false,
        error: `Scope ${scope.key} is not available in Eurostat`,
        englishPrompt: intent.englishPrompt,
      };
    }
    const filtered = scopeIso2
      ? features.filter((f) => scopeIso2.has(f.properties?.nuts_id as string))
      : features;

    if (filtered.length === 0) {
      return {
        found: false,
        error: `No countries in scope ${scope?.key} had Eurostat data`,
        englishPrompt: intent.englishPrompt,
      };
    }

    // Step 5: Build FeatureCollection
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: filtered,
    };
    const profile = profileDataset(fc);

    const scopeLabel = scope ? ` (${scope.key})` : "";
    const description = `${config.label} in Europe, ${filtered.length} countries${scopeLabel} (Eurostat)`;

    // Step 6: Cache
    const entry: CacheEntry = {
      data: fc,
      profile,
      source: "Eurostat",
      description,
      timestamp: Date.now(),
    };
    await setCache(cacheKey, entry);

    return {
      found: true,
      source: "Eurostat",
      description,
      featureCount: filtered.length,
      geometryType: profile.geometryType,
      attributes: profile.attributes.map((a) => a.name),
      cacheKey,
      profile,
      englishPrompt: intent.englishPrompt,
    };
  } catch {
    return {
      found: false,
      error: "Eurostat request failed",
      englishPrompt: intent.englishPrompt,
    };
  }
}
