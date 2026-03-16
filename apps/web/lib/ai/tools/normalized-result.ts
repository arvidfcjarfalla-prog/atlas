/**
 * Country-agnostic map resolution model.
 *
 * Two layers:
 *   Layer 1: NormalizedSourceResult — what adapters produce (raw data + hints)
 *   Layer 2: FinalMapResolutionResult — what the pipeline produces after
 *            geography detection, geometry join, and classification
 *
 * Designed for incremental adoption: existing adapters continue returning
 * DataSearchResult. The bridge function converts legacy results into
 * NormalizedSourceResult with low confidence.
 */

import type { DatasetProfile } from "../types";
import type { DataSearchResult } from "./data-search";

// ═══════════════════════════════════════════════════════════════
// Shared types
// ═══════════════════════════════════════════════════════════════

// ─── Geography Level ────────────────────────────────────────

/**
 * Canonical geography levels the pipeline can reason about.
 *
 * Universal tiers (admin1, admin2) are country-agnostic abstractions.
 * Country-specific names (voivodeship, prefecture, powiat) are mapped
 * via toCanonicalLevel() — ambiguous ones map to "unknown".
 */
export type GeographyLevel =
  // Supra-national
  | "global"
  | "regional" // multi-country region (Nordic, EU, Latin America)
  // National
  | "country"
  // Sub-national universal tiers
  | "admin1" // first-level: state, province
  | "admin2" // second-level: district
  // Common named levels
  | "municipality"
  | "county"
  | "region"
  // EU NUTS
  | "nuts0"
  | "nuts1"
  | "nuts2"
  | "nuts3"
  // Other
  | "postal_code"
  | "metro_area"
  | "grid" // statistical grid cells
  // Geometry-centric
  | "point_set" // POIs, events, arbitrary points
  | "custom_polygon" // user-uploaded or non-standard
  // Catch-all
  | "unknown";

// ─── Code System ────────────────────────────────────────────

/**
 * Extensible code system identifier.
 *
 * family: broad category of codes
 * namespace: specific system within that family
 *
 * Examples:
 *   { family: "iso", namespace: "alpha3" }       → ISO 3166-1 alpha-3
 *   { family: "iso", namespace: "alpha2" }       → ISO 3166-1 alpha-2
 *   { family: "national", namespace: "se-scb" }  → SCB region codes
 *   { family: "national", namespace: "no-ssb" }  → SSB kommune/fylke codes
 *   { family: "eurostat", namespace: "nuts" }     → NUTS codes
 *   { family: "fips" }                            → US FIPS codes
 *   { family: "name" }                            → fuzzy name matching
 */
export interface CodeFamily {
  family: "iso" | "national" | "eurostat" | "fips" | "name" | "custom";
  namespace?: string;
}

// ═══════════════════════════════════════════════════════════════
// Layer 1: Adapter output
// ═══════════════════════════════════════════════════════════════

// ─── Dimensions & Rows ──────────────────────────────────────

/** A dimension in the source data. */
export interface NormalizedDimension {
  id: string;
  label: string;
  role: "geo" | "time" | "metric" | "filter";
  values: { code: string; label: string }[];
}

/** A flat data row from the source. */
export interface NormalizedRow {
  /** Dimension code → selected value. e.g. { Region: "0180", Tid: "2023" } */
  dimensionValues: Record<string, string>;
  /** The numeric observation value (null = missing). */
  value: number | null;
}

// ─── Source Metadata ────────────────────────────────────────

/** Opaque metadata from the source adapter. */
export interface SourceMetadata {
  sourceId: string;
  sourceName: string;
  tableId?: string;
  tableLabel?: string;
  apiType?: string;
  fetchedAt: number;
  language?: string;
}

// ─── Query Diagnostics ──────────────────────────────────────

/** Diagnostic info about the adapter's query process. */
export interface QueryDiagnostics {
  originalPrompt: string;
  searchQuery?: string;
  tablesFound?: number;
  tableSelected?: string;
  dimensionSelections?: Record<string, string[]>;
  cellCount?: number;
  warnings?: string[];
}

// ─── Adapter Result Status ──────────────────────────────────

/**
 * Status of the adapter's fetch attempt.
 * This is NOT the final pipeline status — only what the adapter produced.
 */
export type AdapterResultStatus =
  | "ok" // data fetched successfully
  | "no_data" // query ran, no results
  | "no_geo_dimension" // data exists but lacks geographic dimension
  | "error"; // fetch failed

// ─── Dataset Candidate ──────────────────────────────────────

/** An alternative dataset the user could choose. */
export interface DatasetCandidate {
  id: string;
  label: string;
  description?: string;
  source: string;
  geographyLevel?: GeographyLevel;
  timeCoverage?: string;
}

// ─── Normalized Source Result ────────────────────────────────

/**
 * What every source adapter returns.
 *
 * Contains actual data (rows + dimensions), not just metadata.
 * The pipeline uses this to run geography detection, join,
 * and classification as separate steps.
 */
export interface NormalizedSourceResult {
  adapterStatus: AdapterResultStatus;

  /** Dimensions present in the result. */
  dimensions: NormalizedDimension[];
  /** Flat data rows. Empty when adapterStatus !== "ok". */
  rows: NormalizedRow[];

  /** Which dimension(s) likely hold the metric/measure values. */
  candidateMetricFields: string[];
  /** ISO country codes inferred from prompt or source config. */
  countryHints: string[];
  /** Geography level hints from the source registry or adapter logic. */
  geographyHints: GeographyLevel[];

  sourceMetadata: SourceMetadata;
  diagnostics: QueryDiagnostics;

  /** 0.0–1.0. How confident the adapter is that this is the right data. */
  confidence: number;

  /** Cache key if data was cached as GeoJSON. */
  cacheKey?: string;
  /** Profile if data was already profiled. */
  profile?: DatasetProfile;

  /** Alternative datasets found but not fetched. */
  candidates?: DatasetCandidate[];

  error?: string;
}

// ═══════════════════════════════════════════════════════════════
// Layer 2: Pipeline output
// ═══════════════════════════════════════════════════════════════

// ─── Result Status ──────────────────────────────────────────

/**
 * Final pipeline status after geography detection + join + classification.
 * Only the pipeline sets this — never an adapter.
 */
export type ResultStatus =
  | "map_ready" // data + geometry joined, can render
  | "tabular_only" // data ok, no geometry available or joinable
  | "candidate_mode" // multiple datasets, user must pick
  | "unsupported"; // no viable data

// ─── Geography Detection ────────────────────────────────────

/** Result of analyzing the source data for geographic structure. */
export interface GeographyDetectionResult {
  level: GeographyLevel;
  /** The dimension ID that holds geographic codes. */
  geoDimensionId?: string;
  codeFamily: CodeFamily;
  /** Number of unique geographic units in the data. */
  unitCount: number;
  confidence: number;
}

// ─── Join ───────────────────────────────────────────────────

/** How to connect data records to geometry features. */
export interface JoinPlan {
  dataField: string;
  geometryField: string;
  codeFamily: CodeFamily;
}

/** What happened when the join was attempted. */
export interface JoinDiagnostics {
  attempted: boolean;
  matched: number;
  unmatched: number;
  /** Sample of unmatched codes (max 10). */
  unmatchedCodes?: string[];
  geometrySource?: string;
}

// ─── Geometry Layer ─────────────────────────────────────────

export type GeometrySourceType = "inline" | "reference" | "none";

/** Describes where geometry comes from for this dataset. */
export interface GeometryLayer {
  sourceType: GeometrySourceType;
  /** Identifier for reference geometry. e.g. "natural-earth:ne_110m_admin_0_countries" */
  referenceId?: string;
  level?: GeographyLevel;
}

// ─── Final Map Resolution Result ────────────────────────────

/**
 * What the pipeline produces after geography detection, join,
 * and classification. This is the final answer: can we render a map?
 */
export interface FinalMapResolutionResult {
  status: ResultStatus;

  cacheKey?: string;
  profile?: DatasetProfile;

  geographyDetection?: GeographyDetectionResult;
  geometry?: GeometryLayer;
  joinPlan?: JoinPlan;
  joinDiagnostics?: JoinDiagnostics;

  source: string;
  description?: string;

  /** Present when status is "candidate_mode". */
  candidates?: DatasetCandidate[];

  error?: string;
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Map a source-specific geography string to a canonical GeographyLevel.
 *
 * Conservative: only maps unambiguous strings. Country-specific
 * or ambiguous values return "unknown". Source-specific plugins
 * can provide richer mappings later.
 */
export function toCanonicalLevel(raw: string): GeographyLevel {
  const lower = raw.toLowerCase().trim();
  const map: Record<string, GeographyLevel> = {
    // Unambiguous mappings
    global: "global",
    country: "country",
    state: "admin1",
    province: "admin1",
    district: "admin2",
    municipality: "municipality",
    commune: "municipality",
    gmina: "municipality",
    county: "county",
    region: "region",
    regional: "regional",
    grid: "grid",
    postal_code: "postal_code",
    metro_area: "metro_area",
    point_set: "point_set",
    custom_polygon: "custom_polygon",
    // NUTS
    nuts0: "nuts0",
    nuts1: "nuts1",
    nuts2: "nuts2",
    nuts3: "nuts3",
    // Admin tier aliases (unambiguous)
    admin1: "admin1",
    admin2: "admin2",
  };
  return map[lower] ?? "unknown";
}

// ─── Bridge from DataSearchResult ───────────────────────────

interface BridgeOverrides {
  geographyHints?: GeographyLevel[];
  countryHints?: string[];
  confidence?: number;
  sourceId?: string;
  apiType?: string;
}

/**
 * Convert a legacy DataSearchResult to NormalizedSourceResult.
 *
 * Low confidence by default (0.3) because the legacy result lacks
 * dimensions, rows, and geography detection. The bridge preserves
 * uncertainty rather than overstating success.
 *
 * Does NOT set map_ready — that's a Layer 2 concern.
 */
export function fromDataSearchResult(
  result: DataSearchResult,
  prompt: string,
  overrides?: BridgeOverrides,
): NormalizedSourceResult {
  const now = Date.now();

  if (!result.found) {
    return {
      adapterStatus: result.error ? "error" : "no_data",
      dimensions: [],
      rows: [],
      candidateMetricFields: [],
      countryHints: overrides?.countryHints ?? [],
      geographyHints: overrides?.geographyHints ?? [],
      sourceMetadata: {
        sourceId: overrides?.sourceId ?? "unknown",
        sourceName: result.source ?? "unknown",
        apiType: overrides?.apiType,
        fetchedAt: now,
      },
      diagnostics: { originalPrompt: prompt },
      confidence: 0,
      error: result.error,
    };
  }

  return {
    adapterStatus: "ok",
    dimensions: [],
    rows: [],
    candidateMetricFields: result.attributes ?? [],
    countryHints: overrides?.countryHints ?? [],
    geographyHints: overrides?.geographyHints ?? [],
    sourceMetadata: {
      sourceId: overrides?.sourceId ?? "unknown",
      sourceName: result.source ?? "unknown",
      apiType: overrides?.apiType,
      fetchedAt: now,
    },
    diagnostics: { originalPrompt: prompt },
    confidence: overrides?.confidence ?? 0.3,
    cacheKey: result.cacheKey,
    profile: result.profile,
  };
}

// ─── Convenience constructors ───────────────────────────────

/** Create a successful adapter result with data. */
export function sourceOk(opts: {
  dimensions: NormalizedDimension[];
  rows: NormalizedRow[];
  candidateMetricFields: string[];
  countryHints: string[];
  geographyHints: GeographyLevel[];
  sourceMetadata: SourceMetadata;
  diagnostics: QueryDiagnostics;
  confidence: number;
  cacheKey?: string;
  profile?: DatasetProfile;
  candidates?: DatasetCandidate[];
}): NormalizedSourceResult {
  return {
    adapterStatus: "ok",
    ...opts,
  };
}

/** Create a no-data adapter result. */
export function sourceNoData(opts: {
  sourceMetadata: SourceMetadata;
  diagnostics: QueryDiagnostics;
  error?: string;
}): NormalizedSourceResult {
  return {
    adapterStatus: "no_data",
    dimensions: [],
    rows: [],
    candidateMetricFields: [],
    countryHints: [],
    geographyHints: [],
    confidence: 0,
    ...opts,
  };
}

/** Create an error adapter result. */
export function sourceError(opts: {
  sourceMetadata: SourceMetadata;
  diagnostics: QueryDiagnostics;
  error: string;
}): NormalizedSourceResult {
  return {
    adapterStatus: "error",
    dimensions: [],
    rows: [],
    candidateMetricFields: [],
    countryHints: [],
    geographyHints: [],
    confidence: 0,
    ...opts,
  };
}

/** Create an adapter result with multiple candidates for disambiguation. */
export function sourceCandidates(opts: {
  candidates: DatasetCandidate[];
  sourceMetadata: SourceMetadata;
  diagnostics: QueryDiagnostics;
  countryHints?: string[];
  geographyHints?: GeographyLevel[];
}): NormalizedSourceResult {
  return {
    adapterStatus: "ok",
    dimensions: [],
    rows: [],
    candidateMetricFields: [],
    countryHints: opts.countryHints ?? [],
    geographyHints: opts.geographyHints ?? [],
    confidence: 0.2,
    sourceMetadata: opts.sourceMetadata,
    diagnostics: opts.diagnostics,
    candidates: opts.candidates,
  };
}

// ═══════════════════════════════════════════════════════════════
// Runtime enum arrays
// ═══════════════════════════════════════════════════════════════

/** All valid GeographyLevel values. Useful for validation and iteration. */
export const GEOGRAPHY_LEVELS: readonly GeographyLevel[] = [
  "global",
  "regional",
  "country",
  "admin1",
  "admin2",
  "municipality",
  "county",
  "region",
  "nuts0",
  "nuts1",
  "nuts2",
  "nuts3",
  "postal_code",
  "metro_area",
  "grid",
  "point_set",
  "custom_polygon",
  "unknown",
] as const;

/** All valid ResultStatus values (layer 2 only). */
export const RESULT_STATUSES: readonly ResultStatus[] = [
  "map_ready",
  "tabular_only",
  "candidate_mode",
  "unsupported",
] as const;

/** All valid AdapterResultStatus values (layer 1 only). */
export const ADAPTER_STATUSES: readonly AdapterResultStatus[] = [
  "ok",
  "no_data",
  "no_geo_dimension",
  "error",
] as const;

// ═══════════════════════════════════════════════════════════════
// Type guards
// ═══════════════════════════════════════════════════════════════

const geoLevelSet = new Set<string>(GEOGRAPHY_LEVELS);

/** Check if a string is a valid GeographyLevel. */
export function isValidGeographyLevel(v: string): v is GeographyLevel {
  return geoLevelSet.has(v);
}

/** True when the adapter successfully fetched data. */
export function isAdapterOk(r: NormalizedSourceResult): boolean {
  return r.adapterStatus === "ok";
}

/** True when the adapter found data but it has no geographic dimension. */
export function isAdapterNoGeo(r: NormalizedSourceResult): boolean {
  return r.adapterStatus === "no_geo_dimension";
}

/** True when the source result contains at least one geo-role dimension. */
export function hasGeoDimension(r: NormalizedSourceResult): boolean {
  return r.dimensions.some((d) => d.role === "geo");
}

/** True when the final result is ready for map rendering. */
export function isMapReady(r: FinalMapResolutionResult): boolean {
  return r.status === "map_ready";
}

/** True when data exists but geometry is missing or unjoinable. */
export function isTabularOnly(r: FinalMapResolutionResult): boolean {
  return r.status === "tabular_only";
}

/** True when multiple datasets need user disambiguation. */
export function isCandidateMode(r: FinalMapResolutionResult): boolean {
  return r.status === "candidate_mode";
}

/** True when no viable data was found. */
export function isUnsupported(r: FinalMapResolutionResult): boolean {
  return r.status === "unsupported";
}
