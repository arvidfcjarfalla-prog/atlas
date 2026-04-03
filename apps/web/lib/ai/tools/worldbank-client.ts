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
import { matchWorldBankCoreKeyword } from "./worldbank-keywords";

// ─── JSON safety ───────────────────────────────────────────

/**
 * Parse a World Bank API response as JSON, guarding against the
 * intermittent XML/HTML responses the API returns for some indicators.
 * Throws on non-JSON so callers' catch blocks can handle it.
 */
async function parseWbJson(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("xml") || ct.includes("html")) {
    throw new Error(`World Bank API returned non-JSON content-type: ${ct}`);
  }
  const text = await res.text();
  if (text.trimStart().startsWith("<")) {
    throw new Error("World Bank API returned XML/HTML body");
  }
  return JSON.parse(text);
}

// ─── Constants ──────────────────────────────────────────────

const SEARCH_TIMEOUT_MS = 6_000;
const DATA_TIMEOUT_MS = 10_000;

// ─── Search ─────────────────────────────────────────────────

async function searchTablesWb(
  baseUrl: string,
  query: string,
  _lang = "en",
  pageSize = 10,
): Promise<PxTableInfo[]> {
  // Try keyword match first (instant, no API call)
  const kwMatch = matchWorldBankCoreKeyword(query);
  if (kwMatch) {
    try {
      const res = await fetch(
        `${baseUrl}/v2/indicator/${kwMatch}?format=json`,
        { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) },
      );
      if (res.ok) {
        const json = await parseWbJson(res);
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

    const json = await parseWbJson(res);
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
    const json = await parseWbJson(res);
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

    const json = await parseWbJson(res);
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

    const json = await parseWbJson(res);
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
