/**
 * PxWeb v2 API client.
 *
 * Searches tables, fetches metadata, queries data, and converts
 * JSON-stat2 responses to GeoJSON FeatureCollections.
 *
 * Supports PxWeb v2 APIs (SCB, SSB). v1 support deferred.
 */

import { profileDataset } from "../profiler";
import {
  setCache,
  getCachedData,
  type CacheEntry,
  type DataSearchResult,
} from "./data-search";
import type { OfficialStatsSource } from "./global-stats-registry";

// ─── Types ──────────────────────────────────────────────────

export interface PxTableInfo {
  id: string;
  label: string;
  description: string;
  variableNames: string[];
  firstPeriod: string;
  lastPeriod: string;
  source: string;
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
  "denmark", "danmark", "danish", "danska",
  "finland", "finnish", "finska",
  "iceland", "isländska",
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
  municipality: ["kommun", "kommune", "municipality"],
  county: ["län", "fylke", "county"],
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
  "municipality", "area", "geo",
];
const TIME_PATTERNS = ["tid", "time", "year", "month", "quarter", "period", "år"];
const CONTENTS_PATTERNS = ["contentscode", "contents", "tabellinnehåll"];

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
 * Translate an English search query to Swedish for SCB PxWeb searches.
 * Replaces known English statistical terms with their Swedish equivalents,
 * then normalizes Swedish colloquial terms to SCB canonical terms.
 */
export function translateSearchQuery(query: string, lang: string): string {
  if (lang !== "sv") return query;
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

  if (CONTENTS_PATTERNS.some((p) => lower.includes(p))) return "contents";
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
  }
  // If caller wants municipality level, prefer 4-digit codes
  if (geoHint === "municipality") {
    const muniLen4 = byLength.get(4);
    if (muniLen4 && muniLen4.length >= 100) return muniLen4;
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
        // All regions, excluding national aggregate "00"
        let codes = dim.values
          .filter((v) => v.code !== "00")
          .map((v) => v.code);
        // When mixed levels exist (e.g. county + municipality), select level matching hint
        codes = filterToMostGranularLevel(codes, geoLevelHint);
        // If filtering removed everything (only "00" existed), include it
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
  prompt: string,
  geoLevelHint?: string | null,
): DimensionSelectionResult {
  const selections: PxDimensionSelection[] = [];
  const promptLower = prompt.toLowerCase();
  const promptKeywords = promptLower.split(/\s+/).filter((w) => w.length > 2);

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
        let codes2 = dim.values
          .filter((v) => v.code !== "00")
          .map((v) => v.code);
        // When mixed levels exist, select level matching the geo hint
        codes2 = filterToMostGranularLevel(codes2, geoLevelHint);
        selections.push({
          dimensionId: dim.id,
          valueCodes: codes2.length > 0 ? codes2 : dim.values.map((v) => v.code),
        });
        break;
      }

      case "contents": {
        if (dim.values.length === 1) {
          selections.push({ dimensionId: dim.id, valueCodes: [dim.values[0].code] });
        } else {
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

          // Flag ambiguity when keyword matching scored 0 with multiple values
          if (bestScore === 0 && dim.values.length >= 2) {
            contentsAmbiguous = true;
            contentsValues = dim.values;
            contentsDimensionId = dim.id;
          }
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
  contentsDimId: string,
  timeDimId: string,
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
  const contIdx = dimIds.indexOf(contentsDimId);
  const timeIdx = dimIds.indexOf(timeDimId);

  if (geoIdx === -1 || contIdx === -1 || timeIdx === -1) {
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
    const contCode = dimMeta[contIdx].codes[indices[contIdx]];
    const timeCode = dimMeta[timeIdx].codes[indices[timeIdx]];

    records.push({
      regionCode: geoCode,
      regionLabel: dimMeta[geoIdx].labels[geoCode] ?? geoCode,
      metricCode: contCode,
      metricLabel: dimMeta[contIdx].labels[contCode] ?? contCode,
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
      // Use wildcard for large selections to keep URL under server limits.
      const codes = sel.valueCodes.length > 50 ? "*" : sel.valueCodes.join(",");
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
