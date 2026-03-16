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
import Anthropic from "@anthropic-ai/sdk";
import { profileDataset } from "../profiler";
import {
  getCachedData,
  setCache,
  type DataSearchResult,
  type CacheEntry,
} from "./data-search";

// ─── Constants ──────────────────────────────────────────────

const EUROSTAT_API_BASE =
  "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data";
const API_TIMEOUT_MS = 8_000;
const AI_TIMEOUT_MS = 2_500;
const INTENT_MODEL = "claude-haiku-4-5-20251001";
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

// ─── AI intent extraction ───────────────────────────────────

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
- isEuropean: true ONLY if the prompt explicitly mentions Europe, EU, European Union, or names 2+ European countries. If the prompt just says "by country", "global", "worldwide", or names non-European locations, return false.
  Examples: "GDP in Europe" → true. "Unemployment in EU countries" → true. "Minimilön i Europa" → true.
  Counter-examples: "Life expectancy by country" → false. "CO2 emissions per country" → false. "GDP per capita globally" → false. "Population of Brazil" → false.
- datasetKey: pick the best match from the list below. null if none match.
- englishPrompt: translate the prompt to concise English (max 15 words).

Available datasets:
${DATASET_DESCRIPTIONS}

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

// ─── SDMX-JSON parser ──────────────────────────────────────

interface ParsedObservation {
  geoCode: string;
  value: number;
  timePeriod: string;
}

/**
 * Parse Eurostat SDMX-JSON response and extract the latest value per
 * country (GEO dimension). Handles variable dimension ordering by
 * reading the `id` and `size` arrays from the response.
 */
function parseSdmxJson(
  data: Record<string, unknown>,
): ParsedObservation[] {
  const dimIds = data.id as string[] | undefined;
  const sizes = data.size as number[] | undefined;
  const values = data.value as Record<string, number> | undefined;
  const dimensions = data.dimension as Record<string, unknown> | undefined;

  if (!dimIds || !sizes || !values || !dimensions) return [];

  // Find geo and time dimension indices
  const geoIdx = dimIds.indexOf("geo");
  const timeIdx = dimIds.indexOf("time");
  if (geoIdx === -1 || timeIdx === -1) return [];

  // Get geo and time category mappings (index → code)
  const geoDim = dimensions.geo as {
    category?: { index?: Record<string, number> };
  };
  const timeDim = dimensions.time as {
    category?: { index?: Record<string, number> };
  };
  if (!geoDim?.category?.index || !timeDim?.category?.index) return [];

  const geoIndex = geoDim.category.index;
  const timeIndex = timeDim.category.index;

  // Invert: index → code
  const geoByIdx = new Map<number, string>();
  for (const [code, idx] of Object.entries(geoIndex)) {
    geoByIdx.set(idx, code);
  }
  const timeByIdx = new Map<number, string>();
  for (const [code, idx] of Object.entries(timeIndex)) {
    timeByIdx.set(idx, code);
  }

  // Compute dimension strides for flat index decoding
  const strides: number[] = new Array(dimIds.length);
  strides[dimIds.length - 1] = 1;
  for (let i = dimIds.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  // Iterate all values, group by geo, keep latest time period
  const latestByGeo = new Map<
    string,
    { value: number; timePeriod: string; timeIdx: number }
  >();

  for (const [flatIdxStr, value] of Object.entries(values)) {
    const flatIdx = parseInt(flatIdxStr, 10);

    // Decode geo and time indices from flat index
    const geoVal = Math.floor(flatIdx / strides[geoIdx]) % sizes[geoIdx];
    const timeVal = Math.floor(flatIdx / strides[timeIdx]) % sizes[timeIdx];

    const geoCode = geoByIdx.get(geoVal);
    const timePeriod = timeByIdx.get(timeVal);
    if (!geoCode || !timePeriod) continue;

    // Skip aggregate codes (EU27, EA20, etc.)
    if (geoCode.length > 2) continue;

    const existing = latestByGeo.get(geoCode);
    if (!existing || timeVal > existing.timeIdx) {
      latestByGeo.set(geoCode, { value, timePeriod, timeIdx: timeVal });
    }
  }

  const results: ParsedObservation[] = [];
  for (const [geoCode, entry] of latestByGeo) {
    results.push({
      geoCode,
      value: entry.value,
      timePeriod: entry.timePeriod,
    });
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
  const intent = await extractIntent(query);
  if (!intent) return { found: false };
  if (!intent.isEuropean) return { found: false };
  if (!intent.datasetKey) return { found: false };

  const config = EUROSTAT_DATASETS[intent.datasetKey];
  if (!config) return { found: false, englishPrompt: intent.englishPrompt };

  const cacheKey = `eurostat-${config.code}`;

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
    // Step 1: Fetch data from Eurostat
    const filterStr = config.filters ? `&${config.filters}` : "";
    const url = `${EUROSTAT_API_BASE}/${config.code}?format=JSON&sinceTimePeriod=2020${filterStr}`;
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
    const observations = parseSdmxJson(json as Record<string, unknown>);
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

    // Step 5: Build FeatureCollection
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features,
    };
    const profile = profileDataset(fc);

    const description = `${config.label} in Europe, ${features.length} countries (Eurostat)`;

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
      featureCount: features.length,
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
