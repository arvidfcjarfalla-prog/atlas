/**
 * Kolada integration — Swedish municipal KPIs.
 *
 * Fetches municipality-level statistics from api.kolada.se and joins
 * to Swedish municipality geometry (SCB 4-digit codes).
 *
 * No auth required. Data covers ~5000 KPIs across all 290 Swedish municipalities.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateText } from "ai";
import { MODELS } from "../ai-client";
import { profileDataset } from "../profiler";
import {
  getCachedData,
  setCache,
  type DataSearchResult,
  type CacheEntry,
  type NormalizedMeta,
} from "./data-search";

// ─── Constants ──────────────────────────────────────────────

const KOLADA_API = "https://api.kolada.se/v2";
const API_TIMEOUT_MS = 8_000;
const AI_TIMEOUT_MS = 2_500;
const SE_MUNICIPALITIES_GEO = "geo/se/municipalities.geojson";
const MIN_COVERAGE = 0.75; // 218 of 290

// ─── Curated KPI catalog ────────────────────────────────────

interface KpiConfig {
  id: string;
  label: string;
  /** Property name in GeoJSON output. */
  property: string;
  /** Unit for display in legend/tooltip. */
  unit: string;
}

/**
 * Curated Kolada KPI definitions — verified against live API.
 * Each entry lists every keyword that should resolve to that KPI.
 * The flat keyword→config lookup `KOLADA_KPIS` is built from this list.
 */
interface KpiDef extends KpiConfig {
  aliases: string[];
}

const KOLADA_KPI_DEFS: KpiDef[] = [
  // Population
  { id: "N01951", label: "Invånare totalt", property: "population", unit: "antal",
    aliases: ["befolkning", "invånare", "population", "folkmängd"] },
  // Unemployment
  { id: "N02280", label: "Arbetslöshet 20-64 år (BAS)", property: "unemployment_rate", unit: "%",
    aliases: ["arbetslöshet", "unemployment"] },
  { id: "N03920", label: "Arbetslösa av befolkningen 18-65 år", property: "unemployment_rate", unit: "%",
    aliases: ["arbetslösa"] },
  { id: "N03935", label: "Arbetslösa av befolkningen 18-24 år", property: "youth_unemployment", unit: "%",
    aliases: ["ungdomsarbetslöshet"] },
  // Income
  { id: "N00906", label: "Sammanräknad förvärvsinkomst 20-64 år (median)", property: "median_income", unit: "kr",
    aliases: ["inkomst", "medianinkomst", "medelinkomst", "income"] },
  { id: "N00905", label: "Mediannettoinkomst", property: "net_income", unit: "kr",
    aliases: ["nettoinkomst"] },
  { id: "N00956", label: "Ginikoefficient — förvärvsinkomst", property: "gini", unit: "index",
    aliases: ["gini"] },
  // Education
  { id: "N00218", label: "Anställda med eftergymnasial utbildning", property: "higher_education_pct", unit: "%",
    aliases: ["utbildning", "utbildningsnivå", "education"] },
  // Demographics
  { id: "N01938", label: "Invånare 65+", property: "elderly", unit: "antal",
    aliases: ["äldre"] },
  { id: "N01919", label: "Invånare 0-19 år", property: "children", unit: "antal",
    aliases: ["barn"] },
  { id: "N01963", label: "Befolkningsförändring sedan föregående år", property: "population_change", unit: "%",
    aliases: ["befolkningsförändring"] },
  // Social
  { id: "N31825", label: "Biståndsmottagare ekonomiskt bistånd 18+", property: "welfare_recipients", unit: "%",
    aliases: ["bistånd"] },
  { id: "U01803", label: "Invånare 18-64 med låg inkomst", property: "low_income_pct", unit: "%",
    aliases: ["fattigdom"] },
];

/** Flat keyword→config lookup, built once from KOLADA_KPI_DEFS. */
const KOLADA_KPIS: Record<string, KpiConfig> = (() => {
  const map: Record<string, KpiConfig> = {};
  for (const def of KOLADA_KPI_DEFS) {
    const config: KpiConfig = { id: def.id, label: def.label, property: def.property, unit: def.unit };
    for (const alias of def.aliases) map[alias] = config;
  }
  return map;
})();

// ─── Keyword matching ───────────────────────────────────────

/**
 * Swedish municipality signals in prompts — indicates Kolada may be relevant.
 */
const MUNICIPALITY_SIGNALS = [
  "kommun", "kommuner", "kommunerna", "kommunal", "kommunalt",
  "svenska kommuner", "swedish municipalities",
];

/** Check if the prompt asks about Swedish municipalities. */
export function isSwedishMunicipalPrompt(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  const hasSweden = /\b(sweden|sverige|svensk|svenska)\b/.test(lower);
  const hasMunicipality = MUNICIPALITY_SIGNALS.some((s) => lower.includes(s));
  return hasSweden || hasMunicipality;
}

/** Find matching KPI config from prompt keywords. */
function matchKpi(prompt: string): KpiConfig | null {
  const lower = prompt.toLowerCase();
  const words = lower.split(/\s+/).filter((w) => w.length > 2);

  // Check multi-word matches first
  for (const word of words) {
    const config = KOLADA_KPIS[word];
    if (config) return config;
  }

  return null;
}

// ─── AI KPI selection (fallback) ────────────────────────────

async function aiSelectKpi(prompt: string): Promise<KpiConfig | null> {
  const kpiList = KOLADA_KPI_DEFS
    .map((def) => `${def.aliases[0]}: ${def.id} — ${def.label}`)
    .join("\n");

  try {
    const result = await Promise.race([
      generateText({
        model: MODELS.utility(),
        maxOutputTokens: 32,
        system: "You match user queries to Swedish municipal KPI IDs. Return ONLY the KPI ID (e.g. N02280). If no match, return NONE.",
        messages: [{ role: "user", content: `Query: ${prompt}\n\nAvailable KPIs:\n${kpiList}\n\nBest KPI ID:` }],
      }).then((r) => r.text.trim()),
      new Promise<string>((resolve) => setTimeout(() => resolve("NONE"), AI_TIMEOUT_MS)),
    ]);

    if (result === "NONE") return null;

    // Find the def for this ID (covers both N* and U* prefixes)
    const def = KOLADA_KPI_DEFS.find((d) => d.id === result);
    if (!def) return null;
    return { id: def.id, label: def.label, property: def.property, unit: def.unit };
  } catch {
    return null;
  }
}

// ─── Geometry loading ───────────────────────────────────────

let geoCache: GeoJSON.FeatureCollection | null = null;

async function loadMunicipalityGeometry(): Promise<GeoJSON.FeatureCollection | null> {
  if (geoCache) return geoCache;
  try {
    const filePath = join(process.cwd(), "public", SE_MUNICIPALITIES_GEO);
    const raw = await readFile(filePath, "utf-8");
    geoCache = JSON.parse(raw) as GeoJSON.FeatureCollection;
    return geoCache;
  } catch {
    return null;
  }
}

// ─── Main search function ───────────────────────────────────

export async function searchKolada(query: string): Promise<DataSearchResult> {
  // Only run for Swedish municipality prompts
  if (!isSwedishMunicipalPrompt(query)) {
    return { found: false };
  }

  // Keyword match first, AI fallback if needed
  let kpi = matchKpi(query);
  if (!kpi) {
    kpi = await aiSelectKpi(query);
  }
  if (!kpi) {
    return { found: false, error: "No matching Kolada KPI found" };
  }

  const cacheKey = `kolada-${kpi.id}`;
  const cached = await getCachedData(cacheKey);
  if (cached) {
    return {
      found: true,
      source: "Kolada",
      description: `${kpi.label} per kommun (${kpi.unit})`,
      featureCount: cached.profile.featureCount,
      geometryType: cached.profile.geometryType,
      attributes: cached.profile.attributes.map((a) => a.name),
      cacheKey,
      profile: cached.profile,
    };
  }

  try {
    // Fetch data — try last year, fall back to year before
    const thisYear = new Date().getFullYear();
    let data = await fetchKoladaData(kpi.id, thisYear - 1);
    if (!data || data.length < 100) {
      data = await fetchKoladaData(kpi.id, thisYear - 2);
    }
    if (!data || data.length === 0) {
      return { found: false, error: "No Kolada data available" };
    }

    // Build value lookup: municipality code → value
    const valueLookup = new Map<string, { value: number; period: number }>();
    for (const obs of data) {
      // Use gender=T (total), skip missing data
      const total = obs.values?.find(
        (v: KoladaValue) => v.gender === "T" && v.status !== "M" && v.value != null,
      );
      if (total) {
        valueLookup.set(obs.municipality, { value: total.value, period: obs.period });
      }
    }

    // Load geometry
    const geometry = await loadMunicipalityGeometry();
    if (!geometry) {
      return { found: false, error: `Geometry not found: ${SE_MUNICIPALITIES_GEO}` };
    }

    // Join
    const features: GeoJSON.Feature[] = [];
    for (const feature of geometry.features) {
      const scbCode = feature.properties?.scb_code as string | undefined;
      if (!scbCode) continue;

      const obs = valueLookup.get(scbCode);
      if (!obs) continue;

      features.push({
        type: "Feature",
        geometry: feature.geometry,
        properties: {
          name: feature.properties?.name,
          scb_code: scbCode,
          [kpi.property]: obs.value,
          _atlas_value: obs.value,
          _atlas_code: scbCode,
          _atlas_metric_label: kpi.label,
          _atlas_unit: kpi.unit,
          data_year: obs.period,
        },
      });
    }

    // Coverage check
    if (features.length < geometry.features.length * MIN_COVERAGE) {
      return {
        found: false,
        error: `Low coverage: ${features.length}/${geometry.features.length} municipalities`,
      };
    }

    // Build FeatureCollection
    const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
    const profile = profileDataset(fc);

    const description = `${kpi.label} per kommun (${kpi.unit}), ${features.length} kommuner`;

    // Cache
    const entry: CacheEntry = {
      data: fc,
      profile,
      source: "Kolada",
      description,
      timestamp: Date.now(),
      normalizedMeta: {
        sourceMetadata: { sourceId: "se-kolada", sourceName: "Kolada", tableId: kpi.id, fetchedAt: Date.now() },
        dimensions: [],
        candidateMetricFields: [kpi.property],
      },
    };
    await setCache(cacheKey, entry);

    return {
      found: true,
      source: "Kolada",
      description,
      featureCount: features.length,
      geometryType: "Polygon",
      attributes: profile.attributes.map((a) => a.name),
      cacheKey,
      profile,
    };
  } catch (err) {
    return { found: false, error: err instanceof Error ? err.message : "Kolada search failed" };
  }
}

// ─── API helpers ────────────────────────────────────────────

interface KoladaValue {
  gender: string;
  status: string;
  value: number;
  count: number;
}

interface KoladaObservation {
  kpi: string;
  municipality: string;
  period: number;
  values: KoladaValue[];
}

async function fetchKoladaData(
  kpiId: string,
  year: number,
): Promise<KoladaObservation[] | null> {
  const url = `${KOLADA_API}/data/kpi/${kpiId}/year/${year}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
  if (!res.ok) return null;

  const json = (await res.json()) as { count: number; values: KoladaObservation[] };
  return json.values ?? null;
}
