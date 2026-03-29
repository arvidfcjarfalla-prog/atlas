/**
 * PxWeb API client.
 *
 * Searches tables, fetches metadata, queries data, and converts
 * JSON-stat2 responses to GeoJSON FeatureCollections.
 *
 * Supports PxWeb v2 (SCB, SSB), PxWeb v1 (Finland, Estonia, Latvia, etc.),
 * and Denmark StatBank (DST) via the StatsApiAdapter interface.
 */

import { profileDataset } from "../profiler";
import {
  setCache,
  getCachedData,
  type DataSearchResult,
} from "./data-search";
import type { OfficialStatsSource } from "./global-stats-registry";
import { worldBankAdapter } from "./worldbank-client";
import { createSdmxAdapter, SDMX_CONFIGS } from "./sdmx-client";

// ─── Types ──────────────────────────────────────────────────

export interface PxTableInfo {
  id: string;
  label: string;
  description: string;
  variableNames: string[];
  firstPeriod: string;
  lastPeriod: string;
  source: string;
  /** PxWeb v1: path within the database (e.g. "/synt") needed to build table URLs. */
  path?: string;
}

export interface PxDimensionValue {
  code: string;
  label: string;
}

export interface PxDimension {
  id: string;
  label: string;
  type: "geo" | "time" | "contents" | "regular";
  values: PxDimensionValue[];
}

export interface PxTableMetadata {
  id: string;
  label: string;
  source: string;
  dimensions: PxDimension[];
}

export interface PxDimensionSelection {
  dimensionId: string;
  valueCodes: string[];
}

/** Result from selectDimensionsWithAmbiguity — includes contents ambiguity info. */
export interface DimensionSelectionResult {
  selections: PxDimensionSelection[];
  /** True when contents dimension had 2+ values and keyword matching scored 0. */
  contentsAmbiguous: boolean;
  /** Contents dimension values (only set when ambiguous). */
  contentsValues?: PxDimensionValue[];
  /** Contents dimension ID (only set when ambiguous). */
  contentsDimensionId?: string;
}

export interface PxJsonStat2Response {
  version: string;
  class: string;
  label: string;
  source: string;
  id: string[];
  size: number[];
  dimension: Record<
    string,
    {
      label: string;
      category: {
        index: Record<string, number>;
        label: Record<string, string>;
      };
      extension?: Record<string, unknown>;
    }
  >;
  value: (number | null)[];
}

export interface PxDataRecord {
  regionCode: string;
  regionLabel: string;
  metricCode: string;
  metricLabel: string;
  timePeriod: string;
  value: number | null;
}

// ─── Constants ──────────────────────────────────────────────

const SEARCH_TIMEOUT_MS = 8_000;
const METADATA_TIMEOUT_MS = 8_000;
const DATA_TIMEOUT_MS = 15_000;
const MAX_CELLS = 100_000;

/** Words to strip from prompts when building PxWeb search queries. */
const PX_STOP_WORDS = new Set([
  // English
  "show", "me", "map", "of", "the", "a", "an", "in", "on", "by", "with",
  "for", "and", "or", "to", "create", "make", "display", "visualize", "plot",
  "draw", "all", "each", "every", "per", "compare", "data", "statistics",
  "stat", "stats", "chart", "graph", "table", "rate", "rates", "number",
  "median", "average", "mean", "total",
  // English modifiers (qualifiers, not topic words)
  "percentage", "percent", "proportion", "share", "level", "levels",
  "highest", "lowest", "most", "least",
  // Swedish
  "visa", "visar", "karta", "över", "skapa", "gör", "alla", "varje",
  "per", "jämför", "statistik", "antal", "medel",
  // Swedish modifiers (qualifiers, not topic words)
  "procentuell", "procentuella", "procentuellt", "procent",
  "andel", "andelen", "andelar",
  "högst", "lägst", "flest", "mest", "minst",
  "nivå", "nivåer",
]);

/** Country/geo names to strip from search queries (already resolved via resolver). */
const PX_COUNTRY_NAMES = new Set([
  "sweden", "sverige", "swedish", "svenska", "svenskt",
  "norway", "norge", "norwegian", "norska",
  "denmark", "danmark", "danish", "danska", "danske",
  "finland", "finnish", "finska", "suomi",
  "iceland", "icelandic", "isländska", "ísland",
  "estonia", "estonian", "eesti",
  "latvia", "latvian", "latvija",
  "lithuania", "lithuanian", "lietuva",
  "slovenia", "slovenian", "slovenija",
  "switzerland", "swiss", "schweiz", "suisse", "svizzera",
  "cyprus", "cypriot",
  "macedonia", "north macedonia", "makedonija",
  "municipalities", "municipality", "municipal",
  "kommuner", "kommun", "kommunerna",
  "counties", "county", "lan", "län",
  "regions", "region", "regioner",
  "states", "state", "provinces", "province",
  "fylke", "fylker",
]);

/** Geographic level keywords in prompts → normalized level hint. */
const GEO_LEVEL_KEYWORDS: Record<string, string> = {
  // Swedish
  kommuner: "municipality", kommun: "municipality", kommunerna: "municipality",
  lan: "county", län: "county",
  regioner: "region",
  // Norwegian
  kommune: "municipality",
  fylke: "county", fylker: "county",
  // English
  municipalities: "municipality", municipality: "municipality",
  counties: "county", county: "county",
  states: "admin1", provinces: "admin1",
};

/** Map from geo level hint to variableNames patterns that match that level. */
const GEO_LEVEL_VARIABLE_PATTERNS: Record<string, string[]> = {
  municipality: ["kommun", "kommuner", "kommune", "municipality"],
  county: ["län", "länskod", "fylke", "county"],
  region: ["region"],
  admin1: ["region", "state", "province"],
};

/**
 * Extract geographic level hint from the user prompt.
 *
 * Scans for level keywords (kommuner, län, county, etc.) and returns
 * a normalized hint. Must be called BEFORE buildPxSearchQuery strips
 * these words. Returns null for prompts without a clear level hint.
 */
export function extractGeoLevelHint(prompt: string): string | null {
  const words = prompt
    .toLowerCase()
    .replace(/[^\wåäöæøüß\s-]/g, " ")
    .split(/\s+/);
  for (const word of words) {
    const hint = GEO_LEVEL_KEYWORDS[word];
    if (hint) return hint;
  }
  return null;
}

/** Codes/labels that indicate a "total" or aggregate value. */
const TOTAL_CODES = new Set(["t", "tot", "total", "0"]);
const TOTAL_LABEL_PATTERNS = [
  "total", "both", "all", "samtliga", "alle", "begge",
  "totalt", "hela", "riket", "hela riket",
];

/** Dimension ID patterns for classification. */
const GEO_PATTERNS = [
  "region", "kommun", "kommune", "fylke", "county", "län",
  "municipality", "area", "geo", "område",
  // Estonian
  "maakond", "omavalitsus",
  // Icelandic
  "landshluti", "sveitarfélag",
  // Finnish
  "alue", "maakunta", "kunta",
  // Latvian
  "teritori",
  // Swiss (de/fr/it)
  "kanton", "canton", "cantone", "gemeinde", "commune",
  // Slovenian
  "regija", "občin",
  // Georgian
  "მხარე",
];
const TIME_PATTERNS = ["tid", "time", "year", "month", "quarter", "period", "år"];
const CONTENTS_PATTERNS = [
  "contentscode", "contents", "tabellinnehåll", "indhold",
  "indicator", "näitaja", "indikator", "kennzahl", "kazalnik",
  // Finnish, Latvian, Swiss French/Italian, Slovenian
  "indikaattori", "rādītājs", "indicateur", "indicatore", "kazalec",
];

/**
 * Multi-word English → Swedish compound phrases.
 * Applied before single-word translations to produce accurate SCB search terms.
 */
const EN_TO_SV_PHRASES: [string, string][] = [
  ["education level", "utbildningsnivå"],
  ["life expectancy", "medellivslängd"],
  ["birth rate", "födelsetal"],
  ["death rate", "dödstal"],
  ["crime rate", "brottslighet"],
  ["employment rate", "sysselsättningsgrad"],
  ["unemployment rate", "arbetslöshet"],
  ["housing prices", "bostadspriser"],
  ["house prices", "bostadspriser"],
];

/**
 * Swedish colloquial/derived → SCB canonical terms.
 * Users write "högskoleutbildade" but SCB indexes "utbildningsnivå".
 * Applied after EN→SV translation to normalize Swedish search terms.
 */
const SV_SYNONYMS: [string, string][] = [
  // Education
  ["högskoleutbildade", "utbildningsnivå"],
  ["högskoleutbildad", "utbildningsnivå"],
  ["grundskoleutbildade", "utbildningsnivå"],
  ["gymnasieutbildade", "utbildningsnivå"],
  ["eftergymnasial", "utbildningsnivå"],
  ["förgymnasial", "utbildningsnivå"],
  ["utbildade", "utbildning"],
  // Income & economy
  ["medelinkomst", "förvärvsinkomst"],
  ["snittinkomst", "förvärvsinkomst"],
  ["medianinkomst", "förvärvsinkomst"],
  ["inkomster", "inkomst"],
  ["löner", "lön"],
  // Demographics
  ["invånare", "folkmängd"],
  ["befolkning", "folkmängd"],
  ["befolkningstillväxt", "folkmängd"],
  ["inflyttade", "flyttning"],
  ["utflyttade", "flyttning"],
  ["inflyttning", "flyttning"],
  ["utflyttning", "flyttning"],
  // Health & social
  ["sjukskrivna", "sjukpenning"],
  ["sjukskrivning", "sjukpenning"],
  ["arbetslösa", "arbetslöshet"],
  ["förvärvsarbetande", "sysselsättning"],
  ["sysselsatta", "sysselsättning"],
  // Housing
  ["bostäder", "bostad"],
  ["bostadspriser", "bostad"],
  ["hyror", "hyra"],
];

/**
 * Nordic language (Norwegian, Danish, Finnish, Icelandic) statistical terms
 * → English equivalents.
 * Applied when searching non-Swedish PxWeb APIs (SSB, Statistics Denmark, etc.)
 * that expose English-language tables.
 */
const NORDIC_TO_EN: Record<string, string> = {
  // Norwegian / Danish (population & demographics)
  befolkning: "population",
  befolkningstall: "population",
  folkemengde: "population",
  folkegruppe: "population",
  folketal: "population",
  innbyggere: "population",
  innvandring: "immigration",
  utvandring: "emigration",
  fødsler: "births",
  fødselstall: "births",
  dødsfall: "deaths",
  dødstall: "deaths",
  levealder: "life expectancy",
  // Norwegian / Danish (labor & economy)
  sysselsetting: "employment",
  sysselsatte: "employment",
  arbeidsledighet: "unemployment",
  arbeidsledige: "unemployment",
  inntekt: "income",
  lønn: "wages",
  bruttonasjonalprodukt: "gdp",
  // Norwegian / Danish (housing)
  bolig: "housing",
  boliger: "housing",
  husleie: "rent",
  // Norwegian / Danish (geography levels)
  fylke: "county",
  fylker: "county",
  kommune: "municipality",
  kommuner: "municipality",
  // Norwegian / Danish (education)
  utdanning: "education",
  utdanningsnivå: "educational attainment",
  // Norwegian / Danish (health)
  helse: "health",
  sykdom: "disease",
  // Danish-specific
  indkomst: "income",
  arbejdsløshed: "unemployment",
  beskæftigelse: "employment",
  uddannelse: "education",
  sundhed: "health",
  kriminalitet: "crime",
  indvandring: "immigration",
  udvandring: "emigration",
  dødsfald: "deaths",
  middellevetid: "life expectancy",
  // Finnish
  väestö: "population",
  väestömäärä: "population",
  syntyvyys: "births",
  kuolleisuus: "deaths",
  työttömyys: "unemployment",
  työllisyys: "employment",
  tulot: "income",
  // Icelandic
  íbúar: "population",
  mannfjöldi: "population",
  atvinnuleysi: "unemployment",
};

/**
 * English → Swedish translations for common statistical terms.
 * Used when searching SCB (Swedish) PxWeb APIs with English prompts.
 */
const EN_TO_SV: Record<string, string> = {
  income: "förvärvsinkomst",
  salary: "lön",
  wage: "lön",
  wages: "löner",
  population: "folkmängd",
  unemployment: "arbetslöshet",
  employment: "sysselsättning",
  housing: "bostad",
  education: "utbildning",
  health: "hälsa",
  crime: "brott",
  tax: "skatt",
  rent: "hyra",
  birth: "födda",
  death: "döda",
  deaths: "döda",
  migration: "flyttning",
  poverty: "fattigdom",
  elderly: "äldre",
  children: "barn",
  price: "pris",
  prices: "priser",
  car: "bil",
  cars: "bilar",
  energy: "energi",
  electricity: "el",
  water: "vatten",
  forest: "skog",
  agriculture: "jordbruk",
  divorce: "skilsmässa",
  marriage: "giftermål",
  commuting: "pendling",
  commute: "pendling",
  emissions: "utsläpp",
  emission: "utsläpp",
  pollution: "utsläpp",
};

// ─── Pure functions ─────────────────────────────────────────

/**
 * Build a search query for PxWeb table search from a user prompt.
 * Strips stop words, country names, and keeps topic keywords.
 */
export function buildPxSearchQuery(prompt: string): string {
  const words = prompt
    .toLowerCase()
    .replace(/[^\wåäöæøüß\s-]/g, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 1 &&
        !/^\d{4}$/.test(w) &&       // strip 4-digit years
        !PX_STOP_WORDS.has(w) &&
        !PX_COUNTRY_NAMES.has(w),
    );
  return words.join(" ");
}

/**
 * Translate a search query for the target API language.
 *
 * - lang="sv": English prompt words → Swedish SCB terms, then SV synonym normalization.
 * - lang="en": Nordic-language words → English equivalents (for SSB, Statistics Denmark, etc.)
 * - other: returned unchanged.
 */
export function translateSearchQuery(query: string, lang: string): string {
  if (lang === "en") {
    // Translate Nordic statistical terms to English for non-Swedish PxWeb APIs
    const words = query.split(/\s+/);
    const translated = words.map((w) => NORDIC_TO_EN[w.toLowerCase()] ?? w);
    return translated.join(" ");
  }

  if (lang !== "sv") return query;

  // Swedish path: English → Swedish + SV synonym normalization
  // 1. Apply multi-word English phrase translations first
  let result = query;
  for (const [en, sv] of EN_TO_SV_PHRASES) {
    result = result.replace(new RegExp(en, "gi"), sv);
  }
  // 2. Single-word English → Swedish translations
  const words = result.split(/\s+/);
  const translated = words.map((w) => EN_TO_SV[w] ?? w);
  result = translated.join(" ");
  // 3. Restore missing Swedish diacritics (users typing without å/ä/ö)
  result = result
    .replace(/\butbildningsniva\b/gi, "utbildningsnivå")
    .replace(/\bfolkmangd\b/gi, "folkmängd")
    .replace(/\bforvarvsinkomst\b/gi, "förvärvsinkomst")
    .replace(/\barbetstillfallen\b/gi, "arbetstillfällen")
    .replace(/\bfolkhogskola\b/gi, "folkhögskola");
  // 4. Normalize Swedish colloquial terms to SCB canonical terms
  for (const [colloquial, canonical] of SV_SYNONYMS) {
    result = result.replace(new RegExp(colloquial, "gi"), canonical);
  }
  return result;
}

/**
 * Check if a baseUrl is a PxWeb v2 API.
 */
export function isPxWebV2(baseUrl: string): boolean {
  return baseUrl.includes("/v2");
}

/**
 * Rank tables by relevance to the user prompt.
 * Higher score = better match.
 *
 * When `geoLevelHint` is provided (e.g. "municipality" from "kommuner"),
 * tables whose variableNames match the desired level get a strong boost
 * (+10) while tables with other geo dimensions get a weak boost (+2).
 * Without a hint, the original flat +5 is applied.
 */
export function rankTables(
  tables: PxTableInfo[],
  prompt: string,
  geoLevelHint?: string | null,
  translatedQuery?: string,
): PxTableInfo[] {
  if (tables.length === 0) return [];

  // Build keyword lists from both English prompt and translated query
  const promptKeywords = prompt
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const translatedKeywords = translatedQuery
    ? translatedQuery.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
    : [];
  const allKeywords = [...new Set([...promptKeywords, ...translatedKeywords])];

  const currentYear = new Date().getFullYear();

  const scored = tables.map((table) => {
    let score = 0;
    const labelLower = table.label.toLowerCase();
    const descLower = (table.description || "").toLowerCase();
    const vars = table.variableNames.map((v) => v.toLowerCase());

    // Keyword matches in label (strongest signal for topic relevance)
    for (const kw of allKeywords) {
      if (labelLower.includes(kw)) score += 3;
      if (descLower.includes(kw)) score += 1;
    }

    // Penalize tables where the search term appears as a breakdown dimension
    // rather than the table's actual topic. E.g. "Livslängdstabell efter utbildningsnivå"
    // has utbildningsnivå as a dimension, not as the subject.
    const searchTermInLabel = translatedKeywords.some((kw) => labelLower.includes(kw));
    const searchTermOnlyInVars = !searchTermInLabel &&
      translatedKeywords.some((kw) => vars.some((v) => v.includes(kw)));
    if (searchTermOnlyInVars) {
      score -= 3;
    }

    // Prefer simpler tables (fewer dimensions = more likely a direct stat)
    if (vars.length <= 4) score += 2;
    else if (vars.length >= 7) score -= 1;

    // Has a geographic dimension (mappable data)
    const hasGeo = vars.some((v) =>
      GEO_PATTERNS.some((p) => v.includes(p)),
    );
    if (hasGeo) {
      if (geoLevelHint) {
        // Check if any variableName matches the desired geo level
        const desiredPatterns = GEO_LEVEL_VARIABLE_PATTERNS[geoLevelHint] ?? [];
        const matchesDesiredLevel = vars.some((v) =>
          desiredPatterns.some((p) => v.includes(p)),
        );
        score += matchesDesiredLevel ? 10 : 2;
      } else {
        score += 5;
      }
    }

    // Recent data bonus
    if (table.lastPeriod) {
      const yearMatch = table.lastPeriod.match(/(\d{4})/);
      if (yearMatch) {
        const lastYear = parseInt(yearMatch[1], 10);
        if (currentYear - lastYear <= 2) score += 2;
      }
    }

    return { table, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.table);
}

/**
 * Classify a dimension by its ID and label.
 */
export function classifyDimension(
  id: string,
  label: string,
): PxDimension["type"] {
  const lower = id.toLowerCase();
  const labelLower = label.toLowerCase();

  if (CONTENTS_PATTERNS.some((p) => lower.includes(p) || labelLower.includes(p))) return "contents";
  if (TIME_PATTERNS.some((p) => lower.includes(p) || labelLower.includes(p))) return "time";
  if (GEO_PATTERNS.some((p) => lower.includes(p) || labelLower.includes(p))) return "geo";
  return "regular";
}

/**
 * Find the "total" or aggregate value in a list of dimension values.
 * Returns the code, or null if no total found.
 */
function findTotalValue(values: PxDimensionValue[]): string | null {
  // Check codes first
  for (const v of values) {
    if (TOTAL_CODES.has(v.code.toLowerCase())) return v.code;
  }
  // Check labels
  for (const v of values) {
    const labelLower = v.label.toLowerCase();
    if (TOTAL_LABEL_PATTERNS.some((p) => labelLower.includes(p))) return v.code;
  }
  return null;
}

/**
 * Remove historical/discontinued codes from a geo dimension.
 *
 * Stats agencies (SSB, SCB, etc.) often keep historical administrative units
 * in the same dimension as current ones. Historical codes are identified by
 * labels that contain a date range or "closed" marker:
 *   "Viken (2020-2023)" — active only 2020-2023
 *   "Akershus (-2019)"  — dissolved in 2019
 *   "Bergen (-1971)"    — historical city
 *
 * When the remaining active set has ≥3 codes, remove the historical ones.
 * Otherwise return the original set (prefer over-inclusive to empty).
 */
function filterHistoricalCodes(values: PxDimensionValue[]): PxDimensionValue[] {
  const HISTORICAL_PATTERN = /\(\s*-?\d{4}|\(\d{4}\s*-\s*\d{4}\)/;
  const active = values.filter((v) => !HISTORICAL_PATTERN.test(v.label));
  return active.length >= 3 ? active : values;
}

/**
 * Filter mixed-level numeric geo codes to the most granular level.
 *
 * SCB (and other national stats agencies) often pack county codes (2-digit)
 * and municipality codes (4-digit) into one "Region" dimension. When both
 * are present, keep only the longest (most granular) group — provided it
 * has at least 10 codes (enough for a meaningful map).
 */
function filterToMostGranularLevel(codes: string[], geoHint?: string | null): string[] {
  if (codes.length === 0) return codes;

  const byLength = new Map<number, string[]>();
  for (const c of codes) {
    if (/^\d+$/.test(c)) {
      const group = byLength.get(c.length) ?? [];
      group.push(c);
      byLength.set(c.length, group);
    }
  }

  // Only filter when there are multiple numeric code lengths
  if (byLength.size <= 1) return codes;

  // If caller wants county level, prefer 2-digit codes (Swedish county codes 01-25)
  if (geoHint === "county") {
    const countyLen2 = byLength.get(2);
    if (countyLen2 && countyLen2.length >= 10) return countyLen2;
    // Hint says county but no 2-digit codes — signal "wrong table" with
    // a sentinel empty array. Callers MUST check for length 0 and skip
    // the data fetch so the retry loop tries the next table.
    return [];
  }
  // If caller wants municipality level, prefer 4-digit codes
  if (geoHint === "municipality") {
    const muniLen4 = byLength.get(4);
    if (muniLen4 && muniLen4.length >= 10) return muniLen4;
    // Hint says municipality but no 4-digit codes — wrong table.
    return [];
  }

  // Default: most granular (longest codes) when there are enough of them
  const maxLen = Math.max(...byLength.keys());
  const granular = byLength.get(maxLen)!;
  if (granular.length >= 10) return granular;

  return codes;
}

/**
 * Select dimension values for a PxWeb data query.
 * Heuristic: latest time, all regions, totals for filters, keyword-match for contents.
 */
export function selectDimensions(
  metadata: PxTableMetadata,
  prompt: string,
  geoLevelHint?: string | null,
): PxDimensionSelection[] {
  const selections: PxDimensionSelection[] = [];
  const promptLower = prompt.toLowerCase();
  const promptKeywords = promptLower.split(/\s+/).filter((w) => w.length > 2);

  let geoDimIndex = -1;

  for (let i = 0; i < metadata.dimensions.length; i++) {
    const dim = metadata.dimensions[i];

    if (dim.values.length === 0) continue;

    switch (dim.type) {
      case "time": {
        // Latest period only
        const lastValue = dim.values[dim.values.length - 1];
        selections.push({ dimensionId: dim.id, valueCodes: [lastValue.code] });
        break;
      }

      case "geo": {
        geoDimIndex = selections.length;
        // Exclude national aggregate "00" and historical/discontinued units
        let activeValues = filterHistoricalCodes(
          dim.values.filter((v) => v.code !== "00"),
        );
        // Also exclude non-geographic special codes (abroad, ocean, shelf, etc.)
        const NON_GEO_LABELS = /abroad|ocean|continental shelf|jan mayen|svalbard|not resident|not stated/i;
        activeValues = activeValues.filter((v) => !NON_GEO_LABELS.test(v.label));
        let codes = activeValues.map((v) => v.code);
        // When mixed levels exist (e.g. county + municipality), select level matching hint
        codes = filterToMostGranularLevel(codes, geoLevelHint);
        // Empty codes with a geo hint = wrong table for this level.
        // Return empty selections so resolveOneTable skips this table.
        if (codes.length === 0 && geoLevelHint) {
          return [];
        }
        // If filtering removed everything (only "00" existed), include all values
        selections.push({
          dimensionId: dim.id,
          valueCodes: codes.length > 0 ? codes : dim.values.map((v) => v.code),
        });
        break;
      }

      case "contents": {
        if (dim.values.length === 1) {
          selections.push({ dimensionId: dim.id, valueCodes: [dim.values[0].code] });
        } else {
          // Try keyword match
          let bestCode = dim.values[0].code;
          let bestScore = 0;
          for (const v of dim.values) {
            const labelLower = v.label.toLowerCase();
            let score = 0;
            for (const kw of promptKeywords) {
              if (labelLower.includes(kw)) score++;
            }
            if (score > bestScore) {
              bestScore = score;
              bestCode = v.code;
            }
          }
          selections.push({ dimensionId: dim.id, valueCodes: [bestCode] });
        }
        break;
      }

      case "regular": {
        // Pick total/aggregate if available, else first value
        const totalCode = findTotalValue(dim.values);
        selections.push({
          dimensionId: dim.id,
          valueCodes: [totalCode ?? dim.values[0].code],
        });
        break;
      }
    }
  }

  // Cell count guard
  const totalCells = selections.reduce((acc, s) => acc * s.valueCodes.length, 1);
  if (totalCells > MAX_CELLS && geoDimIndex >= 0) {
    // Trim geographic dimension to stay under limit
    const otherCells = selections.reduce(
      (acc, s, i) => (i === geoDimIndex ? acc : acc * s.valueCodes.length),
      1,
    );
    const maxGeo = Math.floor(MAX_CELLS / Math.max(otherCells, 1));
    selections[geoDimIndex].valueCodes = selections[geoDimIndex].valueCodes.slice(0, maxGeo);
  }

  return selections;
}

/**
 * Like selectDimensions, but also reports whether the contents dimension
 * selection was ambiguous (keyword matching scored 0 with 2+ values).
 *
 * When `contentsAmbiguous` is true, the caller can use an AI fallback
 * to pick a better contents value before fetching data.
 */
export function selectDimensionsWithAmbiguity(
  metadata: PxTableMetadata,
  _prompt: string,
  geoLevelHint?: string | null,
): DimensionSelectionResult {
  const selections: PxDimensionSelection[] = [];

  let geoDimIndex = -1;
  let contentsAmbiguous = false;
  let contentsValues: PxDimensionValue[] | undefined;
  let contentsDimensionId: string | undefined;

  for (let i = 0; i < metadata.dimensions.length; i++) {
    const dim = metadata.dimensions[i];

    if (dim.values.length === 0) continue;

    switch (dim.type) {
      case "time": {
        const lastValue = dim.values[dim.values.length - 1];
        selections.push({ dimensionId: dim.id, valueCodes: [lastValue.code] });
        break;
      }

      case "geo": {
        geoDimIndex = selections.length;
        // Exclude national aggregate "00", historical units, and non-geographic specials
        let activeValues2 = filterHistoricalCodes(
          dim.values.filter((v) => v.code !== "00"),
        );
        const NON_GEO_LABELS2 = /abroad|ocean|continental shelf|jan mayen|svalbard|not resident|not stated/i;
        activeValues2 = activeValues2.filter((v) => !NON_GEO_LABELS2.test(v.label));
        let codes2 = activeValues2.map((v) => v.code);
        // When mixed levels exist, select level matching the geo hint
        codes2 = filterToMostGranularLevel(codes2, geoLevelHint);
        // Empty codes with a geo hint = wrong table for this level
        if (codes2.length === 0 && geoLevelHint) {
          return { selections: [], contentsAmbiguous: false };
        }
        selections.push({
          dimensionId: dim.id,
          valueCodes: codes2.length > 0 ? codes2 : dim.values.map((v) => v.code),
        });
        break;
      }

      case "contents": {
        // Default to first value; AI fallback will override for 2+ values
        selections.push({ dimensionId: dim.id, valueCodes: [dim.values[0].code] });
        if (dim.values.length >= 2) {
          // Always delegate to AI for multi-value contents — keyword heuristics
          // are too brittle across languages (Estonian, Icelandic, Finnish, etc.)
          contentsAmbiguous = true;
          contentsValues = dim.values;
          contentsDimensionId = dim.id;
        }
        break;
      }

      case "regular": {
        const totalCode = findTotalValue(dim.values);
        selections.push({
          dimensionId: dim.id,
          valueCodes: [totalCode ?? dim.values[0].code],
        });
        break;
      }
    }
  }

  // Cell count guard
  const totalCells = selections.reduce((acc, s) => acc * s.valueCodes.length, 1);
  if (totalCells > MAX_CELLS && geoDimIndex >= 0) {
    const otherCells = selections.reduce(
      (acc, s, i) => (i === geoDimIndex ? acc : acc * s.valueCodes.length),
      1,
    );
    const maxGeo = Math.floor(MAX_CELLS / Math.max(otherCells, 1));
    selections[geoDimIndex].valueCodes = selections[geoDimIndex].valueCodes.slice(0, maxGeo);
  }

  return {
    selections,
    contentsAmbiguous,
    ...(contentsAmbiguous ? { contentsValues, contentsDimensionId } : {}),
  };
}

/**
 * Parse a JSON-stat2 response into flat data records.
 *
 * The value array is indexed by the Cartesian product of dimensions.
 * For dimensions with size [R, C, T]: index = r*(C*T) + c*T + t
 */
export function jsonStat2ToRecords(
  response: PxJsonStat2Response,
  geoDimId: string,
  contentsDimId: string | null,
  timeDimId: string,
  fallbackMetricLabel?: string,
): PxDataRecord[] {
  const records: PxDataRecord[] = [];

  const dimIds = response.id;
  const sizes = response.size;

  // Build code-to-label lookup for each dimension
  const dimMeta = dimIds.map((dimId) => {
    const dim = response.dimension[dimId];
    const indexEntries = Object.entries(dim.category.index).sort(
      ([, a], [, b]) => a - b,
    );
    const codes = indexEntries.map(([code]) => code);
    const labels = dim.category.label;
    return { dimId, codes, labels };
  });

  // Find dimension indices
  const geoIdx = dimIds.indexOf(geoDimId);
  const contIdx = contentsDimId ? dimIds.indexOf(contentsDimId) : -1;
  const timeIdx = dimIds.indexOf(timeDimId);

  // Geo and time are required; contents is optional (single-measure tables)
  if (geoIdx === -1 || timeIdx === -1) {
    return records;
  }

  // Iterate through all values using dimension strides
  const totalValues = response.value.length;

  // Compute strides for each dimension
  const strides = new Array(dimIds.length).fill(1);
  for (let i = dimIds.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  for (let idx = 0; idx < totalValues; idx++) {
    const val = response.value[idx];
    if (val === null) continue;

    // Decompose flat index into per-dimension indices
    const indices = new Array(dimIds.length);
    let remainder = idx;
    for (let d = 0; d < dimIds.length; d++) {
      indices[d] = Math.floor(remainder / strides[d]);
      remainder = remainder % strides[d];
    }

    const geoCode = dimMeta[geoIdx].codes[indices[geoIdx]];
    const contCode = contIdx >= 0 ? dimMeta[contIdx].codes[indices[contIdx]] : "_single";
    const timeCode = dimMeta[timeIdx].codes[indices[timeIdx]];

    records.push({
      regionCode: geoCode,
      regionLabel: dimMeta[geoIdx].labels[geoCode] ?? geoCode,
      metricCode: contCode,
      metricLabel: contIdx >= 0
        ? (dimMeta[contIdx].labels[contCode] ?? contCode)
        : (fallbackMetricLabel ?? "Value"),
      timePeriod: timeCode,
      value: val,
    });
  }

  return records;
}

/**
 * Convert PxWeb data records to a GeoJSON FeatureCollection.
 *
 * For region/municipality data: features have null geometry (no polygons available).
 * For country-level single values: would join with Natural Earth (not yet implemented).
 */
export function recordsToGeoJSON(
  records: PxDataRecord[],
  metricLabel: string,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = records.map((r) => ({
    type: "Feature",
    geometry: null as unknown as GeoJSON.Geometry,
    properties: {
      name: r.regionLabel,
      regionCode: r.regionCode,
      value: r.value,
      metric: metricLabel,
      year: r.timePeriod,
    },
  }));

  return {
    type: "FeatureCollection",
    features,
  };
}

// ─── Network functions ──────────────────────────────────────

/**
 * Search for tables in a PxWeb v2 API.
 */
export async function searchTables(
  baseUrl: string,
  query: string,
  lang = "en",
  pageSize = 10,
): Promise<PxTableInfo[]> {
  try {
    const url = `${baseUrl}/tables?lang=${lang}&query=${encodeURIComponent(query)}&pageSize=${pageSize}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];

    const json = await res.json();
    const tables: PxTableInfo[] = (json.tables ?? json ?? []).map(
      (t: Record<string, unknown>) => ({
        id: t.id as string,
        label: (t.label as string) ?? "",
        description: (t.description as string) ?? "",
        variableNames: (t.variableNames as string[]) ?? [],
        firstPeriod: (t.firstPeriod as string) ?? "",
        lastPeriod: (t.lastPeriod as string) ?? "",
        source: (t.source as string) ?? "",
      }),
    );
    return tables;
  } catch {
    return [];
  }
}

/**
 * Fetch table metadata (dimensions and their values) from a PxWeb v2 API.
 */
export async function fetchMetadata(
  baseUrl: string,
  tableId: string,
  lang = "en",
): Promise<PxTableMetadata | null> {
  try {
    const url = `${baseUrl}/tables/${encodeURIComponent(tableId)}/metadata?lang=${lang}&outputFormat=json`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const json = await res.json();

    // Parse JSON-stat2-style metadata into our types
    // The metadata response has a "variables" array in some versions,
    // or a "dimension" object in JSON-stat2 format.
    const dimensions: PxDimension[] = [];

    if (json.variables && Array.isArray(json.variables)) {
      // Standard PxWeb metadata format
      for (const v of json.variables) {
        const id = v.id ?? v.code ?? "";
        const label = v.text ?? v.label ?? id;
        const values: PxDimensionValue[] = [];

        if (v.values && v.valueTexts) {
          for (let i = 0; i < v.values.length; i++) {
            values.push({
              code: v.values[i],
              label: v.valueTexts[i] ?? v.values[i],
            });
          }
        }

        dimensions.push({
          id,
          label,
          type: classifyDimension(id, label),
          values,
        });
      }
    } else if (json.dimension) {
      // JSON-stat2 format
      const dimIds: string[] = json.id ?? Object.keys(json.dimension);
      for (const dimId of dimIds) {
        const dim = json.dimension[dimId];
        if (!dim) continue;
        const label = dim.label ?? dimId;
        const values: PxDimensionValue[] = [];

        if (dim.category) {
          const indexEntries = Object.entries(
            dim.category.index as Record<string, number>,
          ).sort(([, a], [, b]) => (a as number) - (b as number));
          for (const [code] of indexEntries) {
            values.push({
              code,
              label: dim.category.label?.[code] ?? code,
            });
          }
        }

        dimensions.push({
          id: dimId,
          label,
          type: classifyDimension(dimId, label),
          values,
        });
      }
    } else {
      return null;
    }

    return {
      id: tableId,
      label: json.title ?? json.label ?? tableId,
      source: json.source ?? "",
      dimensions,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch data from a PxWeb v2 API using GET with valueCodes parameters.
 */
export async function fetchData(
  baseUrl: string,
  tableId: string,
  selections: PxDimensionSelection[],
  lang = "en",
): Promise<PxJsonStat2Response | null> {
  try {
    const params = new URLSearchParams();
    params.set("lang", lang);
    params.set("outputFormat", "json-stat2");

    for (const sel of selections) {
      // PxWeb v2 uses valueCodes[DimId]=code1,code2,...
      // Use wildcard when the joined codes string is long enough to risk
      // exceeding URL length limits (SCB's v2 API returns 404 above ~2000 chars).
      // Threshold on string length rather than code count so short codes (e.g. "01")
      // don't trigger wildcards unnecessarily on sources like SSB or Statistics Finland.
      const joined = sel.valueCodes.join(",");
      const codes = joined.length > 1500 ? "*" : joined;
      params.set(`valueCodes[${sel.dimensionId}]`, codes);
    }

    const url = `${baseUrl}/tables/${encodeURIComponent(tableId)}/data?${params.toString()}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(DATA_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as PxJsonStat2Response;
    if (!json.value || !json.id || !json.size) return null;

    return json;
  } catch {
    return null;
  }
}

// ─── Stats API adapter ──────────────────────────────────────

/**
 * Adapter interface for structured statistics APIs.
 * Allows the resolution pipeline to work with PxWeb v2, DST, and
 * future API types through a common interface.
 */
export interface StatsApiAdapter {
  searchTables(baseUrl: string, query: string, lang: string, pageSize?: number): Promise<PxTableInfo[]>;
  fetchMetadata(baseUrl: string, tableId: string, lang: string): Promise<PxTableMetadata | null>;
  fetchData(baseUrl: string, tableId: string, selections: PxDimensionSelection[], lang: string): Promise<PxJsonStat2Response | null>;
}

export const pxwebV2Adapter: StatsApiAdapter = { searchTables, fetchMetadata, fetchData };
export const dstAdapter: StatsApiAdapter = {
  searchTables: searchTablesDst,
  fetchMetadata: fetchMetadataDst,
  fetchData: fetchDataDst,
};

/**
 * Get the appropriate API adapter for a source.
 * Returns null for unsupported sources.
 */
export function getStatsAdapter(source: OfficialStatsSource): StatsApiAdapter | null {
  if (source.apiType === "pxweb" && source.baseUrl.includes("/v2")) return pxwebV2Adapter;
  if (source.apiType === "pxweb" && source.baseUrl.includes("/v1")) return pxwebV1Adapter;
  if (source.id === "dk-dst") return dstAdapter;
  if (source.id === "intl-worldbank") return worldBankAdapter;
  if (source.id === "us-fred") return fredAdapter;
  if (source.apiType === "sdmx" && SDMX_CONFIGS[source.id]) return createSdmxAdapter(SDMX_CONFIGS[source.id]);
  return null;
}

// ─── Denmark StatBank (DST) API ─────────────────────────────

/**
 * Search tables in the Denmark StatBank API.
 * POST-based search returning table metadata.
 */
async function searchTablesDst(
  baseUrl: string,
  query: string,
  lang = "en",
  _pageSize?: number,
): Promise<PxTableInfo[]> {
  try {
    const res = await fetch(`${baseUrl}/tables`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, lang }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];

    const json = await res.json();
    return (json ?? []).map((t: Record<string, unknown>) => ({
      id: t.id as string,
      label: (t.text as string) ?? "",
      description: (t.description as string) ?? "",
      variableNames: (t.variables as string[]) ?? [],
      firstPeriod: (t.firstPeriod as string) ?? "",
      lastPeriod: (t.latestPeriod as string) ?? "",
      source: "Statistics Denmark",
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch table metadata from the Denmark StatBank API.
 * DST returns {id, text, variables: [{id, text, values: [{id, text}], time, map, elimination}]}.
 */
async function fetchMetadataDst(
  baseUrl: string,
  tableId: string,
  lang = "en",
): Promise<PxTableMetadata | null> {
  try {
    const res = await fetch(`${baseUrl}/tableinfo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: tableId, lang }),
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const json = await res.json();
    const dimensions: PxDimension[] = [];

    if (json.variables && Array.isArray(json.variables)) {
      for (const v of json.variables) {
        const id = v.id ?? v.code ?? "";
        const label = v.text ?? v.label ?? id;

        // DST provides explicit time and map flags
        let type: PxDimension["type"];
        if (v.time === true) {
          type = "time";
        } else if (v.map) {
          type = "geo";
        } else {
          type = classifyDimension(id, label);
        }

        // DST values are {id, text} objects
        const values: PxDimensionValue[] = [];
        if (Array.isArray(v.values)) {
          for (const val of v.values) {
            if (typeof val === "object" && val !== null) {
              values.push({
                code: (val as Record<string, string>).id ?? "",
                label: (val as Record<string, string>).text ?? "",
              });
            }
          }
        }

        dimensions.push({ id, label, type, values });
      }
    }

    if (dimensions.length === 0) return null;

    return {
      id: tableId,
      label: json.text ?? json.title ?? tableId,
      source: "Statistics Denmark",
      dimensions,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch data from the Denmark StatBank API in JSON-stat format.
 * DST uses POST and returns JSON-stat 1.0 which we normalize to 2.0.
 */
async function fetchDataDst(
  baseUrl: string,
  tableId: string,
  selections: PxDimensionSelection[],
  lang = "en",
): Promise<PxJsonStat2Response | null> {
  try {
    const variables = selections.map((sel) => ({
      code: sel.dimensionId,
      values: sel.valueCodes.length > 500 ? ["*"] : sel.valueCodes,
    }));

    const res = await fetch(`${baseUrl}/data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: tableId,
        format: "JSONSTAT",
        lang,
        variables,
      }),
      signal: AbortSignal.timeout(DATA_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const json = await res.json();
    return normalizeJsonStat(json);
  } catch {
    return null;
  }
}

/**
 * Normalize JSON-stat 1.0 (used by DST) → JSON-stat 2.0 format
 * so the existing jsonStat2ToRecords parser can handle it.
 */
function normalizeJsonStat(json: Record<string, unknown>): PxJsonStat2Response | null {
  // Already JSON-stat 2.0
  if (json.class === "dataset" || json.version === "2.0") {
    return json as unknown as PxJsonStat2Response;
  }

  // JSON-stat 1.0: dataset under "dataset" key or a named key
  let dataset: Record<string, unknown> | null = null;
  if (json.dataset && typeof json.dataset === "object") {
    dataset = json.dataset as Record<string, unknown>;
  } else {
    for (const key of Object.keys(json)) {
      const val = json[key];
      if (val && typeof val === "object" && (val as Record<string, unknown>).dimension) {
        dataset = val as Record<string, unknown>;
        break;
      }
    }
  }

  if (!dataset) return null;

  const dimension = dataset.dimension as Record<string, unknown> | undefined;
  const value = dataset.value as (number | null)[] | undefined;
  if (!dimension || !value) return null;

  // JSON-stat 1.0 stores id, size, role inside the dimension object
  // rather than at the dataset top level (unlike JSON-stat 2.0).
  let id = dataset.id as string[] | undefined;
  let size = dataset.size as number[] | undefined;
  if (!id && dimension.id) {
    id = dimension.id as unknown as string[];
  }
  if (!size && dimension.size) {
    size = dimension.size as unknown as number[];
  }

  // If still no id/size, derive from dimension keys (skip meta keys)
  const metaKeys = new Set(["id", "size", "role"]);
  if (!id) {
    id = Object.keys(dimension).filter((k) => !metaKeys.has(k));
  }
  if (!size) {
    size = id.map((dimId) => {
      const dim = dimension[dimId] as { category?: { index?: Record<string, number> } } | undefined;
      const idx = dim?.category?.index;
      return idx ? Object.keys(idx).length : 1;
    });
  }

  if (!id || id.length === 0 || !size) return null;

  // Build clean dimension object (exclude meta keys)
  const cleanDimension: Record<string, unknown> = {};
  for (const dimId of id) {
    if (dimension[dimId]) cleanDimension[dimId] = dimension[dimId];
  }

  return {
    version: "2.0",
    class: "dataset",
    label: (dataset.label as string) ?? "",
    source: (dataset.source as string) ?? "",
    id,
    size,
    dimension: cleanDimension as PxJsonStat2Response["dimension"],
    value,
  };
}

// ─── PxWeb v1 API ───────────────────────────────────────────

/**
 * Swap the language segment in a PxWeb v1 base URL.
 * e.g. ".../api/v1/en/StatFin" → ".../api/v1/fi/StatFin"
 */
function swapV1Lang(baseUrl: string, lang: string): string {
  return baseUrl.replace(/\/api\/v1\/[a-z]{2}(\/|$)/, `/api/v1/${lang}$1`);
}

/**
 * Search tables in a PxWeb v1 API.
 * V1 uses GET {baseUrl}?query={q} — the baseUrl already includes the database path.
 */
async function searchTablesV1(
  baseUrl: string,
  query: string,
  lang = "en",
  _pageSize?: number,
): Promise<PxTableInfo[]> {
  try {
    const url = `${swapV1Lang(baseUrl, lang)}?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];

    const json = await res.json();
    if (!Array.isArray(json)) return [];
    return json.map((t: Record<string, unknown>) => {
      const path = (t.path as string) ?? "";
      const rawId = t.id as string;
      // Combine path + id so downstream can use table.id directly for metadata/data
      const fullId = path ? `${path}/${rawId}` : rawId;
      return {
        id: fullId,
        label: (t.title as string) ?? "",
        description: "",
        variableNames: [],
        firstPeriod: "",
        lastPeriod: "",
        source: "",
        path,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Fetch table metadata from a PxWeb v1 API.
 * V1 uses GET {baseUrl}{path}/{tableId} — returns same variables format as v2.
 */
async function fetchMetadataV1(
  baseUrl: string,
  tableId: string,
  lang = "en",
): Promise<PxTableMetadata | null> {
  try {
    // tableId for v1 may include the path prefix (e.g. "/synt/statfin_synt_pxt_12dj.px")
    const url = `${swapV1Lang(baseUrl, lang)}${tableId.startsWith("/") ? "" : "/"}${tableId}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const json = await res.json();
    const dimensions: PxDimension[] = [];

    if (json.variables && Array.isArray(json.variables)) {
      for (const v of json.variables) {
        const id = v.code ?? v.id ?? "";
        const label = v.text ?? v.label ?? id;
        const values: PxDimensionValue[] = [];

        if (v.values && v.valueTexts) {
          for (let i = 0; i < v.values.length; i++) {
            values.push({
              code: v.values[i],
              label: v.valueTexts[i] ?? v.values[i],
            });
          }
        }

        dimensions.push({
          id,
          label,
          type: classifyDimension(id, label),
          values,
        });
      }
    }

    if (dimensions.length === 0) return null;

    return {
      id: tableId,
      label: json.title ?? json.label ?? tableId,
      source: json.source ?? "",
      dimensions,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch data from a PxWeb v1 API.
 * V1 uses POST to the table URL with a query body; returns JSON-stat2 when requested.
 */
async function fetchDataV1(
  baseUrl: string,
  tableId: string,
  selections: PxDimensionSelection[],
  lang = "en",
): Promise<PxJsonStat2Response | null> {
  try {
    const url = `${swapV1Lang(baseUrl, lang)}${tableId.startsWith("/") ? "" : "/"}${tableId}`;
    const query = selections.map((sel) => ({
      code: sel.dimensionId,
      selection: {
        filter: "item",
        values: sel.valueCodes.length > 500 ? ["*"] : sel.valueCodes,
      },
    }));

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        response: { format: "json-stat2" },
      }),
      signal: AbortSignal.timeout(DATA_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const json = await res.json();
    // V1 with json-stat2 format should return 2.0 directly, but normalize just in case
    if (json.class === "dataset" && json.id && json.size && json.value) {
      return json as PxJsonStat2Response;
    }
    return normalizeJsonStat(json);
  } catch {
    return null;
  }
}

export const pxwebV1Adapter: StatsApiAdapter = {
  searchTables: searchTablesV1,
  fetchMetadata: fetchMetadataV1,
  fetchData: fetchDataV1,
};

// ─── FRED (Federal Reserve Economic Data) API ───────────────

/** FRED API response types (inline, no separate file). */
interface FredSeries {
  id: string;
  title: string;
  observation_start: string;
  observation_end: string;
  frequency_short: string;
  units: string;
  seasonal_adjustment_short: string;
  notes: string;
}

interface FredSearchResponse {
  seriess: FredSeries[];
}

interface FredSeriesResponse {
  seriess: FredSeries[];
}

interface FredObservation {
  date: string;
  value: string;
}

interface FredObservationsResponse {
  observations: FredObservation[];
}

/** Common term → well-known FRED series ID. Checked before API search. */
const FRED_KEYWORDS: Record<string, string> = {
  // English
  gdp: "GDP",
  "gross domestic product": "GDP",
  unemployment: "UNRATE",
  "unemployment rate": "UNRATE",
  inflation: "CPIAUCSL",
  "consumer price index": "CPIAUCSL",
  cpi: "CPIAUCSL",
  "federal funds rate": "FEDFUNDS",
  "fed funds rate": "FEDFUNDS",
  "interest rate": "FEDFUNDS",
  housing: "HOUST",
  "housing starts": "HOUST",
  "consumer confidence": "UMCSENT",
  "consumer sentiment": "UMCSENT",
  "industrial production": "INDPRO",
  "retail sales": "RSAFS",
  "personal income": "PI",
  "personal consumption": "PCE",
  "trade balance": "BOPGSTB",
  "nonfarm payroll": "PAYEMS",
  payroll: "PAYEMS",
  employment: "PAYEMS",
  "10-year treasury": "GS10",
  "treasury yield": "GS10",
  mortgage: "MORTGAGE30US",
  "mortgage rate": "MORTGAGE30US",
  "money supply": "M2SL",
  m2: "M2SL",
  // Swedish
  styrränta: "FEDFUNDS",
  "federal ränta": "FEDFUNDS",
  arbetslöshet: "UNRATE",
  "bnp usa": "GDP",
  "inflationstakt": "CPIAUCSL",
  "konsumentprisindex": "CPIAUCSL",
  "industriproduktion": "INDPRO",
  "detaljhandel": "RSAFS",
  "bostadsbyggande": "HOUST",
};

const FRED_KEYWORD_ENTRIES = Object.entries(FRED_KEYWORDS)
  .sort((a, b) => b[0].length - a[0].length);

function matchFredKeyword(query: string): string | null {
  const lower = query.toLowerCase();
  for (const [kw, id] of FRED_KEYWORD_ENTRIES) {
    if (lower.includes(kw)) return id;
  }
  return null;
}

/**
 * Search FRED time series by text query.
 * Uses keyword shortcut first, falls back to FRED series/search API.
 */
async function searchTablesFred(
  baseUrl: string,
  query: string,
  _lang = "en",
  pageSize = 10,
): Promise<PxTableInfo[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return [];

  // Keyword match → direct series lookup (instant, avoids search API)
  const kwMatch = matchFredKeyword(query);
  if (kwMatch) {
    try {
      const url = `${baseUrl}/series?series_id=${encodeURIComponent(kwMatch)}&api_key=${apiKey}&file_type=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
      if (res.ok) {
        const json = (await res.json()) as FredSeriesResponse;
        const s = json.seriess?.[0];
        if (s) {
          return [{
            id: s.id,
            label: s.title,
            description: (s.notes ?? "").slice(0, 300),
            variableNames: [s.units ?? "", s.frequency_short ?? ""].filter(Boolean),
            firstPeriod: s.observation_start ?? "",
            lastPeriod: s.observation_end ?? "",
            source: "FRED",
          }];
        }
      }
    } catch { /* fall through to text search */ }
  }

  // Text search via FRED series/search API
  try {
    const url = `${baseUrl}/series/search?search_text=${encodeURIComponent(query)}&api_key=${apiKey}&file_type=json&limit=${pageSize}&order_by=popularity&sort_order=desc`;
    const res = await fetch(url, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
    if (!res.ok) return [];

    const json = (await res.json()) as FredSearchResponse;
    return (json.seriess ?? []).map((s) => ({
      id: s.id,
      label: s.title,
      description: (s.notes ?? "").slice(0, 300),
      variableNames: [s.units ?? "", s.frequency_short ?? ""].filter(Boolean),
      firstPeriod: s.observation_start ?? "",
      lastPeriod: s.observation_end ?? "",
      source: "FRED",
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch metadata for a FRED series.
 * Returns synthetic PxTableMetadata with time dimension built from
 * observation_start/observation_end reported by the series endpoint.
 */
async function fetchMetadataFred(
  baseUrl: string,
  tableId: string,
  _lang = "en",
): Promise<PxTableMetadata | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `${baseUrl}/series?series_id=${encodeURIComponent(tableId)}&api_key=${apiKey}&file_type=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
    if (!res.ok) return null;

    const json = (await res.json()) as FredSeriesResponse;
    const s = json.seriess?.[0];
    if (!s) return null;

    // Build time dimension: last 5 years of annual points as representative values
    const endYear = new Date(s.observation_end ?? "").getFullYear() || new Date().getFullYear();
    const timeValues: PxDimensionValue[] = [];
    for (let y = endYear; y >= endYear - 4; y--) {
      timeValues.push({ code: String(y), label: String(y) });
    }

    const timeDim: PxDimension = {
      id: "date",
      label: "Date",
      type: "time",
      values: timeValues,
    };

    const contentsDim: PxDimension = {
      id: "series",
      label: s.units ?? "Value",
      type: "contents",
      values: [{ code: s.id, label: s.title }],
    };

    return {
      id: tableId,
      label: s.title,
      source: "FRED",
      dimensions: [timeDim, contentsDim],
    };
  } catch {
    return null;
  }
}

/**
 * Fetch observations for a FRED series and convert to PxJsonStat2Response.
 * FRED returns a flat time-series; we map date→value.
 * The "geography" dimension is a single synthetic entry (US national or the
 * series geography level) since FRED series IDs embed their geography.
 */
async function fetchDataFred(
  baseUrl: string,
  tableId: string,
  selections: PxDimensionSelection[],
  _lang = "en",
): Promise<PxJsonStat2Response | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;

  try {
    // Build date filter from time dimension selection
    const timeSel = selections.find((s) => s.dimensionId === "date");
    const years = timeSel?.valueCodes ?? [];
    let observationStart = "";
    let observationEnd = "";
    if (years.length > 0) {
      const sorted = [...years].sort();
      observationStart = `${sorted[0]}-01-01`;
      observationEnd = `${sorted[sorted.length - 1]}-12-31`;
    }

    let url = `${baseUrl}/series/observations?series_id=${encodeURIComponent(tableId)}&api_key=${apiKey}&file_type=json`;
    if (observationStart) url += `&observation_start=${observationStart}`;
    if (observationEnd) url += `&observation_end=${observationEnd}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;

    const json = (await res.json()) as FredObservationsResponse;
    const observations = json.observations ?? [];
    if (observations.length === 0) return null;

    // Filter out FRED sentinel value "."
    const valid = observations.filter((o) => o.value !== ".");
    if (valid.length === 0) return null;

    // Build PxJsonStat2Response: dimensions are [date, series]
    const dateIndex: Record<string, number> = {};
    const dateLabels: Record<string, string> = {};
    const values: (number | null)[] = [];

    for (let i = 0; i < valid.length; i++) {
      const obs = valid[i];
      const key = obs.date;
      dateIndex[key] = i;
      dateLabels[key] = key;
      const num = parseFloat(obs.value);
      values.push(isNaN(num) ? null : num);
    }

    return {
      version: "2.0",
      class: "dataset",
      label: tableId,
      source: "FRED",
      id: ["date", "series"],
      size: [valid.length, 1],
      dimension: {
        date: {
          label: "Date",
          category: { index: dateIndex, label: dateLabels },
        },
        series: {
          label: "Value",
          category: {
            index: { [tableId]: 0 },
            label: { [tableId]: tableId },
          },
        },
      },
      value: values,
    };
  } catch {
    return null;
  }
}

// ─── FRED adapter export ─────────────────────────────────────

export const fredAdapter: StatsApiAdapter = {
  searchTables: searchTablesFred,
  fetchMetadata: fetchMetadataFred,
  fetchData: fetchDataFred,
};

// ─── Main orchestrator ──────────────────────────────────────

/**
 * Search and fetch data from a PxWeb v2 source.
 *
 * Pipeline: search tables → rank → fetch metadata → select dimensions →
 * fetch data → parse JSON-stat2 → convert to GeoJSON → profile → cache.
 */
export async function searchPxWeb(
  source: OfficialStatsSource,
  prompt: string,
): Promise<DataSearchResult> {
  const baseUrl = source.baseUrl;

  // Determine language: Swedish for SCB, English for others
  const lang = source.countryCode === "SE" ? "sv" : "en";

  // Build search query from prompt
  const searchQuery = buildPxSearchQuery(prompt);
  if (!searchQuery) {
    return { found: false, error: "No search keywords extracted from prompt" };
  }

  // Check cache first
  const cachePrefix = `pxweb-${source.id}`;
  const cached = await getCachedData(`${cachePrefix}-${searchQuery.replace(/\s+/g, "-")}`);
  if (cached) {
    const cacheKey = `${cachePrefix}-${searchQuery.replace(/\s+/g, "-")}`;
    return {
      found: true,
      source: source.agencyName,
      description: cached.description,
      featureCount: cached.data.features.length,
      geometryType: cached.profile.geometryType,
      attributes: cached.profile.attributes.map((a) => a.name),
      cacheKey,
      profile: cached.profile,
    };
  }

  // 1. Search for tables
  const tables = await searchTables(baseUrl, searchQuery, lang);
  if (tables.length === 0) {
    // Try English as fallback if we searched in Swedish
    if (lang !== "en") {
      const enTables = await searchTables(baseUrl, searchQuery, "en");
      if (enTables.length === 0) {
        return { found: false, error: "No tables found for query" };
      }
      return searchPxWebWithTables(source, prompt, enTables, "en", cachePrefix);
    }
    return { found: false, error: "No tables found for query" };
  }

  return searchPxWebWithTables(source, prompt, tables, lang, cachePrefix);
}

async function searchPxWebWithTables(
  source: OfficialStatsSource,
  prompt: string,
  tables: PxTableInfo[],
  lang: string,
  cachePrefix: string,
): Promise<DataSearchResult> {
  const baseUrl = source.baseUrl;

  // 2. Rank and pick best table
  const ranked = rankTables(tables, prompt);
  const bestTable = ranked[0];

  // 3. Fetch metadata
  const metadata = await fetchMetadata(baseUrl, bestTable.id, lang);
  if (!metadata || metadata.dimensions.length === 0) {
    return { found: false, error: `Failed to fetch metadata for table ${bestTable.id}` };
  }

  // 4. Select dimension values
  const selections = selectDimensions(metadata, prompt);
  if (selections.length === 0) {
    return { found: false, error: "Could not determine dimension selections" };
  }

  // 5. Fetch data
  const data = await fetchData(baseUrl, bestTable.id, selections, lang);
  if (!data || data.value.length === 0) {
    return { found: false, error: `No data returned for table ${bestTable.id}` };
  }

  // 6. Find dimension IDs for parsing
  const geoDim = metadata.dimensions.find((d) => d.type === "geo");
  const contentsDim = metadata.dimensions.find((d) => d.type === "contents");
  const timeDim = metadata.dimensions.find((d) => d.type === "time");

  if (!geoDim || !contentsDim || !timeDim) {
    return { found: false, error: "Table missing required dimension types (geo/contents/time)" };
  }

  // 7. Parse JSON-stat2 → records
  const records = jsonStat2ToRecords(data, geoDim.id, contentsDim.id, timeDim.id);
  if (records.length === 0) {
    return { found: false, error: "No valid records in response" };
  }

  // 8. Convert to GeoJSON
  const metricLabel =
    records[0].metricLabel || contentsDim.values[0]?.label || bestTable.label;
  const fc = recordsToGeoJSON(records, metricLabel);

  // 9. Profile
  const profile = profileDataset(fc);

  // 10. Cache
  const cacheKey = `${cachePrefix}-${bestTable.id}`;
  const description = `${bestTable.label} (${source.agencyName})`;

  await setCache(cacheKey, {
    data: fc,
    profile,
    source: source.agencyName,
    description,
    timestamp: Date.now(),
  });

  return {
    found: true,
    source: source.agencyName,
    description,
    featureCount: fc.features.length,
    geometryType: profile.geometryType,
    attributes: profile.attributes.map((a) => a.name),
    cacheKey,
    profile,
  };
}
