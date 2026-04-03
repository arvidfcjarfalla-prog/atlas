/**
 * Public data search tool.
 *
 * Fetches and validates GeoJSON/JSON from known public data APIs.
 * Used by the clarification AI via tool use to find datasets
 * that match the user's prompt.
 *
 * Two-layer cache:
 *   L1: In-memory Map (1 hour TTL, instant, volatile on serverless)
 *   L2: Supabase data_cache table (24 hour TTL, survives cold starts)
 *
 * Supported sources:
 * - World Bank API (population, GDP, HDI, etc.)
 * - Direct GeoJSON URLs
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateText } from "ai";
import { MODELS } from "../ai-client";
import { profileDataset } from "../profiler";
import { getServiceClient } from "../../supabase/service";
import type { DatasetProfile } from "../types";
import type { NormalizedDimension, SourceMetadata } from "./normalized-result";
import type { Json } from "../../supabase/types";
import { matchWorldBankCoreKeyword } from "./worldbank-keywords";

// ─── Types ──────────────────────────────────────────────────

/** Lightweight subset of NormalizedSourceResult for deterministic manifest generation. */
export interface NormalizedMeta {
  sourceMetadata: SourceMetadata;
  dimensions: NormalizedDimension[];
  candidateMetricFields: string[];
}

export interface DataSearchResult {
  found: boolean;
  source?: string;
  description?: string;
  featureCount?: number;
  geometryType?: string;
  attributes?: string[];
  /** Internal cache key — used to build the proxy URL. */
  cacheKey?: string;
  profile?: DatasetProfile;
  error?: string;
  /** Translated prompt (used by web research, Data Commons, Eurostat). */
  englishPrompt?: string;
}

// ─── Cache ──────────────────────────────────────────────────

export interface CacheEntry {
  data: GeoJSON.FeatureCollection;
  profile: DatasetProfile;
  source: string;
  description: string;
  timestamp: number;
  /** Pipeline resolution status at cache-write time (absent in legacy entries). */
  resolutionStatus?: "map_ready" | "tabular_only";
  /** Lightweight metadata from the source adapter — used by deterministic manifest generation. */
  normalizedMeta?: NormalizedMeta;
}

// L1: In-memory cache (fast, volatile — survives within a single lambda invocation)
const memoryCache = new Map<string, CacheEntry>();
const MEMORY_TTL_MS = 60 * 60 * 1000; // 1 hour

// L2: Supabase data_cache table (durable — survives serverless cold starts)
const DB_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function readDbCache(key: string): Promise<CacheEntry | null> {
  const client = getServiceClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("data_cache")
      .select("data, profile, source, description, resolution_status, created_at, normalized_meta")
      .eq("cache_key", key)
      .maybeSingle();
    if (error || !data) return null;
    // TTL: 24h from last write (created_at is reset on every upsert)
    if (Date.now() - new Date(data.created_at).getTime() > DB_TTL_MS) return null;
    return {
      data: data.data as unknown as GeoJSON.FeatureCollection,
      profile: data.profile as unknown as DatasetProfile,
      source: data.source,
      description: data.description,
      timestamp: new Date(data.created_at).getTime(),
      resolutionStatus: data.resolution_status as CacheEntry["resolutionStatus"],
      normalizedMeta: (data.normalized_meta as unknown as NormalizedMeta) ?? undefined,
    };
  } catch {
    return null;
  }
}

async function writeDbCache(key: string, entry: CacheEntry): Promise<void> {
  const client = getServiceClient();
  if (!client) return;
  try {
    await client.from("data_cache").upsert(
      {
        cache_key: key,
        data: entry.data as unknown as Json,
        profile: entry.profile as unknown as Json,
        source: entry.source,
        description: entry.description,
        resolution_status: entry.resolutionStatus ?? null,
        normalized_meta: (entry.normalizedMeta as unknown as Json) ?? null,
        // Reset created_at on every upsert so TTL measures time since last
        // refresh, not first insert.
        created_at: new Date().toISOString(),
      },
      { onConflict: "cache_key" },
    );
  } catch {
    // Non-critical — in-memory cache still works for this invocation
  }
}

/**
 * Get cached data by key. Checks L1 (memory) then L2 (Supabase).
 * On L2 hit, promotes to L1 for faster subsequent access.
 */
export async function getCachedData(key: string): Promise<CacheEntry | null> {
  // L1: memory
  const memEntry = memoryCache.get(key);
  if (memEntry) {
    if (Date.now() - memEntry.timestamp > MEMORY_TTL_MS) {
      memoryCache.delete(key);
    } else {
      return memEntry;
    }
  }

  // L2: Supabase
  const dbEntry = await readDbCache(key);
  if (dbEntry) {
    // Promote to L1 with fresh timestamp — L2 TTL already validated the entry,
    // so L1 gets a full 1-hour window from this moment.
    const promoted = { ...dbEntry, timestamp: Date.now() };
    memoryCache.set(key, promoted);
    return promoted;
  }

  return null;
}

/**
 * Synchronous L1-only cache check (used by the /api/geo/cached/[key] route
 * for fast serving without async overhead when the entry is already in memory).
 */
export function getCachedDataSync(key: string): CacheEntry | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > MEMORY_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return entry;
}

/** Write to both L1 (memory) and L2 (Supabase). */
export async function setCache(key: string, entry: CacheEntry): Promise<void> {
  // Normalize timestamp so L1 TTL always measures from write time,
  // regardless of what the caller passes.
  const stamped = { ...entry, timestamp: Date.now() };
  memoryCache.set(key, stamped);
  await writeDbCache(key, entry);
}

// ─── World Bank API ─────────────────────────────────────────

const COUNTRIES_GEO_FILE = "geo/global/admin0_110m.geojson";
const WB_AI_TIMEOUT_MS = 2_500;

// ─── Scope detection for server-side filtering ────────────────

/** Country group definitions for sub-regional filtering (ISO 3166-1 alpha-3). */
const COUNTRY_GROUPS: Record<string, Set<string>> = {
  EU: new Set(["AUT","BEL","BGR","HRV","CYP","CZE","DNK","EST","FIN","FRA","DEU","GRC","HUN","IRL","ITA","LVA","LTU","LUX","MLT","NLD","POL","PRT","ROU","SVK","SVN","ESP","SWE"]),
  NORDIC: new Set(["SWE","NOR","DNK","FIN","ISL"]),
  SCANDINAVIA: new Set(["SWE","NOR","DNK"]),
  BALTICS: new Set(["EST","LVA","LTU"]),
  OECD: new Set(["AUS","AUT","BEL","CAN","CHL","COL","CRI","CZE","DNK","EST","FIN","FRA","DEU","GRC","HUN","ISL","IRL","ISR","ITA","JPN","KOR","LVA","LTU","LUX","MEX","NLD","NZL","NOR","POL","PRT","SVK","SVN","ESP","SWE","CHE","TUR","GBR","USA"]),
  WESTERN_EUROPE: new Set(["AUT","BEL","FRA","DEU","IRL","LUX","MCO","NLD","CHE","GBR","LIE"]),
  EASTERN_EUROPE: new Set(["BLR","BGR","CZE","HUN","MDA","POL","ROU","RUS","SVK","UKR"]),
  SOUTHEAST_ASIA: new Set(["BRN","KHM","IDN","LAO","MYS","MMR","PHL","SGP","THA","TLS","VNM"]),
  MIDDLE_EAST: new Set(["BHR","IRN","IRQ","ISR","JOR","KWT","LBN","OMN","PSE","QAT","SAU","SYR","ARE","YEM","TUR"]),
  SUB_SAHARAN_AFRICA: new Set(["AGO","BEN","BWA","BFA","BDI","CPV","CMR","CAF","TCD","COM","COG","COD","CIV","DJI","GNQ","ERI","SWZ","ETH","GAB","GMB","GHA","GIN","GNB","KEN","LSO","LBR","MDG","MWI","MLI","MRT","MUS","MOZ","NAM","NER","NGA","RWA","STP","SEN","SYC","SLE","SOM","ZAF","SSD","SDN","TZA","TGO","UGA","ZMB","ZWE"]),
};

/** Same groups but in ISO 3166-1 alpha-2 / NUTS0 codes (used by Eurostat). */
// Note: Eurostat uses "EL" for Greece (not "GR") and covers EEA (incl. NO, IS, CH, LI).
export const COUNTRY_GROUPS_ISO2: Record<string, Set<string>> = {
  EU: new Set(["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","EL","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE"]),
  NORDIC: new Set(["SE","NO","DK","FI","IS"]),
  SCANDINAVIA: new Set(["SE","NO","DK"]),
  BALTICS: new Set(["EE","LV","LT"]),
  OECD: new Set(["AU","AT","BE","CA","CL","CO","CR","CZ","DK","EE","FI","FR","DE","EL","HU","IS","IE","IL","IT","JP","KR","LV","LT","LU","MX","NL","NZ","NO","PL","PT","SK","SI","ES","SE","CH","TR","UK","US"]),
  WESTERN_EUROPE: new Set(["AT","BE","FR","DE","IE","LU","NL","CH","LI","UK"]),
  EASTERN_EUROPE: new Set(["BG","CZ","HU","PL","RO","SK","UA"]),
};

const EU_WORD_RE = /\beu\b/;

/** Scope keyword checks — order matters (specific before broad). */
const SCOPE_CHECKS: { keywords: string[]; regex?: RegExp; key: string }[] = [
  { keywords: ["sub-saharan", "sub saharan"], key: "SUB_SAHARAN_AFRICA" },
  { keywords: ["southeast asia", "south-east asia", "sydostasien", "südostasien"], key: "SOUTHEAST_ASIA" },
  { keywords: ["western europe", "västeuropa"], key: "WESTERN_EUROPE" },
  { keywords: ["eastern europe", "östeuropa"], key: "EASTERN_EUROPE" },
  { keywords: ["middle east", "mellanöstern", "midtøsten"], key: "MIDDLE_EAST" },
  { keywords: ["scandinavia", "skandinavien"], key: "SCANDINAVIA" },
  { keywords: ["nordic", "norden"], key: "NORDIC" },
  { keywords: ["baltic", "baltikum", "baltiske"], key: "BALTICS" },
  { keywords: ["oecd"], key: "OECD" },
  { keywords: ["european union", "europeiska unionen", "eu-"], regex: EU_WORD_RE, key: "EU" },
];

/** Detect a country group scope from a query string. Returns ISO3 set or null. */
export function detectScope(query: string): { key: string; countries: Set<string> } | null {
  const lower = query.toLowerCase();
  for (const { keywords, regex, key } of SCOPE_CHECKS) {
    if (keywords.some((kw) => lower.includes(kw)) || regex?.test(lower)) {
      return { key, countries: COUNTRY_GROUPS[key] };
    }
  }
  // Continent-level: return null (no filtering — too broad to be useful)
  return null;
}

/** ISO 3166-1 alpha-3 → continent mapping for World Bank data filtering. */
const ISO_TO_CONTINENT: Record<string, string> = {
  // Europe
  ALB:"Europe",AND:"Europe",AUT:"Europe",BLR:"Europe",BEL:"Europe",BIH:"Europe",
  BGR:"Europe",HRV:"Europe",CYP:"Europe",CZE:"Europe",DNK:"Europe",EST:"Europe",
  FIN:"Europe",FRA:"Europe",DEU:"Europe",GRC:"Europe",HUN:"Europe",ISL:"Europe",
  IRL:"Europe",ITA:"Europe",XKX:"Europe",LVA:"Europe",LIE:"Europe",LTU:"Europe",
  LUX:"Europe",MLT:"Europe",MDA:"Europe",MCO:"Europe",MNE:"Europe",NLD:"Europe",
  MKD:"Europe",NOR:"Europe",POL:"Europe",PRT:"Europe",ROU:"Europe",RUS:"Europe",
  SMR:"Europe",SRB:"Europe",SVK:"Europe",SVN:"Europe",ESP:"Europe",SWE:"Europe",
  CHE:"Europe",UKR:"Europe",GBR:"Europe",VAT:"Europe",
  // Africa
  DZA:"Africa",AGO:"Africa",BEN:"Africa",BWA:"Africa",BFA:"Africa",BDI:"Africa",
  CPV:"Africa",CMR:"Africa",CAF:"Africa",TCD:"Africa",COM:"Africa",COG:"Africa",
  COD:"Africa",CIV:"Africa",DJI:"Africa",EGY:"Africa",GNQ:"Africa",ERI:"Africa",
  SWZ:"Africa",ETH:"Africa",GAB:"Africa",GMB:"Africa",GHA:"Africa",GIN:"Africa",
  GNB:"Africa",KEN:"Africa",LSO:"Africa",LBR:"Africa",LBY:"Africa",MDG:"Africa",
  MWI:"Africa",MLI:"Africa",MRT:"Africa",MUS:"Africa",MAR:"Africa",MOZ:"Africa",
  NAM:"Africa",NER:"Africa",NGA:"Africa",RWA:"Africa",STP:"Africa",SEN:"Africa",
  SYC:"Africa",SLE:"Africa",SOM:"Africa",ZAF:"Africa",SSD:"Africa",SDN:"Africa",
  TZA:"Africa",TGO:"Africa",TUN:"Africa",UGA:"Africa",ZMB:"Africa",ZWE:"Africa",
  // Asia
  AFG:"Asia",ARM:"Asia",AZE:"Asia",BHR:"Asia",BGD:"Asia",BTN:"Asia",BRN:"Asia",
  KHM:"Asia",CHN:"Asia",GEO:"Asia",IND:"Asia",IDN:"Asia",IRN:"Asia",IRQ:"Asia",
  ISR:"Asia",JPN:"Asia",JOR:"Asia",KAZ:"Asia",KWT:"Asia",KGZ:"Asia",LAO:"Asia",
  LBN:"Asia",MYS:"Asia",MDV:"Asia",MNG:"Asia",MMR:"Asia",NPL:"Asia",PRK:"Asia",
  OMN:"Asia",PAK:"Asia",PSE:"Asia",PHL:"Asia",QAT:"Asia",SAU:"Asia",SGP:"Asia",
  KOR:"Asia",LKA:"Asia",SYR:"Asia",TWN:"Asia",TJK:"Asia",THA:"Asia",TLS:"Asia",
  TUR:"Asia",TKM:"Asia",ARE:"Asia",UZB:"Asia",VNM:"Asia",YEM:"Asia",
  // North America
  ATG:"North America",BHS:"North America",BRB:"North America",BLZ:"North America",
  CAN:"North America",CRI:"North America",CUB:"North America",DMA:"North America",
  DOM:"North America",SLV:"North America",GRD:"North America",GTM:"North America",
  HTI:"North America",HND:"North America",JAM:"North America",MEX:"North America",
  NIC:"North America",PAN:"North America",KNA:"North America",LCA:"North America",
  VCT:"North America",TTO:"North America",USA:"North America",
  // South America
  ARG:"South America",BOL:"South America",BRA:"South America",CHL:"South America",
  COL:"South America",ECU:"South America",GUY:"South America",PRY:"South America",
  PER:"South America",SUR:"South America",URY:"South America",VEN:"South America",
  // Oceania
  AUS:"Oceania",FJI:"Oceania",KIR:"Oceania",MHL:"Oceania",FSM:"Oceania",
  NRU:"Oceania",NZL:"Oceania",PLW:"Oceania",PNG:"Oceania",WSM:"Oceania",
  SLB:"Oceania",TON:"Oceania",TUV:"Oceania",VUT:"Oceania",
};

let countriesGeoCache: GeoJSON.FeatureCollection | null = null;

async function loadCountryGeometry(): Promise<GeoJSON.FeatureCollection | null> {
  if (countriesGeoCache) return countriesGeoCache;
  try {
    const filePath = join(process.cwd(), "public", COUNTRIES_GEO_FILE);
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    if (data?.type === "FeatureCollection" && Array.isArray(data.features)) {
      countriesGeoCache = data as GeoJSON.FeatureCollection;
      return countriesGeoCache;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Known World Bank indicator codes.
 */
const WORLD_BANK_INDICATORS: Record<string, { code: string; label: string; unit: string }> = {
  // ── Population & demographics ─────────────────────────────
  population: { code: "SP.POP.TOTL", label: "Total Population", unit: "people" },
  befolkning: { code: "SP.POP.TOTL", label: "Total Population", unit: "people" },
  "population growth": { code: "SP.POP.GROW", label: "Population Growth Rate", unit: "% annual" },
  befolkningstillväxt: { code: "SP.POP.GROW", label: "Population Growth Rate", unit: "% annual" },
  "population density": { code: "EN.POP.DNST", label: "Population Density", unit: "people per sq. km" },
  befolkningstäthet: { code: "EN.POP.DNST", label: "Population Density", unit: "people per sq. km" },
  "urban population": { code: "SP.URB.TOTL.IN.ZS", label: "Urban Population", unit: "% of total" },
  "birth rate": { code: "SP.DYN.CBRT.IN", label: "Birth Rate", unit: "per 1,000 people" },
  födelsetal: { code: "SP.DYN.CBRT.IN", label: "Birth Rate", unit: "per 1,000 people" },
  "death rate": { code: "SP.DYN.CDRT.IN", label: "Crude Death Rate", unit: "per 1,000 people" },
  dödstal: { code: "SP.DYN.CDRT.IN", label: "Crude Death Rate", unit: "per 1,000 people" },
  fertility: { code: "SP.DYN.TFRT.IN", label: "Fertility Rate", unit: "births per woman" },
  fertilitet: { code: "SP.DYN.TFRT.IN", label: "Fertility Rate", unit: "births per woman" },
  refugee: { code: "SM.POP.REFG", label: "Refugee Population", unit: "people" },
  flyktingar: { code: "SM.POP.REFG", label: "Refugee Population", unit: "people" },
  migration: { code: "SM.POP.NETM", label: "Net Migration", unit: "people" },

  // ── Economy ───────────────────────────────────────────────
  gdp: { code: "NY.GDP.MKTP.CD", label: "GDP (current US$)", unit: "USD" },
  bnp: { code: "NY.GDP.MKTP.CD", label: "GDP (current US$)", unit: "USD" },
  "gdp per capita": { code: "NY.GDP.PCAP.CD", label: "GDP per capita (current US$)", unit: "USD" },
  "bnp per capita": { code: "NY.GDP.PCAP.CD", label: "GDP per capita (current US$)", unit: "USD" },
  unemployment: { code: "SL.UEM.TOTL.ZS", label: "Unemployment Rate", unit: "%" },
  arbetslöshet: { code: "SL.UEM.TOTL.ZS", label: "Unemployment Rate", unit: "%" },
  inflation: { code: "FP.CPI.TOTL.ZG", label: "Inflation (Consumer Prices)", unit: "% annual" },
  poverty: { code: "SI.POV.DDAY", label: "Poverty Headcount ($2.15/day)", unit: "% of population" },
  fattigdom: { code: "SI.POV.DDAY", label: "Poverty Headcount ($2.15/day)", unit: "% of population" },
  gini: { code: "SI.POV.GINI", label: "Gini Index", unit: "index" },
  inequality: { code: "SI.POV.GINI", label: "Gini Index", unit: "index" },
  ojämlikhet: { code: "SI.POV.GINI", label: "Gini Index", unit: "index" },
  trade: { code: "NE.TRD.GNFS.ZS", label: "Trade (% of GDP)", unit: "% of GDP" },
  handel: { code: "NE.TRD.GNFS.ZS", label: "Trade (% of GDP)", unit: "% of GDP" },

  // ── Health ────────────────────────────────────────────────
  "life expectancy": { code: "SP.DYN.LE00.IN", label: "Life Expectancy at Birth", unit: "years" },
  livslängd: { code: "SP.DYN.LE00.IN", label: "Life Expectancy at Birth", unit: "years" },
  medellivslängd: { code: "SP.DYN.LE00.IN", label: "Life Expectancy at Birth", unit: "years" },
  "infant mortality": { code: "SP.DYN.IMRT.IN", label: "Infant Mortality Rate", unit: "per 1,000 live births" },
  spädbarnsdödlighet: { code: "SP.DYN.IMRT.IN", label: "Infant Mortality Rate", unit: "per 1,000 live births" },
  "child mortality": { code: "SH.DYN.MORT", label: "Under-5 Mortality Rate", unit: "per 1,000 live births" },
  barnmortalitet: { code: "SH.DYN.MORT", label: "Under-5 Mortality Rate", unit: "per 1,000 live births" },
  "maternal mortality": { code: "SH.STA.MMRT", label: "Maternal Mortality Ratio", unit: "per 100,000 live births" },
  mödradödlighet: { code: "SH.STA.MMRT", label: "Maternal Mortality Ratio", unit: "per 100,000 live births" },
  "healthcare spending": { code: "SH.XPD.CHEX.GD.ZS", label: "Healthcare Expenditure (% of GDP)", unit: "% of GDP" },
  sjukvårdskostnad: { code: "SH.XPD.CHEX.GD.ZS", label: "Healthcare Expenditure (% of GDP)", unit: "% of GDP" },

  // ── Education ─────────────────────────────────────────────
  literacy: { code: "SE.ADT.LITR.ZS", label: "Literacy Rate", unit: "%" },
  "education spending": { code: "SE.XPD.TOTL.GD.ZS", label: "Education Expenditure (% of GDP)", unit: "% of GDP" },
  utbildningskostnad: { code: "SE.XPD.TOTL.GD.ZS", label: "Education Expenditure (% of GDP)", unit: "% of GDP" },
  "school enrollment": { code: "SE.PRM.ENRR", label: "Primary School Enrollment", unit: "% gross" },

  // ── Military ──────────────────────────────────────────────
  "military spending": { code: "MS.MIL.XPND.GD.ZS", label: "Military Expenditure (% of GDP)", unit: "% of GDP" },
  militärutgifter: { code: "MS.MIL.XPND.GD.ZS", label: "Military Expenditure (% of GDP)", unit: "% of GDP" },
  "military expenditure": { code: "MS.MIL.XPND.GD.ZS", label: "Military Expenditure (% of GDP)", unit: "% of GDP" },

  // ── Environment ───────────────────────────────────────────
  co2: { code: "EN.GHG.CO2.MT.CE.AR5", label: "CO2 Emissions (Mt CO2e, excl. LULUCF)", unit: "Mt CO2e" },
  "co2 emissions": { code: "EN.GHG.CO2.MT.CE.AR5", label: "CO2 Emissions (Mt CO2e, excl. LULUCF)", unit: "Mt CO2e" },
  "co2 per capita": { code: "EN.GHG.CO2.PC.CE.AR5", label: "CO2 Emissions Per Capita", unit: "metric tons CO2e" },
  "renewable energy": { code: "EG.FEC.RNEW.ZS", label: "Renewable Energy Consumption", unit: "% of total" },
  "förnybar energi": { code: "EG.FEC.RNEW.ZS", label: "Renewable Energy Consumption", unit: "% of total" },
  "forest area": { code: "AG.LND.FRST.ZS", label: "Forest Area", unit: "% of land area" },
  skogsareal: { code: "AG.LND.FRST.ZS", label: "Forest Area", unit: "% of land area" },
  skogsyta: { code: "AG.LND.FRST.ZS", label: "Forest Area", unit: "% of land area" },
  "access to electricity": { code: "EG.ELC.ACCS.ZS", label: "Access to Electricity", unit: "% of population" },
  "clean water": { code: "SH.H2O.SMDW.ZS", label: "Access to Clean Water", unit: "% of population" },
  "drinking water": { code: "SH.H2O.SMDW.ZS", label: "Access to Clean Water", unit: "% of population" },
  sanitation: { code: "SH.STA.SMSS.ZS", label: "Access to Sanitation", unit: "% of population" },
  "air pollution": { code: "EN.ATM.PM25.MC.M3", label: "PM2.5 Air Pollution", unit: "µg/m³" },
  luftföroreningar: { code: "EN.ATM.PM25.MC.M3", label: "PM2.5 Air Pollution", unit: "µg/m³" },

  // ── Technology ────────────────────────────────────────────
  "internet users": { code: "IT.NET.USER.ZS", label: "Internet Users", unit: "% of population" },
  internet: { code: "IT.NET.USER.ZS", label: "Internet Users", unit: "% of population" },
  "mobile phone": { code: "IT.CEL.SETS.P2", label: "Mobile Phone Subscriptions", unit: "per 100 people" },
  mobiltelefon: { code: "IT.CEL.SETS.P2", label: "Mobile Phone Subscriptions", unit: "per 100 people" },

  // ── Composite indexes ─────────────────────────────────────
  hdi: { code: "HD.HCI.OVRL", label: "Human Capital Index", unit: "index" },

  // ── Water & sanitation ──────────────────────────────────────
  "water stress": { code: "ER.H2O.FWST.ZS", label: "Water Stress", unit: "% of renewable resources" },
  vattenstress: { code: "ER.H2O.FWST.ZS", label: "Water Stress", unit: "% of renewable resources" },
  "water withdrawal": { code: "ER.H2O.FWTL.ZS", label: "Annual Freshwater Withdrawals", unit: "% of internal resources" },

  // ── Energy ──────────────────────────────────────────────────
  "energy use": { code: "EG.USE.PCAP.KG.OE", label: "Energy Use Per Capita", unit: "kg of oil equivalent" },
  energianvändning: { code: "EG.USE.PCAP.KG.OE", label: "Energy Use Per Capita", unit: "kg of oil equivalent" },
  "electric power": { code: "EG.USE.ELEC.KH.PC", label: "Electric Power Consumption Per Capita", unit: "kWh" },
  "electricity consumption": { code: "EG.USE.ELEC.KH.PC", label: "Electric Power Consumption Per Capita", unit: "kWh" },
  elanvändning: { code: "EG.USE.ELEC.KH.PC", label: "Electric Power Consumption Per Capita", unit: "kWh" },
  "fossil fuel": { code: "EG.USE.COMM.FO.ZS", label: "Fossil Fuel Energy Consumption", unit: "% of total" },
  "nuclear energy": { code: "EG.ELC.NUCL.ZS", label: "Nuclear Energy (% of electricity)", unit: "%" },
  kärnkraft: { code: "EG.ELC.NUCL.ZS", label: "Nuclear Energy (% of electricity)", unit: "%" },

  // ── Agriculture ─────────────────────────────────────────────
  "arable land": { code: "AG.LND.ARBL.ZS", label: "Arable Land", unit: "% of land area" },
  åkermark: { code: "AG.LND.ARBL.ZS", label: "Arable Land", unit: "% of land area" },
  "agricultural land": { code: "AG.LND.AGRI.ZS", label: "Agricultural Land", unit: "% of land area" },
  jordbruksmark: { code: "AG.LND.AGRI.ZS", label: "Agricultural Land", unit: "% of land area" },
  "cereal yield": { code: "AG.YLD.CREL.KG", label: "Cereal Yield", unit: "kg per hectare" },
  "food production": { code: "AG.PRD.FOOD.XD", label: "Food Production Index", unit: "index (2014-2016=100)" },
  livsmedelsproduktion: { code: "AG.PRD.FOOD.XD", label: "Food Production Index", unit: "index (2014-2016=100)" },

  // ── Health (extended) ───────────────────────────────────────
  vaccination: { code: "SH.IMM.MEAS", label: "Measles Immunization", unit: "% of children (12-23 months)" },
  immunization: { code: "SH.IMM.MEAS", label: "Measles Immunization", unit: "% of children (12-23 months)" },
  vaccinering: { code: "SH.IMM.MEAS", label: "Measles Immunization", unit: "% of children (12-23 months)" },
  "hospital beds": { code: "SH.MED.BEDS.ZS", label: "Hospital Beds", unit: "per 1,000 people" },
  sjukhussängar: { code: "SH.MED.BEDS.ZS", label: "Hospital Beds", unit: "per 1,000 people" },
  physicians: { code: "SH.MED.PHYS.ZS", label: "Physicians", unit: "per 1,000 people" },
  läkartäthet: { code: "SH.MED.PHYS.ZS", label: "Physicians", unit: "per 1,000 people" },
  nurses: { code: "SH.MED.NUMW.P3", label: "Nurses and Midwives", unit: "per 1,000 people" },
  tuberculosis: { code: "SH.TBS.INCD", label: "Tuberculosis Incidence", unit: "per 100,000 people" },
  tuberkulos: { code: "SH.TBS.INCD", label: "Tuberculosis Incidence", unit: "per 100,000 people" },
  hiv: { code: "SH.DYN.AIDS.ZS", label: "HIV Prevalence", unit: "% of population (15-49)" },
  malaria: { code: "SH.STA.MALR", label: "Malaria Incidence", unit: "per 1,000 at-risk population" },
  obesity: { code: "SH.STA.OWAD.ZS", label: "Obesity Prevalence", unit: "% of adults" },
  fetma: { code: "SH.STA.OWAD.ZS", label: "Obesity Prevalence", unit: "% of adults" },
  smoking: { code: "SH.PRV.SMOK", label: "Smoking Prevalence", unit: "% of adults" },
  rökning: { code: "SH.PRV.SMOK", label: "Smoking Prevalence", unit: "% of adults" },
  suicide: { code: "SH.STA.SUIC.P5", label: "Suicide Mortality Rate", unit: "per 100,000 population" },
  självmord: { code: "SH.STA.SUIC.P5", label: "Suicide Mortality Rate", unit: "per 100,000 population" },

  // ── Education (extended) ────────────────────────────────────
  "secondary enrollment": { code: "SE.SEC.ENRR", label: "Secondary School Enrollment", unit: "% gross" },
  "tertiary enrollment": { code: "SE.TER.ENRR", label: "Tertiary Education Enrollment", unit: "% gross" },
  "research spending": { code: "GB.XPD.RSDV.GD.ZS", label: "R&D Expenditure", unit: "% of GDP" },
  "r&d spending": { code: "GB.XPD.RSDV.GD.ZS", label: "R&D Expenditure", unit: "% of GDP" },
  "r&d": { code: "GB.XPD.RSDV.GD.ZS", label: "R&D Expenditure", unit: "% of GDP" },
  "r&d expenditure": { code: "GB.XPD.RSDV.GD.ZS", label: "R&D Expenditure", unit: "% of GDP" },
  "research and development": { code: "GB.XPD.RSDV.GD.ZS", label: "R&D Expenditure", unit: "% of GDP" },
  forskning: { code: "GB.XPD.RSDV.GD.ZS", label: "R&D Expenditure", unit: "% of GDP" },
  forskningsutgifter: { code: "GB.XPD.RSDV.GD.ZS", label: "R&D Expenditure", unit: "% of GDP" },

  // ── Economy (extended) ──────────────────────────────────────
  "gdp growth": { code: "NY.GDP.MKTP.KD.ZG", label: "GDP Growth Rate", unit: "% annual" },
  "bnp-tillväxt": { code: "NY.GDP.MKTP.KD.ZG", label: "GDP Growth Rate", unit: "% annual" },
  "foreign investment": { code: "BX.KLT.DINV.WD.GD.ZS", label: "Foreign Direct Investment", unit: "% of GDP" },
  "government debt": { code: "GC.DOD.TOTL.GD.ZS", label: "Government Debt", unit: "% of GDP" },
  statsskuld: { code: "GC.DOD.TOTL.GD.ZS", label: "Government Debt", unit: "% of GDP" },
  "tax revenue": { code: "GC.TAX.TOTL.GD.ZS", label: "Tax Revenue", unit: "% of GDP" },
  skatteinkomster: { code: "GC.TAX.TOTL.GD.ZS", label: "Tax Revenue", unit: "% of GDP" },
  remittances: { code: "BX.TRF.PWKR.DT.GD.ZS", label: "Personal Remittances Received", unit: "% of GDP" },
  exports: { code: "NE.EXP.GNFS.ZS", label: "Exports of Goods and Services", unit: "% of GDP" },
  export: { code: "NE.EXP.GNFS.ZS", label: "Exports of Goods and Services", unit: "% of GDP" },
  imports: { code: "NE.IMP.GNFS.ZS", label: "Imports of Goods and Services", unit: "% of GDP" },
  "current account": { code: "BN.CAB.XOKA.GD.ZS", label: "Current Account Balance", unit: "% of GDP" },
  tourism: { code: "ST.INT.ARVL", label: "International Tourism Arrivals", unit: "number of arrivals" },
  turism: { code: "ST.INT.ARVL", label: "International Tourism Arrivals", unit: "number of arrivals" },

  // ── Gender & social ─────────────────────────────────────────
  "female labor": { code: "SL.TLF.CACT.FE.ZS", label: "Female Labor Force Participation", unit: "% of female population 15+" },
  "child labor": { code: "SL.TLF.0714.ZS", label: "Child Labor", unit: "% of children 7-14" },
  barnarbete: { code: "SL.TLF.0714.ZS", label: "Child Labor", unit: "% of children 7-14" },
  "women in parliament": { code: "SG.GEN.PARL.ZS", label: "Women in Parliament", unit: "% of seats" },

  // ── Infrastructure ──────────────────────────────────────────
  "road density": { code: "IS.ROD.DNST.K2", label: "Road Density", unit: "km per 100 sq. km" },
  "rail lines": { code: "IS.RRS.TOTL.KM", label: "Rail Lines", unit: "total km" },
  järnväg: { code: "IS.RRS.TOTL.KM", label: "Rail Lines", unit: "total km" },
  "air transport": { code: "IS.AIR.PSGR", label: "Air Transport Passengers", unit: "passengers" },
  flygtrafik: { code: "IS.AIR.PSGR", label: "Air Transport Passengers", unit: "passengers" },

  // ── Environment (extended) ──────────────────────────────────
  "greenhouse gas": { code: "EN.ATM.GHGT.KT.CE", label: "Total Greenhouse Gas Emissions", unit: "kt CO2 equivalent" },
  växthusgaser: { code: "EN.ATM.GHGT.KT.CE", label: "Total Greenhouse Gas Emissions", unit: "kt CO2 equivalent" },
  "protected areas": { code: "ER.LND.PTLD.ZS", label: "Terrestrial Protected Areas", unit: "% of land area" },
  naturskyddat: { code: "ER.LND.PTLD.ZS", label: "Terrestrial Protected Areas", unit: "% of land area" },
  "marine protected": { code: "ER.MRN.PTMR.ZS", label: "Marine Protected Areas", unit: "% of territorial waters" },
  deforestation: { code: "AG.LND.FRST.ZS", label: "Forest Area", unit: "% of land area" },
  avskogning: { code: "AG.LND.FRST.ZS", label: "Forest Area", unit: "% of land area" },
};

/**
 * Words indicating the user wants sub-national data.
 * World Bank only has country-level data, so skip if these appear.
 */
const SUBNATIONAL_KEYWORDS = [
  // English
  "state", "states", "province", "provinces", "county", "counties",
  "district", "districts", "municipality", "municipalities",
  "region", "regions", "prefecture", "prefectures",
  // German
  "bundesland", "bundesländer", "kreis", "kreise", "landkreis", "landkreise",
  // French
  "département", "départements", "région", "régions",
  // Spanish
  "comunidad", "comunidades", "provincia", "provincias",
  // Italian
  "regione", "regioni",
  // Swedish
  "län", "kommun", "kommuner",
  // Norwegian
  "fylke", "fylker",
  // Danish/Finnish
  "maakunta",
  // Portuguese
  "estado", "estados", "município", "municípios",
  // Japanese
  "prefecture",
  // Generic sub-national indicators
  "subnational", "sub-national", "federal",
];

// ─── World Bank AI intent extraction ─────────────────────────

const WB_INDICATOR_KEYS = Object.keys(WORLD_BANK_INDICATORS);
const WB_INDICATOR_DESCRIPTIONS = [...new Set(
  Object.entries(WORLD_BANK_INDICATORS).map(
    ([k, v]) => `${k}: ${v.label} (${v.code})`,
  ),
)].join("\n");

interface WBIntentResult {
  isCountryLevel: boolean;
  indicatorKey: string | null;
  indicatorCode: string | null;
  indicatorLabel: string | null;
  englishPrompt: string;
}

/**
 * Parse World Bank API responses defensively.
 * The API intermittently returns XML/HTML for some indicators.
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

const WB_INTENT_SYSTEM = `You extract structured intent from map prompts about country-level world statistics. Any language.

Reply with a single JSON object:
{
  "isCountryLevel": true/false,
  "indicatorKey": "key" or null,
  "indicatorCode": "XX.XXX.XXX" or null,
  "indicatorLabel": "human-readable label" or null,
  "englishPrompt": "translated prompt"
}

Rules:
- isCountryLevel: true if the user wants data compared ACROSS countries (not subnational like states/provinces).
- indicatorKey: pick the best match from the curated list below. null if none match.
- indicatorCode: if indicatorKey is null, provide a World Bank API indicator code from your knowledge (e.g. "SH.TBS.INCD", "EN.GHG.CO2.PC.CE.AR5"). null if you cannot determine one.
- indicatorLabel: human-readable label for indicatorCode (e.g. "Tuberculosis incidence per 100k"). null if indicatorCode is null.
- englishPrompt: translate the prompt to concise English (max 15 words).

Curated indicators (prefer these when they match):
${WB_INDICATOR_DESCRIPTIONS}

Output ONLY the JSON object, nothing else.`;

async function extractWorldBankIntent(query: string): Promise<WBIntentResult | null> {
  try {
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), WB_AI_TIMEOUT_MS),
    );
    const aiPromise = generateText({
      model: MODELS.utility(),
      maxOutputTokens: 128,
      system: WB_INTENT_SYSTEM,
      messages: [{ role: "user", content: query }],
    }).then((r) => r.text.trim());

    const text = await Promise.race([aiPromise, timeout]);
    if (!text) return null;

    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return null;

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    return {
      isCountryLevel: !!parsed.isCountryLevel,
      indicatorKey:
        typeof parsed.indicatorKey === "string" &&
        WB_INDICATOR_KEYS.includes(parsed.indicatorKey)
          ? parsed.indicatorKey
          : null,
      indicatorCode:
        typeof parsed.indicatorCode === "string" && /^[A-Z]{2}[\w.]+$/.test(parsed.indicatorCode)
          ? parsed.indicatorCode
          : null,
      indicatorLabel:
        typeof parsed.indicatorLabel === "string"
          ? parsed.indicatorLabel
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

/**
 * Search World Bank API for a matching indicator.
 * Returns country-level data joined with local Natural Earth geometries.
 *
 * Uses keyword matching first (fast, no AI call), then AI intent extraction
 * as fallback for non-English prompts.
 *
 * Skips if the prompt explicitly asks for sub-national data (e.g. "US states")
 * since World Bank only provides country-level statistics.
 */
export async function searchWorldBank(query: string): Promise<DataSearchResult> {
  const lower = query.toLowerCase();
  const words = lower.split(/\s+/);

  // Skip if user wants sub-national data — World Bank is country-level only
  const wantsSubnational = SUBNATIONAL_KEYWORDS.some((kw) => words.includes(kw));
  if (wantsSubnational) {
    return { found: false, error: "World Bank only has country-level data; prompt asks for sub-national" };
  }

  // Find matching indicator — keyword match first (instant), then AI fallback
  let matched: { code: string; label: string; unit: string } | null = null;
  const coreCode = matchWorldBankCoreKeyword(query);
  if (coreCode) {
    matched =
      Object.values(WORLD_BANK_INDICATORS).find((indicator) => indicator.code === coreCode)
      ?? { code: coreCode, label: coreCode, unit: "" };
  } else {
    const sortedEntries = Object.entries(WORLD_BANK_INDICATORS)
      .sort((a, b) => b[0].length - a[0].length);
    for (const [keyword, indicator] of sortedEntries) {
      if (lower.includes(keyword)) {
        matched = indicator;
        break;
      }
    }
  }

  // AI fallback for non-English prompts or unusual phrasing
  if (!matched) {
    const intent = await extractWorldBankIntent(query);
    if (intent) {
      if (!intent.isCountryLevel) {
        return { found: false, error: "World Bank only has country-level data; AI detected sub-national intent" };
      }
      if (intent.indicatorKey) {
        matched = WORLD_BANK_INDICATORS[intent.indicatorKey];
      } else if (intent.indicatorCode && intent.indicatorLabel) {
        // AI discovered an indicator code outside the curated list
        matched = { code: intent.indicatorCode, label: intent.indicatorLabel, unit: "" };
      }
    }
  }

  if (!matched) {
    return { found: false, error: "No matching World Bank indicator found" };
  }

  // Reject known false-positive indicator matches — the AI fallback
  // can map semantically wrong prompts to related-but-incorrect indicators
  // (e.g. "deforestation" → forest area, "healthcare spending" → total GDP).
  const INDICATOR_BLACKLIST: Record<string, string[]> = {
    "AG.LND.FRST.ZS": ["deforestation", "forest loss", "wildfire", "fire", "bränder", "skogsbrand", "avskogning"],
    "NY.GDP.MKTP.CD": ["healthcare", "health spending", "education spending", "military spending", "research spending", "r&d", "forskning", "sjukvård", "hälsa"],
    // Crude death rate (all ages) must not match child/infant/neonatal mortality queries
    "SP.DYN.CDRT.IN": ["child mortality", "under-5", "infant mortality", "neonatal", "barnmortalitet", "barnadödlighet", "spädbarnsdödlighet"],
    // Child mortality must not match crude death rate queries
    "SH.DYN.MORT": ["death rate", "crude death", "dödstal"],
  };
  const blacklistTerms = INDICATOR_BLACKLIST[matched.code];
  if (blacklistTerms?.some((term) => lower.includes(term))) {
    return { found: false, error: "Indicator does not match user intent" };
  }

  // Detect sub-regional scope for server-side filtering
  const scope = detectScope(query);
  const cacheKey = scope
    ? `worldbank-${matched.code}-${scope.key.toLowerCase()}`
    : `worldbank-${matched.code}`;
  const cached = await getCachedData(cacheKey);
  if (cached) {
    return {
      found: true,
      source: "World Bank",
      description: `${matched.label} by country (${matched.unit})`,
      featureCount: cached.profile.featureCount,
      geometryType: cached.profile.geometryType,
      attributes: cached.profile.attributes.map((a) => a.name),
      cacheKey,
      profile: cached.profile,
    };
  }

  try {
    // Fetch latest data for all countries
    const url = `https://api.worldbank.org/v2/country/all/indicator/${matched.code}?format=json&per_page=300&mrnev=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { found: false, error: "World Bank API error" };

    const json = await parseWbJson(res);
    const parsed = Array.isArray(json) ? json : [];
    const records = parsed[1] as Array<{
      country: { id: string; value: string };
      countryiso3code: string;
      value: number | null;
      date: string;
    }> | undefined;

    if (!records || records.length === 0) {
      return { found: false, error: "No data returned from World Bank" };
    }

    // Load local country geometries
    const geoData = await loadCountryGeometry();
    if (!geoData) return { found: false, error: `Country geometry not found: ${COUNTRIES_GEO_FILE}` };

    // Build lookup: ISO_A3 → World Bank value
    const valueLookup = new Map<string, { value: number; date: string; countryName: string }>();
    for (const rec of records) {
      if (rec.value != null && rec.countryiso3code) {
        valueLookup.set(rec.countryiso3code, {
          value: rec.value,
          date: rec.date,
          countryName: rec.country.value,
        });
      }
    }

    // Join data with geometries
    const features: GeoJSON.Feature[] = geoData.features
      .filter((f) => {
        const iso = f.properties?.["ISO_A3"] ?? f.properties?.["iso_a3"];
        return iso && valueLookup.has(iso);
      })
      .map((f) => {
        const iso = f.properties?.["ISO_A3"] ?? f.properties?.["iso_a3"];
        const data = valueLookup.get(iso)!;
        return {
          type: "Feature" as const,
          geometry: f.geometry,
          properties: {
            name: data.countryName,
            iso_a3: iso,
            continent: ISO_TO_CONTINENT[iso as string] ?? "",
            [matched!.code]: data.value,
            value: data.value,
            year: data.date,
          },
        };
      });

    // Apply sub-regional scope filter (EU, Nordic, OECD, etc.)
    const filtered = scope
      ? features.filter((f) => scope.countries.has(f.properties?.iso_a3 as string))
      : features;

    if (filtered.length === 0) {
      return { found: false, error: "No countries matched between World Bank and geometry data" };
    }

    const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: filtered };
    const profile = profileDataset(fc);

    const entry: CacheEntry = {
      data: fc,
      profile,
      source: "World Bank",
      description: `${matched.label} by country (${matched.unit})`,
      timestamp: Date.now(),
    };

    await setCache(cacheKey, entry);

    return {
      found: true,
      source: "World Bank",
      description: `${matched.label} by country (${matched.unit}), ${filtered.length} countries${scope ? ` (${scope.key})` : ""}`,
      featureCount: filtered.length,
      geometryType: "Polygon",
      attributes: profile.attributes.map((a) => a.name),
      cacheKey,
      profile,
    };
  } catch (err) {
    return { found: false, error: err instanceof Error ? err.message : "World Bank search failed" };
  }
}

// ─── NASA EONET (Natural Events) ────────────────────────────

/**
 * EONET event category keywords.
 */
const EONET_CATEGORIES: Record<string, { id: string; label: string }> = {
  wildfire: { id: "wildfires", label: "Wildfires" },
  wildfires: { id: "wildfires", label: "Wildfires" },
  bränder: { id: "wildfires", label: "Wildfires" },
  skogsbrand: { id: "wildfires", label: "Wildfires" },
  volcano: { id: "volcanoes", label: "Volcanoes" },
  volcanoes: { id: "volcanoes", label: "Volcanoes" },
  vulkan: { id: "volcanoes", label: "Volcanoes" },
  storm: { id: "severeStorms", label: "Severe Storms" },
  storms: { id: "severeStorms", label: "Severe Storms" },
  hurricane: { id: "severeStorms", label: "Severe Storms" },
  cyclone: { id: "severeStorms", label: "Severe Storms" },
  typhoon: { id: "severeStorms", label: "Severe Storms" },
  flood: { id: "floods", label: "Floods" },
  floods: { id: "floods", label: "Floods" },
  översvämning: { id: "floods", label: "Floods" },
  drought: { id: "drought", label: "Drought" },
  torka: { id: "drought", label: "Drought" },
  iceberg: { id: "seaLakeIce", label: "Sea and Lake Ice" },
  "sea ice": { id: "seaLakeIce", label: "Sea and Lake Ice" },
  landslide: { id: "landslides", label: "Landslides" },
  "natural events": { id: "", label: "All Natural Events" },
  "natural disasters": { id: "", label: "All Natural Events" },
  naturkatastrofer: { id: "", label: "All Natural Events" },
};

/**
 * Search NASA EONET for natural events.
 * Returns point features for each event with coordinates.
 */
export async function searchEONET(query: string): Promise<DataSearchResult> {
  const lower = query.toLowerCase();

  let matched: { id: string; label: string } | null = null;
  for (const [keyword, cat] of Object.entries(EONET_CATEGORIES)) {
    if (lower.includes(keyword)) {
      matched = cat;
      break;
    }
  }

  if (!matched) {
    return { found: false, error: "No matching EONET category found" };
  }

  const cacheKey = `eonet-${matched.id || "all"}`;
  const cached = await getCachedData(cacheKey);
  if (cached) {
    return {
      found: true,
      source: "NASA EONET",
      description: `${matched.label} (active events)`,
      featureCount: cached.profile.featureCount,
      geometryType: cached.profile.geometryType,
      attributes: cached.profile.attributes.map((a) => a.name),
      cacheKey,
      profile: cached.profile,
    };
  }

  try {
    const categoryParam = matched.id ? `&category=${matched.id}` : "";
    const url = `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=200${categoryParam}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { found: false, error: "NASA EONET API error" };

    const json = await res.json() as {
      events: Array<{
        id: string;
        title: string;
        categories: Array<{ id: string; title: string }>;
        geometry: Array<{
          date: string;
          type: string;
          coordinates: unknown;
          magnitudeValue?: number;
          magnitudeUnit?: string;
        }>;
      }>;
    };

    if (!json.events || json.events.length === 0) {
      return { found: false, error: "No active events found" };
    }

    // Use latest geometry entry for each event, preserving the actual geometry type
    const features: GeoJSON.Feature[] = json.events
      .filter((e) => e.geometry.length > 0)
      .map((e) => {
        const latest = e.geometry[e.geometry.length - 1];
        const geomType = latest.type ?? "Point";
        return {
          type: "Feature" as const,
          geometry: {
            type: geomType,
            coordinates: latest.coordinates,
          } as GeoJSON.Geometry,
          properties: {
            name: e.title,
            event_id: e.id,
            category: e.categories[0]?.title ?? "",
            date: latest.date,
            magnitude: latest.magnitudeValue ?? null,
            magnitude_unit: latest.magnitudeUnit ?? "",
          },
        };
      });

    if (features.length === 0) {
      return { found: false, error: "No events with coordinates" };
    }

    const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
    const profile = profileDataset(fc);

    const entry: CacheEntry = {
      data: fc,
      profile,
      source: "NASA EONET",
      description: `${matched.label} (active events)`,
      timestamp: Date.now(),
    };

    await setCache(cacheKey, entry);

    return {
      found: true,
      source: "NASA EONET",
      description: `${matched.label}, ${features.length} active events`,
      featureCount: features.length,
      geometryType: "Point",
      attributes: profile.attributes.map((a) => a.name),
      cacheKey,
      profile,
    };
  } catch (err) {
    return { found: false, error: err instanceof Error ? err.message : "EONET search failed" };
  }
}

// ─── REST Countries ─────────────────────────────────────────

/**
 * Keywords that trigger REST Countries data.
 * Used when the user wants country-level data that World Bank doesn't cover
 * (e.g. area, region, capitals) or as a lightweight alternative.
 */
const REST_COUNTRIES_KEYWORDS = [
  "all countries", "world countries", "list countries",
  "alla länder", "land area", "yta",
  "capitals", "huvudstäder", "capital cities",
];

/**
 * Search REST Countries API.
 * Returns country points (capital coordinates) with population, area, region.
 */
export async function searchRESTCountries(query: string): Promise<DataSearchResult> {
  const lower = query.toLowerCase();

  const isMatch = REST_COUNTRIES_KEYWORDS.some((kw) => lower.includes(kw));
  if (!isMatch) {
    return { found: false, error: "No matching REST Countries query" };
  }

  const cacheKey = "rest-countries-all";
  const cached = await getCachedData(cacheKey);
  if (cached) {
    return {
      found: true,
      source: "REST Countries",
      description: "Countries with population, area, region",
      featureCount: cached.profile.featureCount,
      geometryType: cached.profile.geometryType,
      attributes: cached.profile.attributes.map((a) => a.name),
      cacheKey,
      profile: cached.profile,
    };
  }

  try {
    const url = "https://restcountries.com/v3.1/all?fields=name,cca3,region,subregion,population,area,latlng,capitalInfo,capital";
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { found: false, error: "REST Countries API error" };

    const countries = await res.json() as Array<{
      name: { common: string; official: string };
      cca3: string;
      region: string;
      subregion: string;
      population: number;
      area: number;
      latlng: [number, number];
      capital?: string[];
      capitalInfo?: { latlng?: [number, number] };
    }>;

    if (!countries || countries.length === 0) {
      return { found: false, error: "No countries returned" };
    }

    const features: GeoJSON.Feature[] = countries
      .filter((c) => {
        // Need valid coordinates
        const coords = c.capitalInfo?.latlng ?? c.latlng;
        return coords && coords.length === 2 && isFinite(coords[0]) && isFinite(coords[1]);
      })
      .map((c) => {
        // Prefer capital coordinates, fall back to country center
        const coords = c.capitalInfo?.latlng ?? c.latlng;
        return {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [coords[1], coords[0]], // [lon, lat] — REST Countries returns [lat, lon]
          },
          properties: {
            name: c.name.common,
            iso_a3: c.cca3,
            capital: c.capital?.[0] ?? "",
            region: c.region,
            subregion: c.subregion,
            population: c.population,
            area: c.area,
          },
        };
      });

    if (features.length === 0) {
      return { found: false, error: "No countries with coordinates" };
    }

    const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
    const profile = profileDataset(fc);

    const entry: CacheEntry = {
      data: fc,
      profile,
      source: "REST Countries",
      description: "Countries with population, area, region",
      timestamp: Date.now(),
    };

    await setCache(cacheKey, entry);

    return {
      found: true,
      source: "REST Countries",
      description: `World countries, ${features.length} countries with population, area, region`,
      featureCount: features.length,
      geometryType: "Point",
      attributes: profile.attributes.map((a) => a.name),
      cacheKey,
      profile,
    };
  } catch (err) {
    return { found: false, error: err instanceof Error ? err.message : "REST Countries search failed" };
  }
}

// ─── Numeric data check ─────────────────────────────────────

/** Property names that are administrative metadata, not data. */
const METADATA_PROPS = new Set([
  "name", "shapename", "shapeiso", "shapeid", "shapegroup", "shapetype",
  "iso_a2", "iso_a3", "iso_3166_2", "admin", "id", "fid", "objectid",
  "type", "code", "level", "boundary",
  // CartoDB / database IDs
  "cartodb_id", "gid", "ogc_fid",
  // Common admin code fields
  "codigo_ibg", "codigo_ibge", "cod_ibge", "geocodigo",
  "hasc", "iso", "iso_code",
]);

/** Patterns for property names that are metadata, not data. */
const METADATA_SUFFIXES = ["_id", "_code", "_iso", "_fid"];

/**
 * Check if a property name looks like administrative metadata.
 */
function isMetadataKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (METADATA_PROPS.has(lower)) return true;
  for (const suffix of METADATA_SUFFIXES) {
    if (lower.endsWith(suffix)) return true;
  }
  return false;
}

/**
 * Check if a FeatureCollection has at least one numeric data property
 * (not just boundary metadata like shapeName, shapeISO, ids, codes, etc.).
 *
 * Samples up to 5 features. Returns false for geometry-only datasets.
 */
export function hasNumericProperties(fc: GeoJSON.FeatureCollection): boolean {
  const sample = fc.features.slice(0, 5);
  for (const feature of sample) {
    const props = feature.properties;
    if (!props) continue;
    for (const [key, value] of Object.entries(props)) {
      if (isMetadataKey(key)) continue;
      if (typeof value === "number" && isFinite(value)) return true;
    }
  }
  return false;
}

/**
 * Return true when a FeatureCollection is worth serving as a map layer.
 *
 * Statistical data requires numeric properties (choropleth / proportional symbol).
 * Point-of-interest data (landmarks, locations, etc.) is valid with only string
 * properties — the user just wants to see where things are, not compare values.
 *
 * A dataset is usable when:
 *   - It has numeric properties (statistical/metric data), OR
 *   - All sampled features have Point geometry and at least one non-metadata
 *     string property (name, title, description, etc.)
 */
export function isUsableDataset(fc: GeoJSON.FeatureCollection): boolean {
  if (fc.features.length === 0) return false;
  if (hasNumericProperties(fc)) return true;

  // Accept pure point datasets with at least one named property
  const sample = fc.features.slice(0, 5);
  const allPoints = sample.every(
    (f) => f.geometry?.type === "Point" || f.geometry?.type === "MultiPoint",
  );
  if (!allPoints) {
    // Accept polygon/multipolygon data with categorical/name fields
    // (e.g. historical boundaries, empire extents, land use zones)
    const allPolygons = sample.every(
      (f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon",
    );
    if (allPolygons) {
      return sample.some((f) => {
        if (!f.properties) return false;
        return Object.entries(f.properties).some(
          ([k, v]) => !isMetadataKey(k) && typeof v === "string" && v.length > 0,
        );
      });
    }
    return false;
  }

  const NAME_KEYS = /^(name|title|label|description|site|place|location|monument|wonder|heritage)/i;
  return sample.some((f) => {
    const props = f.properties;
    if (!props) return false;
    return Object.entries(props).some(
      ([k, v]) => typeof v === "string" && v.length > 0 && !isMetadataKey(k) && NAME_KEYS.test(k),
    );
  });
}

// ─── Direct URL fetch ───────────────────────────────────────

/**
 * Fetch a URL and try to parse it as GeoJSON.
 */
export async function fetchGeoJSON(
  url: string,
  options?: { requireNumericData?: boolean },
): Promise<DataSearchResult> {
  const cacheKey = `url-${url}`;
  const cached = await getCachedData(cacheKey);
  if (cached) {
    // Reject cached boundary-only data when numeric data is required
    if (options?.requireNumericData && !hasNumericProperties(cached.data)) {
      return { found: false, error: "Cached data has no numeric properties (boundary-only)" };
    }
    return {
      found: true,
      source: url,
      description: cached.description,
      featureCount: cached.profile.featureCount,
      geometryType: cached.profile.geometryType,
      attributes: cached.profile.attributes.map((a) => a.name),
      cacheKey,
      profile: cached.profile,
    };
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { found: false, error: `HTTP ${res.status}` };

    const data = await res.json();
    if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) {
      return { found: false, error: "Response is not a GeoJSON FeatureCollection" };
    }

    const fc = data as GeoJSON.FeatureCollection;
    if (fc.features.length === 0) {
      return { found: false, error: "Empty FeatureCollection" };
    }

    // Reject boundary-only GeoJSON when numeric data is required
    if (options?.requireNumericData && !hasNumericProperties(fc)) {
      return { found: false, error: "GeoJSON has no numeric properties (boundary-only)" };
    }

    const profile = profileDataset(fc);

    const entry: CacheEntry = {
      data: fc,
      profile,
      source: url,
      description: `GeoJSON from ${new URL(url).hostname}`,
      timestamp: Date.now(),
    };

    await setCache(cacheKey, entry);

    return {
      found: true,
      source: url,
      description: `GeoJSON from ${new URL(url).hostname}, ${fc.features.length} features`,
      featureCount: fc.features.length,
      geometryType: profile.geometryType,
      attributes: profile.attributes.map((a) => a.name),
      cacheKey,
      profile,
    };
  } catch (err) {
    return { found: false, error: err instanceof Error ? err.message : "Fetch failed" };
  }
}

// ─── Unified search ─────────────────────────────────────────

/**
 * Search all available public data sources.
 * Tries EONET first (natural events are unambiguous — wildfires, earthquakes),
 * then World Bank (country-level stats), then REST Countries.
 */
export async function searchPublicData(
  query: string,
  url?: string,
): Promise<DataSearchResult> {
  // Try NASA EONET first (natural events/disasters) — prevents World Bank
  // AI fallback from matching "wildfires" → forest area, etc.
  const eonetResult = await searchEONET(query);
  if (eonetResult.found) return eonetResult;

  // Try World Bank (country-level statistics)
  const wbResult = await searchWorldBank(query);
  if (wbResult.found) return wbResult;

  // Try REST Countries (country metadata)
  const rcResult = await searchRESTCountries(query);
  if (rcResult.found) return rcResult;

  // Try direct URL
  if (url) {
    const urlResult = await fetchGeoJSON(url);
    if (urlResult.found) return urlResult;
  }

  return { found: false, error: "No matching public dataset found" };
}
