/**
 * World Bank Data API client.
 *
 * Uses the World Bank Indicators REST API (v2) to search indicators,
 * fetch metadata, and retrieve country-level data. Returns data in
 * the StatsApiAdapter shape so it integrates with resolvePxWeb.
 *
 * API docs: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
 */

import type {
  StatsApiAdapter,
  PxTableInfo,
  PxTableMetadata,
  PxDimension,
  PxDimensionSelection,
  PxDimensionValue,
  PxJsonStat2Response,
} from "./pxweb-client";

// ─── Constants ──────────────────────────────────────────────

const SEARCH_TIMEOUT_MS = 6_000;
const DATA_TIMEOUT_MS = 10_000;

/** Common keyword → WB indicator code. Checked before API search. */
const WB_KEYWORDS: Record<string, string> = {
  // GDP
  "gdp per capita": "NY.GDP.PCAP.CD",
  "bnp per capita": "NY.GDP.PCAP.CD",
  gdp: "NY.GDP.MKTP.CD",
  bnp: "NY.GDP.MKTP.CD",
  // Population
  population: "SP.POP.TOTL",
  befolkning: "SP.POP.TOTL",
  "population growth": "SP.POP.GROW",
  // Life expectancy
  "life expectancy": "SP.DYN.LE00.IN",
  livslängd: "SP.DYN.LE00.IN",
  medellivslängd: "SP.DYN.LE00.IN",
  // Unemployment
  unemployment: "SL.UEM.TOTL.ZS",
  arbetslöshet: "SL.UEM.TOTL.ZS",
  // Inflation
  inflation: "FP.CPI.TOTL.ZG",
  // Poverty
  poverty: "SI.POV.DDAY",
  fattigdom: "SI.POV.DDAY",
  // CO2
  "co2 emissions": "EN.ATM.CO2E.PC",
  "co2": "EN.ATM.CO2E.PC",
  koldioxid: "EN.ATM.CO2E.PC",
  // Fertility
  "fertility rate": "SP.DYN.TFRT.IN",
  fertilitet: "SP.DYN.TFRT.IN",
  // Mortality
  "infant mortality": "SP.DYN.IMRT.IN",
  spädbarnsdödlighet: "SP.DYN.IMRT.IN",
  // Education
  "literacy rate": "SE.ADT.LITR.ZS",
  literacy: "SE.ADT.LITR.ZS",
  // Health
  "healthcare spending": "SH.XPD.CHEX.GD.ZS",
  "health expenditure": "SH.XPD.CHEX.GD.ZS",
  // Trade
  exports: "NE.EXP.GNFS.ZS",
  imports: "NE.IMP.GNFS.ZS",
  // Energy
  "renewable energy": "EG.FEC.RNEW.ZS",
  "förnybar energi": "EG.FEC.RNEW.ZS",
  // Internet
  "internet users": "IT.NET.USER.ZS",
  "internet usage": "IT.NET.USER.ZS",
  // Gini
  gini: "SI.POV.GINI",
  ojämlikhet: "SI.POV.GINI",
  inequality: "SI.POV.GINI",
  // Foreign aid
  "foreign aid": "DT.ODA.ODAT.GN.ZS",
  bistånd: "DT.ODA.ODAT.GN.ZS",
  // Military
  "military spending": "MS.MIL.XPND.GD.ZS",
  militärutgifter: "MS.MIL.XPND.GD.ZS",
};

const WB_KEYWORD_ENTRIES = Object.entries(WB_KEYWORDS)
  .sort((a, b) => b[0].length - a[0].length);

// ─── Keyword matching ───────────────────────────────────────

function matchKeyword(query: string): string | null {
  const lower = query.toLowerCase();
  for (const [kw, code] of WB_KEYWORD_ENTRIES) {
    if (lower.includes(kw)) return code;
  }
  return null;
}

// ─── Search ─────────────────────────────────────────────────

async function searchTablesWb(
  baseUrl: string,
  query: string,
  _lang = "en",
  pageSize = 10,
): Promise<PxTableInfo[]> {
  // Try keyword match first (instant, no API call)
  const kwMatch = matchKeyword(query);
  if (kwMatch) {
    try {
      const res = await fetch(
        `${baseUrl}/v2/indicator/${kwMatch}?format=json`,
        { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) },
      );
      if (res.ok) {
        const json = await res.json();
        const indicators = Array.isArray(json) && json.length >= 2 ? json[1] : [];
        if (indicators.length > 0) {
          const ind = indicators[0] as Record<string, unknown>;
          return [{
            id: ind.id as string,
            label: ind.name as string ?? "",
            description: (ind.sourceNote as string ?? "").slice(0, 200),
            variableNames: [],
            firstPeriod: "",
            lastPeriod: "",
            source: "World Bank",
          }];
        }
      }
    } catch { /* fall through to API search */ }
  }

  // API text search — fetch all indicators and filter client-side
  // (WB API doesn't have a search parameter, but we can page through)
  try {
    const res = await fetch(
      `${baseUrl}/v2/indicator?format=json&per_page=1000&source=2`,
      { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) },
    );
    if (!res.ok) return [];

    const json = await res.json();
    const indicators = (Array.isArray(json) && json.length >= 2 ? json[1] : []) as Array<Record<string, unknown>>;

    // Text-match indicator names
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const scored = indicators
      .map((ind) => {
        const name = ((ind.name as string) ?? "").toLowerCase();
        const score = queryWords.reduce((s, w) => s + (name.includes(w) ? 1 : 0), 0);
        return { ind, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, pageSize);

    return scored.map(({ ind }) => ({
      id: ind.id as string,
      label: (ind.name as string) ?? "",
      description: ((ind.sourceNote as string) ?? "").slice(0, 200),
      variableNames: [],
      firstPeriod: "",
      lastPeriod: "",
      source: "World Bank",
    }));
  } catch {
    return [];
  }
}

// ─── Indicator list cache ───────────────────────────────────

let cachedIndicators: Array<Record<string, unknown>> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 3_600_000; // 1 hour

async function getIndicatorList(baseUrl: string): Promise<Array<Record<string, unknown>>> {
  if (cachedIndicators && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedIndicators;
  }
  try {
    const res = await fetch(
      `${baseUrl}/v2/indicator?format=json&per_page=2000&source=2`,
      { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) },
    );
    if (!res.ok) return cachedIndicators ?? [];
    const json = await res.json();
    cachedIndicators = (Array.isArray(json) && json.length >= 2 ? json[1] : []) as Array<Record<string, unknown>>;
    cacheTimestamp = Date.now();
    return cachedIndicators;
  } catch {
    return cachedIndicators ?? [];
  }
}

// ─── Metadata ───────────────────────────────────────────────

async function fetchMetadataWb(
  baseUrl: string,
  tableId: string,
  _lang = "en",
): Promise<PxTableMetadata | null> {
  try {
    // Fetch indicator info
    const res = await fetch(
      `${baseUrl}/v2/indicator/${encodeURIComponent(tableId)}?format=json`,
      { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) },
    );
    if (!res.ok) return null;

    const json = await res.json();
    const indicators = Array.isArray(json) && json.length >= 2 ? json[1] : [];
    if (indicators.length === 0) return null;

    const ind = indicators[0] as Record<string, unknown>;

    // WB data is always country × year × indicator.
    // Build synthetic dimensions matching PxTableMetadata shape.
    const geoDim: PxDimension = {
      id: "country",
      label: "Country",
      type: "geo",
      // We don't enumerate all ~200 countries here — the pipeline will fetch all
      values: [{ code: "*", label: "All countries" }],
    };

    const currentYear = new Date().getFullYear();
    const timeValues: PxDimensionValue[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) {
      timeValues.push({ code: String(y), label: String(y) });
    }

    const timeDim: PxDimension = {
      id: "date",
      label: "Year",
      type: "time",
      values: timeValues,
    };

    const contentsDim: PxDimension = {
      id: "indicator",
      label: "Indicator",
      type: "contents",
      values: [{
        code: tableId,
        label: (ind.name as string) ?? tableId,
      }],
    };

    return {
      id: tableId,
      label: (ind.name as string) ?? tableId,
      source: "World Bank",
      dimensions: [geoDim, timeDim, contentsDim],
    };
  } catch {
    return null;
  }
}

// ─── Data fetch ─────────────────────────────────────────────

/**
 * Fetch country-level data from the World Bank API and convert to
 * PxJsonStat2Response shape for the downstream pipeline.
 */
async function fetchDataWb(
  baseUrl: string,
  tableId: string,
  selections: PxDimensionSelection[],
  _lang = "en",
): Promise<PxJsonStat2Response | null> {
  try {
    // Extract year from time dimension selection, default to latest 5 years
    const timeSel = selections.find(s => s.dimensionId === "date");
    const years = timeSel?.valueCodes ?? [];
    const dateParam = years.length > 0
      ? years.sort().join(":")
      : `${new Date().getFullYear() - 5}:${new Date().getFullYear()}`;

    // Fetch all countries for the indicator
    const res = await fetch(
      `${baseUrl}/v2/country/all/indicator/${encodeURIComponent(tableId)}?format=json&per_page=300&date=${dateParam}`,
      { signal: AbortSignal.timeout(DATA_TIMEOUT_MS) },
    );
    if (!res.ok) return null;

    const json = await res.json();
    const rows = (Array.isArray(json) && json.length >= 2 ? json[1] : []) as Array<Record<string, unknown>>;
    if (rows.length === 0) return null;

    // Filter out aggregate regions and null values, keep latest per country
    const latestByCountry = new Map<string, { code: string; value: number; date: string }>();

    for (const row of rows) {
      const value = row.value as number | null;
      if (value == null) continue;

      const iso3 = row.countryiso3code as string;
      if (!iso3 || iso3.length !== 3) continue;

      // Skip entries with digit-containing country codes (WB aggregate regions)
      const country = row.country as { id: string; value: string } | undefined;
      if (!country || /\d/.test(country.id)) continue;

      const date = (row.date as string) ?? "";
      const existing = latestByCountry.get(iso3);
      if (!existing || date > existing.date) {
        latestByCountry.set(iso3, { code: iso3, value, date });
      }
    }

    if (latestByCountry.size === 0) return null;

    // Build PxJsonStat2Response
    const countries = Array.from(latestByCountry.entries());
    const geoIndex: Record<string, number> = {};
    const geoLabels: Record<string, string> = {};
    const values: (number | null)[] = [];

    // Find the most common date (for the time dimension)
    const dateCounts = new Map<string, number>();
    for (const [, entry] of countries) {
      dateCounts.set(entry.date, (dateCounts.get(entry.date) ?? 0) + 1);
    }
    const mostCommonDate = Array.from(dateCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

    for (let i = 0; i < countries.length; i++) {
      const [iso3, entry] = countries[i];
      geoIndex[iso3] = i;
      geoLabels[iso3] = iso3; // Labels will be resolved from geometry
      values.push(entry.value);
    }

    return {
      version: "2.0",
      class: "dataset",
      label: tableId,
      source: "World Bank",
      id: ["country", "date", "indicator"],
      size: [countries.length, 1, 1],
      dimension: {
        country: {
          label: "Country",
          category: { index: geoIndex, label: geoLabels },
        },
        date: {
          label: "Year",
          category: {
            index: { [mostCommonDate]: 0 },
            label: { [mostCommonDate]: mostCommonDate },
          },
        },
        indicator: {
          label: "Indicator",
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

// ─── Adapter ────────────────────────────────────────────────

export const worldBankAdapter: StatsApiAdapter = {
  searchTables: searchTablesWb,
  fetchMetadata: fetchMetadataWb,
  fetchData: fetchDataWb,
};
