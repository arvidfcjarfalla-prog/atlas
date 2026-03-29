/**
 * PxWeb map resolution pipeline.
 *
 * Integrates the universal architecture layers for PxWeb sources:
 *   1. Normalize PxWeb output → NormalizedSourceResult
 *   2. Detect geography → DetectionResult
 *   3. Plan join → JoinPlanResult
 *   4. Execute join → JoinExecutionResult
 *   5. Classify → PxWebResolutionResult
 *
 * This module does NOT replace the existing `searchPxWeb()` function.
 * It wraps its artifacts and runs them through the resolution pipeline,
 * producing a final verdict: map_ready, tabular_only, candidate_mode,
 * or unsupported.
 *
 * The clarify route calls `resolvePxWeb()` instead of `searchPxWeb()`
 * and only treats the result as success when mapReady is true.
 */

import type { OfficialStatsSource } from "./global-stats-registry";
import type { NormalizedSourceResult, GeographyLevel, DatasetCandidate } from "./normalized-result";
import type { DetectionResult } from "./geography-detector";
import { detectGeographyWithPlugins } from "./geography-detector";
import type { JoinPlanResult } from "./join-planner";
import { planJoinWithPlugins } from "./join-planner";
import { collectJoinEnrichment, getKnownTablesForSource } from "./geography-plugins";
// Side-effect import: registers built-in geography plugins
import "./register-plugins";
import type { JoinExecutionResult, JoinExecutionDiagnostics } from "./geometry-join";
import { executeJoin } from "./geometry-join";
import { findById } from "./geometry-registry";
import type { GeometryEntry, LayerStatus } from "./geometry-registry";
import { loadGeometry } from "./geometry-loader";
import {
  normalizePxWebResult,
  normalizePxNoGeoDimension,
  buildPxCandidates,
} from "./source-adapter";
import {
  searchTables,
  fetchMetadata,
  fetchData,
  selectDimensionsWithAmbiguity,
  jsonStat2ToRecords,
  rankTables,
  buildPxSearchQuery,
  translateSearchQuery,
  extractGeoLevelHint,
  getStatsAdapter,
} from "./pxweb-client";
import type {
  PxTableMetadata,
  PxDataRecord,
  PxDimensionSelection,
  PxTableInfo,
  StatsApiAdapter,
} from "./pxweb-client";
import { aiSelectContentsValue, aiSelectTable } from "./ai-metric-matcher";
import { getCachedData, setCache, type CacheEntry } from "./data-search";
import { profileDataset } from "../profiler";
import { recordsToGeoJSON } from "./pxweb-client";
import { recordResolution, getLearnedTables } from "./resolution-memory";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** Final pipeline status for a PxWeb resolution attempt. */
export type PxWebResolutionStatus =
  | "map_ready"       // join succeeded, can render choropleth
  | "tabular_only"    // data found but no viable geometry join
  | "candidate_mode"  // low-confidence table selection, user should pick
  | "unsupported";    // no data or pipeline failure

/** Full result of the PxWeb resolution pipeline. */
export interface PxWebResolutionResult {
  status: PxWebResolutionStatus;

  /** The normalized source result (always present when data was fetched). */
  normalized?: NormalizedSourceResult;
  /** Geography detection result. */
  detection?: DetectionResult;
  /** Join plan result. */
  joinPlan?: JoinPlanResult;
  /** Join execution result (only when geometry was loaded). */
  joinExecution?: JoinExecutionResult;

  /** Cache key for the GeoJSON data (for /api/geo/cached/ proxy). */
  cacheKey?: string;
  /** Dataset profile. */
  profile?: import("../types").DatasetProfile;

  /** Alternative datasets the user could choose. */
  candidates?: DatasetCandidate[];

  /** 0.0–1.0 overall resolution confidence. */
  confidence: number;
  /** Human-readable summary of what happened. */
  reasons: string[];
  /** Error message when status is unsupported. */
  error?: string;
}

// ═══════════════════════════════════════════════════════════════
// Cache-hit resolution (pure, testable)
// ═══════════════════════════════════════════════════════════════

/**
 * Build a PxWebResolutionResult from a cache entry.
 *
 * Only returns `map_ready` when the entry explicitly carries
 * `resolutionStatus: "map_ready"`. Legacy entries (pre-status)
 * and tabular_only entries are conservatively returned as
 * `tabular_only` to avoid overstating map readiness.
 */
export function resolveFromCache(
  cached: CacheEntry,
  cacheKey: string,
): PxWebResolutionResult {
  const status =
    cached.resolutionStatus === "map_ready" ? "map_ready" : "tabular_only";
  return {
    status,
    cacheKey,
    profile: cached.profile,
    confidence: status === "map_ready" ? 0.6 : 0.3,
    reasons: [
      status === "map_ready"
        ? "using cached validated map-ready result"
        : "using cached result (not validated as map-ready)",
    ],
  };
}

// ═══════════════════════════════════════════════════════════════
// Pure resolution function (testable without I/O)
// ═══════════════════════════════════════════════════════════════

/**
 * Run the resolution pipeline on already-fetched PxWeb artifacts.
 *
 * Pure function — no network calls, no caching. Takes all artifacts
 * as parameters so it can be tested in isolation.
 *
 * @param normalized - The NormalizedSourceResult from the PxWeb adapter
 * @param geometry - Pre-loaded geometry FeatureCollection (null if unavailable)
 * @param geometryStatus - Status of the geometry layer
 */
export function resolvePxWebPure(
  normalized: NormalizedSourceResult,
  geometry: GeoJSON.FeatureCollection | null = null,
  geometryStatus: LayerStatus = "production",
): PxWebResolutionResult {
  const reasons: string[] = [];

  // ── Non-ok adapter status → early exit ─────────────────────
  if (normalized.adapterStatus === "error") {
    return {
      status: "unsupported",
      normalized,
      confidence: 0,
      reasons: ["adapter error: " + (normalized.error ?? "unknown")],
      error: normalized.error,
    };
  }

  if (normalized.adapterStatus === "no_data") {
    return {
      status: "unsupported",
      normalized,
      confidence: 0,
      reasons: ["no data returned from PxWeb"],
      error: normalized.error ?? "No data",
    };
  }

  if (normalized.adapterStatus === "no_geo_dimension") {
    reasons.push("table has no geographic dimension");
    return {
      status: "tabular_only",
      normalized,
      confidence: normalized.confidence,
      reasons,
      candidates: normalized.candidates,
    };
  }

  // ── Candidate mode: low adapter confidence with alternatives ──
  if (
    normalized.confidence < 0.5 &&
    normalized.candidates &&
    normalized.candidates.length > 0
  ) {
    reasons.push(
      `low adapter confidence (${normalized.confidence}) with ${normalized.candidates.length} alternatives`,
    );
    return {
      status: "candidate_mode",
      normalized,
      candidates: normalized.candidates,
      confidence: normalized.confidence,
      reasons,
    };
  }

  // ── Step 2: Geography detection (plugin-enriched) ─────────
  const detection = detectGeographyWithPlugins(normalized);
  reasons.push(
    `detection: level=${detection.level}, confidence=${detection.confidence}, ` +
    `hint=${detection.renderHint}`,
  );

  if (detection.renderHint === "non_geographic") {
    reasons.push("detection says non-geographic — tabular only");
    return {
      status: "tabular_only",
      normalized,
      detection,
      confidence: Math.min(normalized.confidence, detection.confidence),
      reasons,
      candidates: normalized.candidates,
    };
  }

  // ── Step 3: Join planning (plugin-enriched) ───────────────
  const joinPlan = planJoinWithPlugins(detection, normalized.countryHints, normalized);
  reasons.push(
    `join plan: strategy=${joinPlan.strategy}, mapReady=${joinPlan.mapReady}, ` +
    `confidence=${joinPlan.confidence}`,
  );

  if (!joinPlan.mapReady) {
    reasons.push("join planner says not map-ready");
    return {
      status: "tabular_only",
      normalized,
      detection,
      joinPlan,
      confidence: joinPlan.confidence,
      reasons,
      candidates: normalized.candidates,
    };
  }

  // ── Step 4: Join execution ────────────────────────────────
  // For inline geometry / point-based, no polygon join is needed
  if (joinPlan.strategy === "inline_geometry") {
    reasons.push("inline geometry — no polygon join needed");
    return {
      status: "map_ready",
      normalized,
      detection,
      joinPlan,
      confidence: joinPlan.confidence,
      reasons,
    };
  }

  // For polygon joins, we need the geometry
  if (!geometry) {
    reasons.push("geometry not loaded — cannot execute join");
    return {
      status: "tabular_only",
      normalized,
      detection,
      joinPlan,
      confidence: Math.min(joinPlan.confidence, 0.4),
      reasons,
      candidates: normalized.candidates,
    };
  }

  // Collect alias normalizers from applicable plugins
  const joinEnrichment = collectJoinEnrichment(normalized);
  const normalizers = joinEnrichment.aliasNormalizers.map(({ name, normalizer }) => ({
    name,
    normalizer,
  }));

  const joinExecution = executeJoin(
    joinPlan,
    normalized.rows,
    geometry,
    geometryStatus,
    "first",
    normalizers,
  );
  reasons.push(
    `join execution: status=${joinExecution.status}, ` +
    `matched=${joinExecution.diagnostics.matched}, ` +
    `unmatched=${joinExecution.diagnostics.unmatched}, ` +
    `coverage=${joinExecution.diagnostics.coverageRatio}`,
  );

  // ── Step 5: Classify final result ─────────────────────────
  if (joinExecution.status === "map_ready") {
    return {
      status: "map_ready",
      normalized,
      detection,
      joinPlan,
      joinExecution,
      confidence: joinExecution.confidence,
      reasons,
    };
  }

  if (joinExecution.status === "tabular_only") {
    return {
      status: "tabular_only",
      normalized,
      detection,
      joinPlan,
      joinExecution,
      confidence: joinExecution.confidence,
      reasons,
      candidates: normalized.candidates,
    };
  }

  // unsupported
  return {
    status: "unsupported",
    normalized,
    detection,
    joinPlan,
    joinExecution,
    confidence: 0,
    reasons,
    error: "join execution returned unsupported",
  };
}

// ═══════════════════════════════════════════════════════════════
// Geometry resolution helper
// ═══════════════════════════════════════════════════════════════

/**
 * Run detection + planning on a normalized result to determine which
 * geometry layer to load, then load it via the geometry loader.
 *
 * Returns `{ geometry: null, geometryStatus: "production" }` when:
 *   - detection says non-geographic
 *   - planner says not map-ready or selects no geometry layer
 *   - registry entry not found
 *   - geometry loading fails
 */
export async function resolveGeometryForNormalized(
  normalized: NormalizedSourceResult,
): Promise<{ geometry: GeoJSON.FeatureCollection | null; geometryStatus: LayerStatus }> {
  const noGeometry = { geometry: null, geometryStatus: "production" as LayerStatus };

  // Skip early for non-ok adapter statuses
  if (
    normalized.adapterStatus === "error" ||
    normalized.adapterStatus === "no_data" ||
    normalized.adapterStatus === "no_geo_dimension"
  ) {
    return noGeometry;
  }

  // Run detection to see if this is geographic data
  const detection = detectGeographyWithPlugins(normalized);
  if (detection.renderHint === "non_geographic") {
    return noGeometry;
  }

  // Run planning to see if a geometry layer is selected
  const plan = planJoinWithPlugins(detection, normalized.countryHints, normalized);
  if (!plan.mapReady || !plan.geometryLayerId) {
    return noGeometry;
  }

  // Look up the registry entry
  const entry = findById(plan.geometryLayerId);
  if (!entry) {
    return noGeometry;
  }

  // Load the geometry
  const loadResult = await loadGeometry(entry);
  return {
    geometry: loadResult.geometry,
    geometryStatus: entry.status,
  };
}

// ═══════════════════════════════════════════════════════════════
// Full async resolution (with I/O)
// ═══════════════════════════════════════════════════════════════

/** Maximum number of ranked tables to try before giving up. */
const MAX_TABLE_ATTEMPTS = 5;

/**
 * Resolve a single PxWeb table: metadata → data → normalize → detect → join → classify.
 *
 * Pure extraction of what was the single-table body of resolvePxWeb().
 * Returns null for recoverable failures (no geo dim, no data) so the
 * caller can retry with the next table.
 */
async function resolveOneTable(
  source: OfficialStatsSource,
  table: PxTableInfo,
  allTables: PxTableInfo[],
  prompt: string,
  searchQuery: string,
  lang: string,
  cachePrefix: string,
  searchCacheKey: string,
  geoLevelHint?: string | null,
  adapter?: StatsApiAdapter,
): Promise<PxWebResolutionResult> {
  const baseUrl = source.baseUrl;
  const api = adapter ?? { searchTables, fetchMetadata, fetchData };

  // ── Fetch metadata ─────────────────────────────────────────
  const metadata = await api.fetchMetadata(baseUrl, table.id, lang);
  if (!metadata || metadata.dimensions.length === 0) {
    return {
      status: "unsupported",
      confidence: 0,
      reasons: [`failed to fetch metadata for table ${table.id}`],
      error: `Metadata fetch failed for ${table.id}`,
    };
  }

  // Check for geo dimension
  const geoDim = metadata.dimensions.find((d) => d.type === "geo");
  const contentsDim = metadata.dimensions.find((d) => d.type === "contents");
  const timeDim = metadata.dimensions.find((d) => d.type === "time");

  if (!geoDim) {
    const normalized = normalizePxNoGeoDimension({
      metadata,
      sourceId: source.id,
      sourceName: source.agencyName,
      prompt,
      searchQuery,
      tables: allTables,
      language: lang,
      apiType: source.id === "dk-dst" ? "dst" : undefined,
    });
    return resolvePxWebPure(normalized);
  }

  if (!timeDim) {
    return {
      status: "unsupported",
      confidence: 0,
      reasons: ["table missing required time dimension"],
      error: "Missing time dimension",
    };
  }

  // ── Select dimensions and fetch data ───────────────────────
  const dimResult = selectDimensionsWithAmbiguity(metadata, prompt, geoLevelHint);
  const selections = dimResult.selections;
  if (selections.length === 0) {
    return {
      status: "unsupported",
      confidence: 0,
      reasons: ["could not determine dimension selections"],
      error: "Dimension selection failed",
    };
  }

  // AI fallback for ambiguous contents dimension
  if (dimResult.contentsAmbiguous && dimResult.contentsValues && dimResult.contentsDimensionId) {
    const aiCode = await aiSelectContentsValue(
      prompt,
      dimResult.contentsValues,
      table.label,
    ).catch(() => null);
    if (aiCode) {
      const idx = selections.findIndex(
        (s) => s.dimensionId === dimResult.contentsDimensionId,
      );
      if (idx >= 0) {
        selections[idx] = {
          dimensionId: dimResult.contentsDimensionId,
          valueCodes: [aiCode],
        };
      }
    }
  }

  const data = await api.fetchData(baseUrl, table.id, selections, lang);
  if (!data || data.value.length === 0) {
    return {
      status: "unsupported",
      confidence: 0,
      reasons: [`no data returned for table ${table.id}`],
      error: "No data returned",
    };
  }

  // ── Parse records ──────────────────────────────────────────
  const records = jsonStat2ToRecords(data, geoDim.id, contentsDim?.id ?? null, timeDim.id, table.label);
  if (records.length === 0) {
    return {
      status: "unsupported",
      confidence: 0,
      reasons: ["no valid records in JSON-stat2 response"],
      error: "Empty records",
    };
  }

  // ── Normalize ──────────────────────────────────────────────
  const normalized = normalizePxWebResult({
    metadata,
    records,
    selections,
    geoDimId: geoDim.id,
    contentsDimId: contentsDim?.id ?? "_single",
    timeDimId: timeDim.id,
    sourceId: source.id,
    sourceName: source.agencyName,
    countryCode: source.countryCode,
    prompt,
    searchQuery,
    tables: allTables,
    language: lang,
    apiType: source.id === "dk-dst" ? "dst" : undefined,
  });

  // ── Load registry-backed geometry ──────────────────────────
  const { geometry: resolvedGeometry, geometryStatus } =
    await resolveGeometryForNormalized(normalized);

  // ── Run pure resolution pipeline ───────────────────────────
  const result = resolvePxWebPure(normalized, resolvedGeometry, geometryStatus);

  // ── Cache as GeoJSON with pipeline status ──────────────────
  if (normalized.adapterStatus === "ok" && records.length > 0) {
    const metricLabel =
      records[0].metricLabel ||
      contentsDim?.values[0]?.label ||
      table.label;

    // When join succeeded, cache the joined features (real polygon geometry
    // + metric properties). Otherwise fall back to raw records (null geometry).
    let fc: GeoJSON.FeatureCollection;
    if (
      result.status === "map_ready" &&
      result.joinExecution?.features &&
      result.joinExecution.features.length > 0
    ) {
      // Stamp metric label on features so the AI can use it for legend/title
      for (const f of result.joinExecution.features) {
        if (f.properties) {
          f.properties._atlas_metric_label = metricLabel;
          const df = f.properties._atlas_data_fields;
          if (Array.isArray(df) && !df.includes("_atlas_metric_label")) {
            df.push("_atlas_metric_label");
          }
        }
      }
      fc = { type: "FeatureCollection", features: result.joinExecution.features };
    } else {
      fc = recordsToGeoJSON(records, metricLabel);
    }

    const profile = profileDataset(fc);
    const tableKey = `${cachePrefix}-${table.id}`;
    const description = `${table.label} (${source.agencyName})`;

    const cacheEntry: CacheEntry = {
      data: fc,
      profile,
      source: source.agencyName,
      description,
      timestamp: Date.now(),
      resolutionStatus:
        result.status === "map_ready" ? "map_ready" : "tabular_only",
    };

    await setCache(tableKey, cacheEntry).catch(() => {});
    if (searchCacheKey !== tableKey) {
      await setCache(searchCacheKey, cacheEntry).catch(() => {});
    }

    // Learn from success — store the recipe for future similar prompts
    if (result.status === "map_ready") {
      const coverageRatio =
        result.joinExecution?.diagnostics?.coverageRatio ?? 0;
      recordResolution({
        sourceId: source.id,
        countryCode: source.countryCode ?? "",
        tableId: table.id,
        tableLabel: table.label,
        geoLevel: result.detection?.level ?? "unknown",
        keywords: searchQuery.split(/\s+/).filter((w) => w.length > 2),
        coverageRatio,
      }).catch(() => {});  // fire-and-forget, non-critical
    }

    return {
      ...result,
      cacheKey: tableKey,
      profile,
    };
  }

  return result;
}

/**
 * Full PxWeb resolution: fetch → normalize → detect → plan → join → classify.
 *
 * This replaces the old `searchPxWeb()` call in the clarify route.
 * Only returns map_ready when all pipeline stages succeed.
 *
 * When the first-choice table doesn't produce map_ready, retries with
 * the next-best table(s) from the ranked list (up to MAX_TABLE_ATTEMPTS).
 * This handles cases where the ranking picks a table with the wrong
 * geographic level (e.g. county instead of municipality).
 */
export async function resolvePxWeb(
  source: OfficialStatsSource,
  prompt: string,
): Promise<PxWebResolutionResult> {
  const baseUrl = source.baseUrl;
  const adapter = getStatsAdapter(source) ?? { searchTables, fetchMetadata, fetchData };
  const lang = source.countryCode === "SE" ? "sv"
    : source.countryCode === "NO" ? "no"
    : source.countryCode === "DK" ? "da"
    : source.countryCode === "FI" ? "en"
    : "en";

  // Build search query
  const searchQuery = buildPxSearchQuery(prompt);
  if (!searchQuery) {
    return {
      status: "unsupported",
      confidence: 0,
      reasons: ["no search keywords extracted from prompt"],
      error: "No search keywords",
    };
  }

  // Check cache — only trust status that was explicitly stored
  const cachePrefix = `pxweb-${source.id}`;
  const cachedKey = `${cachePrefix}-${searchQuery.replace(/\s+/g, "-")}`;
  const cached = await getCachedData(cachedKey);
  if (cached) {
    return resolveFromCache(cached, cachedKey);
  }

  // Extract geo-level hint early (needed for both search enrichment and ranking)
  const geoLevelHint = extractGeoLevelHint(prompt);

  // ── 1. Search for tables ──────────────────────────────────
  // Translate English keywords to the source language (e.g. "income" → "inkomst")
  const localQuery = translateSearchQuery(searchQuery, lang);

  let tables = await adapter.searchTables(baseUrl, localQuery, lang, 30);

  // If geo-level detected, also search with the appropriate geo term to find
  // tables at the right level (e.g. "kommun" for municipality, not "region")
  if (geoLevelHint && tables.length > 0) {
    const geoTermByLevel: Record<string, Record<string, string>> = {
      municipality: { sv: "kommun", en: "municipality", da: "kommune" },
      county: { sv: "lan", en: "county", da: "region" },
      region: { sv: "region", en: "region", da: "region" },
      admin1: { sv: "region", en: "region", da: "region" },
    };
    const enrichTerm = geoTermByLevel[geoLevelHint]?.[lang] ?? "region";
    const geoEnrichedQuery = `${localQuery} ${enrichTerm}`;
    const geoTables = await adapter.searchTables(baseUrl, geoEnrichedQuery, lang, 30);
    if (geoTables.length > 0) {
      // Merge: deduplicate by table ID, geo-enriched results first
      const seen = new Set<string>();
      const merged: typeof tables = [];
      for (const t of [...geoTables, ...tables]) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          merged.push(t);
        }
      }
      tables = merged;
    }
  }

  // If translation changed the query and got no results, try original English
  if (tables.length === 0 && localQuery !== searchQuery) {
    tables = await adapter.searchTables(baseUrl, searchQuery, lang);
  }
  // Fallback to English language endpoint
  if (tables.length === 0 && lang !== "en") {
    tables = await adapter.searchTables(baseUrl, searchQuery, "en");
  }
  if (tables.length === 0) {
    return {
      status: "unsupported",
      confidence: 0,
      reasons: ["no tables found for query"],
      error: "No tables found",
    };
  }

  // Rank tables with geo-level awareness
  const ranked = rankTables(tables, prompt, geoLevelHint, localQuery);

  // Prepend plugin-known tables (e.g. SSB 11342 for "population") so they are
  // always attempted first. Plugins know which table IDs are canonical for each
  // topic — free-text search and ranking can miss them (e.g. 11342 has
  // variableNames ["region", "contents", "year"] which gets no geo-level boost).
  // Pass both translated and raw query tokens to catch Norwegian→English mismatches.
  const rawKeywords = searchQuery.split(/\s+/);
  const translatedKeywords = localQuery !== searchQuery ? localQuery.split(/\s+/) : [];
  const allTopicKeywords = [...new Set([...rawKeywords, ...translatedKeywords])];
  const knownTableIds = getKnownTablesForSource(
    { sourceId: source.id, countryCode: source.countryCode ?? undefined },
    allTopicKeywords,
  );

  // Prepend learned tables — proven table IDs from past map_ready resolutions
  const learnedTableIds = await getLearnedTables(source.id, allTopicKeywords);
  // Merge: learned first, then plugin-known (deduped)
  const knownSet = new Set(knownTableIds);
  const allKnownTableIds = [
    ...learnedTableIds.filter((id) => !knownSet.has(id)),
    ...knownTableIds,
  ];

  // Build stub PxTableInfo objects for known tables that aren't in the search results.
  // resolveOneTable only needs the table id — all other fields are fetched from metadata.
  let orderedTables = ranked;
  if (allKnownTableIds.length > 0) {
    const rankedIds = new Set(ranked.map((t) => t.id));
    const knownStubs: PxTableInfo[] = allKnownTableIds
      .filter((id) => !rankedIds.has(id))
      .map((id) => ({
        id,
        label: id,
        description: "",
        variableNames: [],
        firstPeriod: "",
        lastPeriod: "",
        source: source.agencyName,
      }));
    // Known/learned tables go first; already-ranked ones are hoisted to front.
    const knownFirst = [
      ...allKnownTableIds
        .map((id) => ranked.find((t) => t.id === id))
        .filter((t): t is PxTableInfo => t !== undefined),
      ...knownStubs,
    ];
    const remainingRanked = ranked.filter((t) => !allKnownTableIds.includes(t.id));
    orderedTables = [...knownFirst, ...remainingRanked];
  }

  // Use Haiku to pick the best table from the top-25 ranked candidates.
  // This handles cases where deterministic ranking picks the wrong table
  // (e.g. "utdanning fylke" returns barnehage tables before education tables).
  // Skip AI selection when known tables dominate the front — they are already
  // authoritative choices from the plugin.
  const hasKnownTableFirst =
    allKnownTableIds.length > 0 &&
    orderedTables.length > 0 &&
    allKnownTableIds.includes(orderedTables[0].id);

  if (!hasKnownTableFirst) {
    const candidatesForAi = orderedTables.slice(0, 25);
    const aiPickedId = await aiSelectTable(prompt, candidatesForAi, geoLevelHint, allKnownTableIds);

    if (aiPickedId) {
      const aiTable = orderedTables.find((t) => t.id === aiPickedId);
      if (aiTable) {
        orderedTables = [aiTable, ...orderedTables.filter((t) => t.id !== aiPickedId)];
      }
    }
  }

  // ── 2. Try tables in ranked order until map_ready ─────────
  let bestTabularResult: PxWebResolutionResult | null = null;
  const attemptsLimit = Math.min(orderedTables.length, MAX_TABLE_ATTEMPTS);

  for (let i = 0; i < attemptsLimit; i++) {
    const result = await resolveOneTable(
      source,
      orderedTables[i],
      orderedTables,
      prompt,
      searchQuery,
      lang,
      cachePrefix,
      cachedKey,
      geoLevelHint,
      adapter,
    );

    if (result.status === "map_ready") {
      return result;
    }

    // Stash the first tabular_only result as fallback
    if (!bestTabularResult && result.status === "tabular_only" && result.cacheKey) {
      bestTabularResult = result;
    }
  }

  // All attempts exhausted: return best tabular result or last failure
  return bestTabularResult ?? {
    status: "unsupported",
    confidence: 0,
    reasons: [`no map-ready table found after ${attemptsLimit} attempts`],
    error: "No map-ready table",
  };
}
