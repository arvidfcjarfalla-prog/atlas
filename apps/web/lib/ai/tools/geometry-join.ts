/**
 * Geometry join execution.
 *
 * Takes normalized rows, a JoinPlanResult, and a loaded GeoJSON
 * FeatureCollection, then produces joined features with metric values
 * attached and full diagnostics.
 *
 * This module does NOT load geometry from the network — it operates on
 * already-loaded FeatureCollections. Loading is the caller's responsibility.
 *
 * Execution rules:
 *   - alias_crosswalk plans are supported via plugin alias normalizers
 *   - fuzzy_name plans are rejected (too unreliable for production joins)
 *   - null geometry output never counts as map_ready
 *   - weak join coverage downgrades or blocks map_ready
 *   - provisional geometry sources are allowed but poor coverage blocks map_ready
 */

import type { NormalizedRow } from "./normalized-result";
import type { JoinPlanResult, JoinStrategy } from "./join-planner";
import type { LayerStatus } from "./geometry-registry";
import type { AliasNormalizer } from "./geography-plugins";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** Status of the executed join. */
export type JoinExecutionStatus =
  | "map_ready"       // join succeeded with sufficient coverage
  | "tabular_only"    // data exists but join failed or coverage too low
  | "unsupported";    // no viable join was possible

/** A single row of data keyed by its geographic code. */
export interface JoinableRow {
  /** The geographic code value used for joining. */
  geoCode: string;
  /** All dimension values from the original row. */
  dimensionValues: Record<string, string>;
  /** The numeric observation value. */
  value: number | null;
}

/** Conflict info when multiple rows map to the same feature. */
export interface DuplicateConflict {
  geoCode: string;
  rowCount: number;
  /** Which value was kept: "first" | "sum" | "average". */
  resolution: "first" | "sum" | "average";
}

/** Full diagnostics from a join execution. */
export interface JoinExecutionDiagnostics {
  /** Was a join attempted? */
  attempted: boolean;
  /** Number of data rows that matched a geometry feature. */
  matched: number;
  /** Number of data rows with no matching feature. */
  unmatched: number;
  /** matched / (matched + unmatched). */
  coverageRatio: number;
  /** Sample of unmatched codes (max 10). */
  unmatchedCodes: string[];
  /** Rows that mapped to the same feature. */
  duplicateConflicts: DuplicateConflict[];
  /** ID of the geometry layer used. */
  geometryLayerId?: string;
  /** Join strategy that was executed. */
  strategy: JoinStrategy;
  /** Human-readable reasons. */
  reasons: string[];
}

/** Full result of a join execution. */
export interface JoinExecutionResult {
  status: JoinExecutionStatus;
  /** Joined GeoJSON features with metric properties attached. */
  features: GeoJSON.Feature[];
  /** Execution diagnostics. */
  diagnostics: JoinExecutionDiagnostics;
  /** Adjusted confidence after execution (may be lower than plan confidence). */
  confidence: number;
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

/** Minimum coverage ratio for map_ready. */
const MIN_COVERAGE_RATIO = 0.5;

/** Coverage below this is an outright rejection. */
const CRITICAL_COVERAGE_RATIO = 0.2;

/** Confidence penalty per 10% of missing coverage below 80%. */
const COVERAGE_PENALTY_PER_10PCT = 0.05;

/** Strategies that require mechanisms we don't have yet. */
const UNSUPPORTED_STRATEGIES: JoinStrategy[] = [
  "fuzzy_name",
];

// ═══════════════════════════════════════════════════════════════
// Main execution function
// ═══════════════════════════════════════════════════════════════

/**
 * Execute a join between data rows and geometry features.
 *
 * @param plan - The JoinPlanResult from the planner
 * @param rows - Normalized data rows from the source
 * @param geometry - Already-loaded GeoJSON FeatureCollection
 * @param geometryStatus - Production readiness of the geometry layer
 * @param duplicateResolution - How to handle multiple rows per feature
 * @param aliasNormalizers - Plugin-provided code normalizers for fallback matching
 */
export function executeJoin(
  plan: JoinPlanResult,
  rows: NormalizedRow[],
  geometry: GeoJSON.FeatureCollection | null,
  geometryStatus: LayerStatus = "production",
  duplicateResolution: "first" | "sum" | "average" = "first",
  aliasNormalizers: Array<{ name: string; normalizer: AliasNormalizer }> = [],
): JoinExecutionResult {
  const reasons: string[] = [];

  // ── Guard: plan says not map-ready → tabular_only ────────
  if (!plan.mapReady) {
    reasons.push("plan indicates not map-ready");
    return noJoinResult("tabular_only", reasons, plan.strategy);
  }

  // ── Guard: inline geometry → pass through ────────────────
  if (plan.strategy === "inline_geometry") {
    reasons.push("inline geometry — no join execution needed");
    return {
      status: "map_ready",
      features: [],
      diagnostics: {
        attempted: false,
        matched: 0,
        unmatched: 0,
        coverageRatio: 1,
        unmatchedCodes: [],
        duplicateConflicts: [],
        strategy: "inline_geometry",
        reasons,
      },
      confidence: plan.confidence,
    };
  }

  // ── Guard: unsupported strategies ────────────────────────
  if (UNSUPPORTED_STRATEGIES.includes(plan.strategy)) {
    reasons.push(
      `strategy "${plan.strategy}" requires a mechanism that does not exist yet`,
    );
    return noJoinResult("tabular_only", reasons, plan.strategy);
  }

  // ── Guard: null geometry ─────────────────────────────────
  if (!geometry || geometry.features.length === 0) {
    reasons.push("geometry is null or has no features");
    return noJoinResult("tabular_only", reasons, plan.strategy);
  }

  // ── Guard: missing join fields ───────────────────────────
  if (!plan.rowJoinField || !plan.geometryJoinField) {
    reasons.push("join plan missing rowJoinField or geometryJoinField");
    return noJoinResult("tabular_only", reasons, plan.strategy);
  }

  // ── Build geometry lookup index ──────────────────────────
  const useNormalized = plan.strategy === "normalized_name" || plan.strategy === "alias_crosswalk";
  const geoIndex = buildGeoIndex(
    geometry.features,
    plan.geometryJoinField,
    useNormalized,
  );

  reasons.push(
    `geometry: ${geometry.features.length} features, ` +
    `index has ${geoIndex.size} unique keys on "${plan.geometryJoinField}"`,
  );

  // ── Extract joinable rows ────────────────────────────────
  const joinableRows = extractJoinableRows(rows, plan.rowJoinField);
  const uniqueCodes = new Set(joinableRows.map((r) => r.geoCode));

  reasons.push(
    `data: ${joinableRows.length} rows, ${uniqueCodes.size} unique geo codes`,
  );

  // ── Execute join ─────────────────────────────────────────
  const matched: GeoJSON.Feature[] = [];
  const unmatchedCodes: string[] = [];
  const duplicateConflicts: DuplicateConflict[] = [];

  // Group rows by geo code
  const rowsByCode = new Map<string, JoinableRow[]>();
  for (const row of joinableRows) {
    const key = useNormalized
      ? normalizeForJoin(row.geoCode)
      : row.geoCode;
    const existing = rowsByCode.get(key);
    if (existing) {
      existing.push(row);
    } else {
      rowsByCode.set(key, [row]);
    }
  }

  let aliasMatchCount = 0;

  for (const [code, codeRows] of rowsByCode) {
    let feature = geoIndex.get(code);

    // Fallback: try alias normalizers when direct lookup misses
    if (!feature && aliasNormalizers.length > 0) {
      for (const { normalizer } of aliasNormalizers) {
        try {
          const aliased = normalizer(code);
          if (aliased !== null && aliased !== code) {
            // Look up exact alias, or normalized alias if the index is normalized
            const lookupKey = useNormalized ? normalizeForJoin(aliased) : aliased;
            const candidate = geoIndex.get(lookupKey);
            if (candidate) {
              feature = candidate;
              aliasMatchCount++;
              break;
            }
          }
        } catch {
          // Bad normalizer — skip silently
        }
      }
    }

    if (!feature) {
      unmatchedCodes.push(codeRows[0].geoCode);
      continue;
    }

    // Handle duplicate rows
    if (codeRows.length > 1) {
      duplicateConflicts.push({
        geoCode: codeRows[0].geoCode,
        rowCount: codeRows.length,
        resolution: duplicateResolution,
      });
    }

    // Resolve the value for this feature
    const resolvedValue = resolveValue(codeRows, duplicateResolution);
    const firstRow = codeRows[0];

    // Clone the feature and attach data properties
    const dimensionValues = firstRow.dimensionValues ?? {};
    const dataFields = ["_atlas_value", ...Object.keys(dimensionValues)];
    const joinedFeature: GeoJSON.Feature = {
      type: "Feature",
      geometry: feature.geometry,
      properties: {
        ...feature.properties,
        _atlas_value: resolvedValue,
        _atlas_geo_code: firstRow.geoCode,
        _atlas_matched: true,
        _atlas_data_fields: dataFields,
        ...dimensionValues,
      },
    };

    matched.push(joinedFeature);
  }

  // ── Compute diagnostics ──────────────────────────────────
  const matchedCount = matched.length;
  const unmatchedCount = unmatchedCodes.length;
  const totalCodes = matchedCount + unmatchedCount;
  const coverageRatio = totalCodes > 0 ? matchedCount / totalCodes : 0;

  reasons.push(
    `join result: ${matchedCount} matched, ${unmatchedCount} unmatched ` +
    `(coverage: ${(coverageRatio * 100).toFixed(1)}%)`,
  );

  if (aliasMatchCount > 0) {
    reasons.push(
      `alias normalizers rescued ${aliasMatchCount} match(es)`,
    );
  }

  if (unmatchedCodes.length > 0) {
    const sample = unmatchedCodes.slice(0, 10);
    reasons.push(`unmatched sample: [${sample.join(", ")}]`);
  }

  if (duplicateConflicts.length > 0) {
    reasons.push(
      `${duplicateConflicts.length} duplicate conflict(s), resolved via "${duplicateResolution}"`,
    );
  }

  // ── Determine status and adjust confidence ───────────────
  let confidence = plan.confidence;

  // Coverage penalties
  if (coverageRatio < 0.8) {
    const deficit = Math.ceil((0.8 - coverageRatio) * 10);
    const penalty = deficit * COVERAGE_PENALTY_PER_10PCT;
    confidence = Math.max(0, confidence - penalty);
    reasons.push(
      `coverage ${(coverageRatio * 100).toFixed(0)}% < 80%: -${penalty.toFixed(2)} confidence`,
    );
  }

  // Provisional geometry penalty on low coverage
  if (geometryStatus === "provisional" && coverageRatio < 0.6) {
    confidence = Math.max(0, confidence - 0.15);
    reasons.push("provisional geometry with <60% coverage: -0.15 confidence");
  }

  // Determine final status
  let status: JoinExecutionStatus;

  if (matchedCount === 0) {
    status = "tabular_only";
    confidence = 0;
    reasons.push("zero matches — tabular only");
  } else if (coverageRatio < CRITICAL_COVERAGE_RATIO) {
    status = "tabular_only";
    reasons.push(
      `coverage ${(coverageRatio * 100).toFixed(0)}% below critical threshold ` +
      `(${CRITICAL_COVERAGE_RATIO * 100}%) — tabular only`,
    );
  } else if (coverageRatio < MIN_COVERAGE_RATIO) {
    status = "tabular_only";
    reasons.push(
      `coverage ${(coverageRatio * 100).toFixed(0)}% below minimum ` +
      `(${MIN_COVERAGE_RATIO * 100}%) — tabular only`,
    );
  } else if (confidence < 0.4) {
    status = "tabular_only";
    reasons.push(`confidence ${confidence.toFixed(2)} too low after penalties — tabular only`);
  } else {
    status = "map_ready";
    reasons.push("join successful — map ready");
  }

  return {
    status,
    features: matched,
    diagnostics: {
      attempted: true,
      matched: matchedCount,
      unmatched: unmatchedCount,
      coverageRatio,
      unmatchedCodes: unmatchedCodes.slice(0, 10),
      duplicateConflicts,
      geometryLayerId: plan.geometryLayerId,
      strategy: plan.strategy,
      reasons,
    },
    confidence: clamp01(confidence),
  };
}

// ═══════════════════════════════════════════════════════════════
// Geometry index
// ═══════════════════════════════════════════════════════════════

/**
 * Build a Map from join key value → GeoJSON feature.
 * When normalized=true, keys are lowercased and diacritics-stripped.
 */
function buildGeoIndex(
  features: GeoJSON.Feature[],
  joinProperty: string,
  normalized: boolean,
): Map<string, GeoJSON.Feature> {
  const index = new Map<string, GeoJSON.Feature>();

  for (const feature of features) {
    const raw = feature.properties?.[joinProperty];
    if (raw == null) continue;

    const key = normalized ? normalizeForJoin(String(raw)) : String(raw);
    // First feature wins — no duplicates in geometry
    if (!index.has(key)) {
      index.set(key, feature);
    }
  }

  return index;
}

// ═══════════════════════════════════════════════════════════════
// Row extraction
// ═══════════════════════════════════════════════════════════════

/**
 * Extract joinable rows from normalized data.
 * Each row gets a geoCode from the specified dimension.
 */
function extractJoinableRows(
  rows: NormalizedRow[],
  rowJoinField: string,
): JoinableRow[] {
  const result: JoinableRow[] = [];

  for (const row of rows) {
    const geoCode = row.dimensionValues[rowJoinField];
    if (geoCode == null || geoCode === "") continue;

    result.push({
      geoCode,
      dimensionValues: row.dimensionValues,
      value: row.value,
    });
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Value resolution
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve multiple rows for the same geo code into a single value.
 */
function resolveValue(
  rows: JoinableRow[],
  strategy: "first" | "sum" | "average",
): number | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0].value;

  const values = rows.map((r) => r.value).filter((v): v is number => v !== null);
  if (values.length === 0) return null;

  switch (strategy) {
    case "first":
      return values[0];
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "average":
      return values.reduce((a, b) => a + b, 0) / values.length;
  }
}

// ═══════════════════════════════════════════════════════════════
// Name normalization
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize a string for name-based joining.
 * Lowercases, strips diacritics, and trims whitespace.
 */
export function normalizeForJoin(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function noJoinResult(
  status: JoinExecutionStatus,
  reasons: string[],
  strategy: JoinStrategy,
): JoinExecutionResult {
  return {
    status,
    features: [],
    diagnostics: {
      attempted: false,
      matched: 0,
      unmatched: 0,
      coverageRatio: 0,
      unmatchedCodes: [],
      duplicateConflicts: [],
      strategy,
      reasons,
    },
    confidence: 0,
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Math.round(v * 100) / 100));
}
