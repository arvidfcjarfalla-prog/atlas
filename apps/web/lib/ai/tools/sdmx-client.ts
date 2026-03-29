/**
 * Generic SDMX REST API client.
 *
 * Implements StatsApiAdapter for SDMX-JSON sources (BIS, ABS, etc.).
 * Uses agency-specific configs to handle URL patterns and dimension naming.
 *
 * SDMX-JSON data format: series-keyed observations where keys are
 * colon-separated dimension indices (e.g. "0:2" = FREQ[0]:REF_AREA[2]).
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

// ─── Types ──────────────────────────────────────────────────

export interface SdmxAgencyConfig {
  id: string;
  /** Base URL for the SDMX REST API. */
  baseUrl: string;
  /** URL for fetching the dataflow list. */
  dataflowUrl: string;
  /** URL template for data queries. {flow} is replaced with the dataflow ID. */
  dataUrlTemplate: string;
  /** Accept header for data JSON responses. */
  acceptHeader: string;
  /** Accept header for structure endpoints (dataflow list). Falls back to acceptHeader. */
  structureAcceptHeader?: string;
  /** Known geo dimension IDs for this agency. */
  geoDimensionIds: string[];
  /** Known time dimension IDs. */
  timeDimensionIds: string[];
  /** Keyword → dataflow ID shortcuts. */
  keywords: Record<string, string>;
}

// ─── Constants ──────────────────────────────────────────────

const SEARCH_TIMEOUT_MS = 8_000;
const DATA_TIMEOUT_MS = 12_000;

const DEFAULT_GEO_IDS = ["REF_AREA", "GEOGRAPHY", "GEO", "LOCATION", "COUNTRY", "REGION", "STATE"];
const DEFAULT_TIME_IDS = ["TIME_PERIOD", "TIME"];

// ─── Dataflow cache ─────────────────────────────────────────

interface CachedDataflows {
  flows: Array<{ id: string; name: string; agencyId: string; version: string }>;
  timestamp: number;
}

const dataflowCache = new Map<string, CachedDataflows>();
const CACHE_TTL_MS = 3_600_000; // 1 hour

async function getDataflows(config: SdmxAgencyConfig): Promise<CachedDataflows["flows"]> {
  if (!config.dataflowUrl) return []; // keyword-only agencies (e.g. ECB)

  const cached = dataflowCache.get(config.id);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.flows;

  try {
    const res = await fetch(config.dataflowUrl, {
      headers: { Accept: config.structureAcceptHeader ?? config.acceptHeader },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) return cached?.flows ?? [];

    const json = await res.json();
    const rawFlows = json?.data?.dataflows ?? [];
    const flows = rawFlows.map((f: Record<string, unknown>) => {
      // Name may be a string or multilingual object {en: "...", ...}
      const rawName = f.name;
      const names = f.names as Record<string, string> | undefined;
      const name = typeof rawName === "string"
        ? rawName
        : (names?.en ?? (rawName as Record<string, string>)?.en ?? "");
      return {
        id: f.id as string,
        name,
        agencyId: (f.agencyID as string) ?? "",
        version: (f.version as string) ?? "1.0",
      };
    });

    dataflowCache.set(config.id, { flows, timestamp: Date.now() });
    return flows;
  } catch {
    return cached?.flows ?? [];
  }
}

// ─── Search ─────────────────────────────────────────────────

function searchTablesForConfig(config: SdmxAgencyConfig) {
  return async (
    _baseUrl: string,
    query: string,
    _lang = "en",
    pageSize = 10,
  ): Promise<PxTableInfo[]> => {
    // 1. Keyword match (instant)
    const lower = query.toLowerCase();
    const kwEntries = Object.entries(config.keywords).sort((a, b) => b[0].length - a[0].length);
    for (const [kw, flowId] of kwEntries) {
      if (lower.includes(kw)) {
        const flows = await getDataflows(config);
        const match = flows.find(f => f.id === flowId);
        return [{
          id: flowId,
          label: match?.name ?? kw,
          description: "",
          variableNames: [],
          firstPeriod: "",
          lastPeriod: "",
          source: config.id,
        }];
      }
    }

    // 2. Text search dataflow names
    const flows = await getDataflows(config);
    const queryWords = lower.split(/\s+/).filter(w => w.length > 2);
    const scored = flows
      .map(f => {
        const name = f.name.toLowerCase();
        const score = queryWords.reduce((s, w) => s + (name.includes(w) ? 1 : 0), 0);
        return { flow: f, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, pageSize);

    return scored.map(({ flow }) => ({
      id: flow.id,
      label: flow.name,
      description: "",
      variableNames: [],
      firstPeriod: "",
      lastPeriod: "",
      source: config.id,
    }));
  };
}

/** Append query params to a URL that may already have params. */
function appendParams(url: string, params: string): string {
  return url + (url.includes("?") ? "&" : "?") + params;
}

// ─── Metadata ───────────────────────────────────────────────

function classifyDimSdmx(
  dimId: string,
  geoIds: string[],
  timeIds: string[],
): "geo" | "time" | "contents" | "regular" {
  const upper = dimId.toUpperCase();
  if (geoIds.some(g => upper === g.toUpperCase())) return "geo";
  if (timeIds.some(t => upper === t.toUpperCase())) return "time";
  if (upper === "MEASURE" || upper === "INDICATOR" || upper === "SUBJECT") return "contents";
  return "regular";
}

function fetchMetadataForConfig(config: SdmxAgencyConfig) {
  return async (
    _baseUrl: string,
    tableId: string,
    _lang = "en",
  ): Promise<PxTableMetadata | null> => {
    try {
      // Fetch a minimal data slice to get the structure
      const dataUrl = config.dataUrlTemplate.replace("{flow}", tableId);
      const url = appendParams(dataUrl, "lastNObservations=1");
      const res = await fetch(url, {
        headers: { Accept: config.acceptHeader },
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      });
      if (!res.ok) return null;

      const json = await res.json();
      const struct = json?.data?.structure ?? json?.data?.structures?.[0] ?? json?.structure ?? json?.structures?.[0];
      if (!struct) return null;

      const geoIds = config.geoDimensionIds.length > 0 ? config.geoDimensionIds : DEFAULT_GEO_IDS;
      const timeIds = config.timeDimensionIds.length > 0 ? config.timeDimensionIds : DEFAULT_TIME_IDS;

      const dimensions: PxDimension[] = [];
      const seriesDims = struct.dimensions?.series ?? [];
      const obsDims = struct.dimensions?.observation ?? [];

      for (const dim of [...seriesDims, ...obsDims]) {
        const id = dim.id as string;
        const label = (dim.name as string) ?? id;
        const type = classifyDimSdmx(id, geoIds, timeIds);
        const values: PxDimensionValue[] = (dim.values ?? []).map((v: Record<string, string>) => ({
          code: v.id ?? "",
          label: v.name ?? v.id ?? "",
        }));
        dimensions.push({ id, label, type, values });
      }

      if (dimensions.length === 0) return null;

      // Find the dataflow name from cache
      const flows = await getDataflows(config);
      const flow = flows.find(f => f.id === tableId);

      return {
        id: tableId,
        label: flow?.name ?? tableId,
        source: config.id,
        dimensions,
      };
    } catch {
      return null;
    }
  };
}

// ─── Data fetch ─────────────────────────────────────────────

function fetchDataForConfig(config: SdmxAgencyConfig) {
  return async (
    _baseUrl: string,
    tableId: string,
    _selections: PxDimensionSelection[], // SDMX uses lastNObservations — dimension filtering not yet implemented
    _lang = "en",
  ): Promise<PxJsonStat2Response | null> => {
    try {
      const dataUrl = config.dataUrlTemplate.replace("{flow}", tableId);
      const url = appendParams(dataUrl, "lastNObservations=1");
      const res = await fetch(url, {
        headers: { Accept: config.acceptHeader },
        signal: AbortSignal.timeout(DATA_TIMEOUT_MS),
      });
      if (!res.ok) return null;

      const json = await res.json();
      return parseSdmxJson(json, config);
    } catch {
      return null;
    }
  };
}

/**
 * Parse SDMX-JSON data message into PxJsonStat2Response.
 *
 * SDMX-JSON has series-keyed data:
 * - series keys are colon-separated indices into series dimensions
 * - observation keys are indices into observation dimensions
 * - values are arrays where [0] is the actual value
 */
function parseSdmxJson(
  json: Record<string, unknown>,
  config: SdmxAgencyConfig,
): PxJsonStat2Response | null {
  // Handle both SDMX-JSON v1 (root-level) and v2 (nested under data)
  const root = json as Record<string, unknown>;
  const data = root.data as Record<string, unknown> | undefined;

  const dataSets = (data?.dataSets ?? root.dataSets) as Array<Record<string, unknown>>;
  const structure = (
    data?.structure ?? (data?.structures as unknown[])?.[0] ??
    root.structure ?? (root.structures as unknown[])?.[0]
  ) as Record<string, unknown>;
  if (!dataSets?.[0] || !structure) return null;

  const series = dataSets[0].series as Record<string, Record<string, unknown>>;
  if (!series) return null;

  const structDims = structure.dimensions as Record<string, Array<Record<string, unknown>>>;
  if (!structDims) return null;

  const seriesDims = (structDims.series ?? []) as Array<{ id: string; values: Array<{ id: string; name?: string }> }>;
  const obsDims = (structDims.observation ?? []) as Array<{ id: string; values: Array<{ id: string; name?: string }> }>;

  // Find geo dimension
  const geoIds = config.geoDimensionIds.length > 0 ? config.geoDimensionIds : DEFAULT_GEO_IDS;
  const geoDimIdx = seriesDims.findIndex(d => geoIds.some(g => d.id.toUpperCase() === g.toUpperCase()));
  if (geoDimIdx === -1) return null;

  const geoDim = seriesDims[geoDimIdx];
  const timeDim = obsDims.find(d => DEFAULT_TIME_IDS.some(t => d.id.toUpperCase() === t.toUpperCase()));

  // Build result: one entry per geo code with latest observation
  const geoIndex: Record<string, number> = {};
  const geoLabels: Record<string, string> = {};
  const values: (number | null)[] = [];
  let timePeriod = "unknown";

  // Track which geo codes we've seen (keep latest/first occurrence)
  const geoValues = new Map<string, number>();

  for (const [seriesKey, seriesData] of Object.entries(series)) {
    const indices = seriesKey.split(":").map(Number);
    const geoIdx = indices[geoDimIdx];
    if (geoIdx == null || geoIdx >= geoDim.values.length) continue;

    const geoCode = geoDim.values[geoIdx].id;

    // Get the latest observation
    const observations = seriesData.observations as Record<string, unknown[]>;
    if (!observations) continue;

    const obsKeys = Object.keys(observations).sort();
    const lastKey = obsKeys[obsKeys.length - 1];
    if (lastKey == null) continue;

    const obsValue = observations[lastKey];
    const rawVal = Array.isArray(obsValue) ? obsValue[0] : null;
    const value = typeof rawVal === "number" ? rawVal : (typeof rawVal === "string" ? Number(rawVal) : null);
    if (value == null || isNaN(value)) continue;

    // Extract time period from the observation dimension
    if (timeDim && timePeriod === "unknown") {
      const timeIdx = Number(lastKey);
      if (timeIdx < timeDim.values.length) {
        timePeriod = timeDim.values[timeIdx].id;
      }
    }

    // Keep first value per geo code — SDMX may have multiple series per geo
    // (e.g. multiple measures). Since we fetch with lastNObservations=1 and
    // the resolution pipeline only needs one value per region, first-wins is fine.
    if (!geoValues.has(geoCode)) {
      geoValues.set(geoCode, value);
    }
  }

  if (geoValues.size === 0) return null;

  let idx = 0;
  for (const [code, value] of geoValues) {
    geoIndex[code] = idx;
    geoLabels[code] = geoDim.values.find(v => v.id === code)?.name ?? code;
    values.push(value);
    idx++;
  }

  return {
    version: "2.0",
    class: "dataset",
    label: "",
    source: config.id,
    id: [geoDim.id, timeDim?.id ?? "TIME_PERIOD", "MEASURE"],
    size: [geoValues.size, 1, 1],
    dimension: {
      [geoDim.id]: {
        label: geoDim.id,
        category: { index: geoIndex, label: geoLabels },
      },
      [timeDim?.id ?? "TIME_PERIOD"]: {
        label: "Time",
        category: {
          index: { [timePeriod]: 0 },
          label: { [timePeriod]: timePeriod },
        },
      },
      MEASURE: {
        label: "Measure",
        category: {
          index: { value: 0 },
          label: { value: "Value" },
        },
      },
    },
    value: values,
  };
}

// ─── Adapter factory ────────────────────────────────────────

export function createSdmxAdapter(config: SdmxAgencyConfig): StatsApiAdapter {
  return {
    searchTables: searchTablesForConfig(config),
    fetchMetadata: fetchMetadataForConfig(config),
    fetchData: fetchDataForConfig(config),
  };
}

// ─── Agency configs ─────────────────────────────────────────

export const BIS_CONFIG: SdmxAgencyConfig = {
  id: "intl-bis",
  baseUrl: "https://stats.bis.org/api/v2",
  dataflowUrl: "https://stats.bis.org/api/v2/structure/dataflow?format=sdmx-json",
  dataUrlTemplate: "https://stats.bis.org/api/v2/data/dataflow/BIS/{flow}/1.0?format=sdmx-json",
  acceptHeader: "application/json",
  geoDimensionIds: ["REF_AREA"],
  timeDimensionIds: ["TIME_PERIOD"],
  keywords: {
    "policy rate": "WS_CBPOL",
    "interest rate": "WS_CBPOL",
    ränta: "WS_CBPOL",
    styrränta: "WS_CBPOL",
    "credit to gdp": "WS_CREDIT_GAP",
    "property price": "WS_SPP",
    "house price": "WS_SPP",
    bostadspris: "WS_SPP",
    "debt service": "WS_DSR",
    "exchange rate": "WS_XRU",
    växelkurs: "WS_XRU",
    "banking statistics": "WS_CBS_PUB",
    "consumer price": "WS_LONG_CPI",
    inflation: "WS_LONG_CPI",
  },
};

export const ABS_CONFIG: SdmxAgencyConfig = {
  id: "au-abs",
  baseUrl: "https://data.api.abs.gov.au/rest",
  dataflowUrl: "https://data.api.abs.gov.au/rest/dataflow?detail=full",
  dataUrlTemplate: "https://data.api.abs.gov.au/rest/data/ABS,{flow}",
  acceptHeader: "application/json",
  structureAcceptHeader: "application/vnd.sdmx.structure+json",
  geoDimensionIds: ["REGION", "STATE", "REF_AREA", "ASGS_2021"],
  timeDimensionIds: ["TIME_PERIOD"],
  keywords: {
    population: "ERP_Q",
    "consumer price": "CPI",
    cpi: "CPI",
    inflation: "CPI",
    "labour force": "LF",
    unemployment: "LF",
    arbetslöshet: "LF",
    "building approvals": "BA",
    "retail trade": "RT",
    "balance of payments": "BOP",
    tourism: "OTM",
    "wage price": "WPI",
  },
};

export const ECB_CONFIG: SdmxAgencyConfig = {
  id: "intl-ecb",
  baseUrl: "https://data-api.ecb.europa.eu/service",
  // ECB structure endpoints are XML-only; skip dynamic dataflow fetching.
  // Search relies entirely on keywords (ECB has ~100 well-known dataflows).
  dataflowUrl: "",
  dataUrlTemplate: "https://data-api.ecb.europa.eu/service/data/ECB,{flow},1.0",
  acceptHeader: "application/json",
  geoDimensionIds: ["REF_AREA", "CURRENCY"],
  timeDimensionIds: ["TIME_PERIOD"],
  keywords: {
    "exchange rate": "EXR",
    växelkurs: "EXR",
    "interest rate": "MIR",
    ränta: "MIR",
    "balance sheet": "BSI",
    "money supply": "BSI",
    "government debt": "GFS",
    "government deficit": "GFS",
    "consumer price": "ICP",
    inflation: "ICP",
    "house price": "RPP",
    bostadspris: "RPP",
    "bank lending": "BSI",
    "securities holdings": "SHS",
    "balance of payments": "BP6",
    credit: "BSI",
    "monetary aggregate": "BSI",
    unemployment: "LFSI",
    arbetslöshet: "LFSI",
    gdp: "MNA",
    bnp: "MNA",
    "current account": "BP6",
    "financial stability": "CBD2",
  },
};

export const OECD_CONFIG: SdmxAgencyConfig = {
  id: "intl-oecd",
  baseUrl: "https://sdmx.oecd.org/public/rest",
  dataflowUrl: "https://sdmx.oecd.org/public/rest/dataflow/all",
  dataUrlTemplate: "https://sdmx.oecd.org/public/rest/data/{flow}",
  acceptHeader: "application/json",
  structureAcceptHeader: "application/vnd.sdmx.structure+json",
  geoDimensionIds: ["REF_AREA"],
  timeDimensionIds: ["TIME_PERIOD"],
  keywords: {
    population: "OECD.CFE.EDS,DSD_REG_DEMO@DF_POP_HIST",
    befolkning: "OECD.CFE.EDS,DSD_REG_DEMO@DF_POP_HIST",
    gdp: "OECD.SDD.NAD,DSD_NAMAIN1@DF_QNA_EXPENDITURE_CAPITA",
    bnp: "OECD.SDD.NAD,DSD_NAMAIN1@DF_QNA_EXPENDITURE_CAPITA",
    "gdp per capita": "OECD.SDD.NAD,DSD_NAMAIN1@DF_QNA_EXPENDITURE_CAPITA",
    unemployment: "OECD.SDD.TPS,DSD_LFS@DF_IALFS_INDIC",
    arbetslöshet: "OECD.SDD.TPS,DSD_LFS@DF_IALFS_INDIC",
    inflation: "OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL",
    "consumer price": "OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL",
    cpi: "OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL",
    "house price": "OECD.SDD.TPS,DSD_PRICES@DF_PRICES_HOUSE",
    bostadspris: "OECD.SDD.TPS,DSD_PRICES@DF_PRICES_HOUSE",
    "interest rate": "OECD.SDD.TPS,DSD_KEI@DF_KEI",
    education: "OECD.EDU.IMEP,DSD_REG_EDU@DF_REG_EDU",
    health: "OECD.ELS.HD,DSD_HEALTH_STAT@DF_HEALTH_STAT",
    "life expectancy": "OECD.ELS.HD,DSD_HEALTH_STAT@DF_HEALTH_STAT",
    trade: "OECD.SDD.TPS,DSD_BOP@DF_BOP",
    "co2 emission": "OECD.ENV.EPI,DSD_AIR_EMISSION@DF_AIR_EMISSION",
    co2: "OECD.ENV.EPI,DSD_AIR_EMISSION@DF_AIR_EMISSION",
    "energy": "OECD.ENV.EPI,DSD_AIR_EMISSION@DF_AIR_EMISSION",
  },
};

export const IMF_CONFIG: SdmxAgencyConfig = {
  id: "intl-imf",
  baseUrl: "https://api.imf.org/external/sdmx/2.1",
  dataflowUrl: "https://api.imf.org/external/sdmx/2.1/dataflow",
  dataUrlTemplate: "https://api.imf.org/external/sdmx/2.1/data/{flow}",
  acceptHeader: "application/json",
  geoDimensionIds: ["REF_AREA"],
  timeDimensionIds: ["TIME_PERIOD"],
  keywords: {
    gdp: "IFS",
    bnp: "IFS",
    inflation: "CPI",
    "consumer price": "CPI",
    "balance of payments": "BOP",
    betalningsbalans: "BOP",
    "government finance": "GFS",
    "government debt": "GFS",
    "government deficit": "GFS",
    "financial soundness": "FSI",
  },
};

export const ISTAT_CONFIG: SdmxAgencyConfig = {
  id: "it-istat",
  baseUrl: "https://sdmx.istat.it/SDMXWS/rest",
  dataflowUrl: "https://sdmx.istat.it/SDMXWS/rest/dataflow",
  dataUrlTemplate: "https://sdmx.istat.it/SDMXWS/rest/data/{flow}",
  acceptHeader: "application/vnd.sdmx.data+json",
  structureAcceptHeader: "application/vnd.sdmx.structure+json",
  geoDimensionIds: ["REF_AREA", "ITTER107"],
  timeDimensionIds: ["TIME_PERIOD"],
  keywords: {
    population: "DCIS_POPRES1",
    befolkning: "DCIS_POPRES1",
    unemployment: "DCCV_DISOCCUPT",
    arbetslöshet: "DCCV_DISOCCUPT",
    gdp: "DCCN_PILPROVV",
    bnp: "DCCN_PILPROVV",
    "regional gdp": "DCCN_PILPROVV",
    "labour force": "DCCV_TAXISOCCUP",
    employment: "DCCV_TAXISOCCUP",
    poverty: "DCIS_POVERTA",
    "consumer price": "DCSP_IPCA",
    inflation: "DCSP_IPCA",
    "life expectancy": "DCIS_MORTALITA1",
    births: "DCIS_NASCITE",
    migration: "DCIS_MIGR_INT",
  },
};

export const EUROSTAT_CONFIG: SdmxAgencyConfig = {
  id: "eu-eurostat",
  baseUrl: "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1",
  dataflowUrl: "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/dataflow/ESTAT/all",
  dataUrlTemplate: "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/{flow}",
  acceptHeader: "application/json",
  structureAcceptHeader: "application/json",
  geoDimensionIds: ["GEO", "geo", "REF_AREA"],
  timeDimensionIds: ["TIME_PERIOD", "TIME"],
  keywords: {
    population: "demo_pjan",
    unemployment: "une_rt_m",
    gdp: "nama_10_gdp",
    inflation: "prc_hicp_manr",
    "house price": "prc_hpi_q",
    migration: "migr_imm1ctz",
    energy: "nrg_bal_c",
    tourism: "tour_occ_nim",
    education: "educ_uoe_enrt01",
    poverty: "ilc_li01",
    crime: "crim_off_cat",
    transport: "tran_hv_frmod",
  },
};

export const STATCAN_CONFIG: SdmxAgencyConfig = {
  // Statistics Canada uses SDMX 2.1 REST at statcan.gc.ca
  id: "ca-statcan",
  baseUrl: "https://www.statcan.gc.ca/en/microdata/api",
  dataflowUrl: "https://www150.statcan.gc.ca/t1/tbl1/sdmx/rest/dataflow",
  dataUrlTemplate: "https://www150.statcan.gc.ca/t1/tbl1/sdmx/rest/data/{flow}",
  acceptHeader: "application/json",
  geoDimensionIds: ["REF_AREA", "GEO"],
  timeDimensionIds: ["TIME_PERIOD"],
  keywords: {
    population: "14100287",
    unemployment: "14100287",
    gdp: "36100434",
    trade: "12100121",
  },
};

export const ILOSTAT_CONFIG: SdmxAgencyConfig = {
  // ILO uses a custom SDMX-like REST API
  id: "intl-ilostat",
  baseUrl: "https://rplumber.ilo.org/data/indicator/",
  dataflowUrl: "https://www.ilo.org/sdmx/rest/dataflow/ILO",
  dataUrlTemplate: "https://www.ilo.org/sdmx/rest/data/ILO,{flow}",
  acceptHeader: "application/json",
  structureAcceptHeader: "application/vnd.sdmx.structure+json",
  geoDimensionIds: ["REF_AREA"],
  timeDimensionIds: ["TIME_PERIOD"],
  keywords: {
    unemployment: "UNE_DEAP_SEX_AGE_RT",
    employment: "EMP_TEMP_SEX_AGE_NB",
    wages: "EAR_XEES_SEX_ECO_CUR_NB",
    "child labor": "SDG_0871_SEX_AGE_RT",
  },
};

export const MALTA_NSO_CONFIG: SdmxAgencyConfig = {
  id: "mt-nso",
  baseUrl: "https://apidesign-statdb.nso.gov.mt/rest/v2/",
  dataflowUrl: "https://apidesign-statdb.nso.gov.mt/rest/v2/dataflow",
  dataUrlTemplate: "https://apidesign-statdb.nso.gov.mt/rest/v2/data/{flow}",
  acceptHeader: "application/vnd.sdmx.data+json",
  structureAcceptHeader: "application/vnd.sdmx.structure+json",
  geoDimensionIds: ["REF_AREA"],
  timeDimensionIds: ["TIME_PERIOD"],
  keywords: {
    population: "DF_POP",
    tourism: "DF_TOUR",
    gdp: "DF_GDP",
  },
};

/** Map of source ID → SDMX config. */
export const SDMX_CONFIGS: Record<string, SdmxAgencyConfig> = {
  "intl-bis": BIS_CONFIG,
  "au-abs": ABS_CONFIG,
  "intl-ecb": ECB_CONFIG,
  "intl-oecd": OECD_CONFIG,
  "intl-imf": IMF_CONFIG,
  "it-istat": ISTAT_CONFIG,
  "eu-eurostat": EUROSTAT_CONFIG,
  "ca-statcan": STATCAN_CONFIG,
  "intl-ilostat": ILOSTAT_CONFIG,
  "mt-nso": MALTA_NSO_CONFIG,
};
