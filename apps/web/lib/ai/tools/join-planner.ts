/**
 * Universal join planner.
 *
 * Given a NormalizedSourceResult, a DetectionResult from the geography
 * detector, and the geometry registry, decides whether Atlas can build
 * a trustworthy choropleth/polygon map.
 *
 * The planner does NOT load geometry or execute joins. It produces a
 * JoinPlanResult that the pipeline can act on later.
 *
 * Confidence-based: only returns mapReady when the join is genuinely
 * strong. Provisional layers, family-only matches, and fuzzy joins
 * all reduce confidence — "data found" ≠ "map-ready".
 */

import type {
  CodeFamily,
  GeographyLevel,
  NormalizedSourceResult,
} from "./normalized-result";
import type { DetectionResult, RenderHint } from "./geography-detector";
import {
  findByCountryAndLevel,
  type GeometryEntry,
  type JoinKeyConfig,
} from "./geometry-registry";
import {
  collectJoinEnrichment,
  applyJoinEnrichment,
  type JoinKeyFamily,
} from "./geography-plugins";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** How data records will be connected to geometry features. */
export type JoinStrategy =
  | "direct_code"       // exact code match (iso_a3 → iso_a3)
  | "alias_crosswalk"   // code systems differ but a known crosswalk exists
  | "normalized_name"   // case/diacritics-normalized name match
  | "fuzzy_name"        // fuzzy string matching (low confidence)
  | "inline_geometry"   // data already has geometry (GeoJSON), no join needed
  | "none";             // no viable join found

/** Full output of the join planner. */
export interface JoinPlanResult {
  /** Can we build a trustworthy map with this combination? */
  mapReady: boolean;
  /** Registry ID of the chosen geometry layer (undefined when no join). */
  geometryLayerId?: string;
  /** Dimension ID or field name in the data to join on. */
  rowJoinField?: string;
  /** Property name in the geometry features to join on. */
  geometryJoinField?: string;
  /** Which strategy was selected. */
  strategy: JoinStrategy;
  /** 0.0–1.0 overall join confidence. */
  confidence: number;
  /** Human-readable reasons for the decision. */
  reasons: string[];
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

/** Minimum confidence to declare map-ready. */
const MAP_READY_THRESHOLD = 0.5;

/** Hard cap for fuzzy-name-only joins — should stay below map-ready threshold. */
const FUZZY_NAME_CAP = 0.45;

// Score components
const EXACT_NAMESPACE_SCORE = 0.5;
const CROSSWALK_SCORE = 0.4;
const FAMILY_ONLY_SCORE = 0.2;
const NORMALIZED_NAME_SCORE = 0.3;
const FUZZY_NAME_SCORE = 0.1;
const PRODUCTION_BONUS = 0.15;
const PROVISIONAL_PENALTY = -0.1;
const DETECTION_CONFIDENCE_WEIGHT = 0.3;

// ═══════════════════════════════════════════════════════════════
// Main planner
// ═══════════════════════════════════════════════════════════════

/**
 * Plan a join between detected geographic data and available boundary layers.
 *
 * @param detection - Result from geography detector
 * @param countryHints - ISO country codes from the source
 * @param geometryLookup - Optional override for geometry lookup (for testing).
 *   Defaults to the real registry's findByCountryAndLevel.
 * @param crosswalks - Plugin-provided code family mappings (e.g. SCB→ISO).
 *   When present, enables alias_crosswalk strategy for family mismatches
 *   that a plugin can bridge.
 */
export function planJoin(
  detection: DetectionResult,
  countryHints: string[],
  geometryLookup?: (country: string, level: GeographyLevel) => GeometryEntry[],
  crosswalks?: JoinKeyFamily[],
): JoinPlanResult {
  const reasons: string[] = [];
  const lookup = geometryLookup ?? findByCountryAndLevel;

  // ── Non-geographic data → not map ready ──────────────────
  if (detection.renderHint === "non_geographic") {
    reasons.push("detection is non-geographic");
    return notReady("none", reasons);
  }

  // ── Unknown level with low confidence → not map ready ────
  if (detection.level === "unknown" && detection.confidence < 0.3) {
    reasons.push(`unknown geography level with low detection confidence (${detection.confidence})`);
    return notReady("none", reasons);
  }

  // ── Point-based with inline geometry → map ready ─────────
  if (
    detection.renderHint === "point_based" &&
    detection.codeFamily.family === "custom" &&
    detection.codeFamily.namespace === "inline"
  ) {
    reasons.push("inline point geometry — no polygon join needed");
    const conf = clamp01(0.6 + detection.confidence * DETECTION_CONFIDENCE_WEIGHT);
    return {
      mapReady: conf >= MAP_READY_THRESHOLD,
      strategy: "inline_geometry",
      confidence: conf,
      reasons,
    };
  }

  // ── Point-based with coordinate codes → map ready ────────
  if (
    detection.renderHint === "point_based" &&
    detection.codeFamily.family === "custom" &&
    detection.codeFamily.namespace === "coordinates"
  ) {
    reasons.push("coordinate-based point data — no polygon join needed");
    const conf = clamp01(0.55 + detection.confidence * DETECTION_CONFIDENCE_WEIGHT);
    return {
      mapReady: conf >= MAP_READY_THRESHOLD,
      strategy: "inline_geometry",
      confidence: conf,
      reasons,
    };
  }

  // ── Polygon join: find candidate boundary layers ─────────
  const candidates = resolveGeometryCandidates(
    detection.level,
    countryHints,
    lookup,
  );

  if (candidates.length === 0) {
    reasons.push(`no boundary layers found for level=${detection.level}, countries=[${countryHints.join(", ")}]`);
    return notReady("none", reasons);
  }

  reasons.push(`found ${candidates.length} candidate boundary layer(s)`);

  // ── Score each candidate against the detection ───────────
  const scored = candidates.map((entry) =>
    scoreEntry(entry, detection, reasons, crosswalks),
  );

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  // ── Build result from best candidate ─────────────────────
  const detectionBoost = detection.confidence * DETECTION_CONFIDENCE_WEIGHT;
  let confidence = clamp01(best.score + detectionBoost);

  // Apply fuzzy cap: fuzzy name alone can never reach map-ready
  if (best.strategy === "fuzzy_name") {
    confidence = Math.min(confidence, FUZZY_NAME_CAP);
    reasons.push(`fuzzy name join capped at ${FUZZY_NAME_CAP}`);
  }

  reasons.push(
    `best: ${best.entry.id} via ${best.strategy} ` +
    `(join score: ${r2(best.score)}, detection: ${r2(detection.confidence)}, ` +
    `combined: ${r2(confidence)})`,
  );

  for (const r of best.reasons) {
    reasons.push(`  ${r}`);
  }

  return {
    mapReady: confidence >= MAP_READY_THRESHOLD,
    geometryLayerId: best.entry.id,
    rowJoinField: detection.geoDimensionId,
    geometryJoinField: best.joinKey?.geometryProperty,
    strategy: best.strategy,
    confidence,
    reasons,
  };
}

// ═══════════════════════════════════════════════════════════════
// Geometry candidate resolution
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve candidate geometry entries for a given level and country hints.
 *
 * Queries the registry for each country hint, deduplicates, and returns
 * the combined list. Point_set levels are excluded from polygon join
 * candidates — they are handled separately above.
 */
function resolveGeometryCandidates(
  level: GeographyLevel,
  countryHints: string[],
  lookup: (country: string, level: GeographyLevel) => GeometryEntry[],
): GeometryEntry[] {
  // Point sets should not be treated as polygon boundary layers
  if (level === "point_set") return [];

  const seen = new Set<string>();
  const result: GeometryEntry[] = [];

  // If we have country hints, use them for scoped lookup
  const countries = countryHints.length > 0 ? countryHints : ["GLOBAL"];

  for (const country of countries) {
    const entries = lookup(country, level);
    for (const entry of entries) {
      // Skip point_set geometry entries — not polygon boundaries
      if (entry.level === "point_set") continue;
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        result.push(entry);
      }
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Entry scoring
// ═══════════════════════════════════════════════════════════════

interface ScoredEntry {
  entry: GeometryEntry;
  joinKey: JoinKeyConfig | undefined;
  strategy: JoinStrategy;
  score: number;
  reasons: string[];
}

/**
 * Score a single geometry entry against the detected code family.
 *
 * Evaluates each join key on the entry and picks the best one.
 * Applies status bonuses/penalties.
 */
function scoreEntry(
  entry: GeometryEntry,
  detection: DetectionResult,
  _parentReasons: string[],
  crosswalks?: JoinKeyFamily[],
): ScoredEntry {
  const reasons: string[] = [];
  let bestScore = -1;
  let bestKey: JoinKeyConfig | undefined;
  let bestStrategy: JoinStrategy = "none";

  for (const jk of entry.joinKeys) {
    const { score, strategy, reason } = scoreJoinKey(
      jk.codeFamily,
      detection.codeFamily,
      crosswalks,
    );
    if (score > bestScore) {
      bestScore = score;
      bestKey = jk;
      bestStrategy = strategy;
      reasons.length = 0;
      reasons.push(reason);
    }
  }

  // No join key matched at all
  if (bestScore <= 0) {
    reasons.push("no compatible join key found");
    return {
      entry,
      joinKey: undefined,
      strategy: "none",
      score: 0,
      reasons,
    };
  }

  // Status adjustment
  if (entry.status === "production") {
    bestScore += PRODUCTION_BONUS;
    reasons.push(`production status +${PRODUCTION_BONUS}`);
  } else if (entry.status === "provisional") {
    bestScore += PROVISIONAL_PENALTY;
    reasons.push(`provisional status ${PROVISIONAL_PENALTY}`);
  }

  return {
    entry,
    joinKey: bestKey,
    strategy: bestStrategy,
    score: Math.max(0, bestScore),
    reasons,
  };
}

/**
 * Score a single join key match between detection code family and entry code family.
 * When crosswalks are provided, a family mismatch can still score if a plugin
 * declares a known mapping between the two code families.
 */
function scoreJoinKey(
  entryFamily: CodeFamily,
  detectionFamily: CodeFamily,
  crosswalks?: JoinKeyFamily[],
): { score: number; strategy: JoinStrategy; reason: string } {
  // Name ↔ name is always a normalized name match, not a code match.
  // The "name" family means string matching, not code-system compatibility.
  if (entryFamily.family === "name" && detectionFamily.family === "name") {
    return {
      score: NORMALIZED_NAME_SCORE,
      strategy: "normalized_name",
      reason: `name ↔ name: normalized name join (+${NORMALIZED_NAME_SCORE})`,
    };
  }

  // Different family → check for name-based fallbacks, then crosswalks
  if (entryFamily.family !== detectionFamily.family) {
    // Name family on the entry side is a generic fallback
    if (entryFamily.family === "name") {
      // If detection also has name codes, it's a normalized name match
      if (detectionFamily.family === "name") {
        return {
          score: NORMALIZED_NAME_SCORE,
          strategy: "normalized_name",
          reason: `name ↔ name: normalized name join (+${NORMALIZED_NAME_SCORE})`,
        };
      }
      // Otherwise it's a fuzzy fallback
      return {
        score: FUZZY_NAME_SCORE,
        strategy: "fuzzy_name",
        reason: `${detectionFamily.family} ↔ name: fuzzy name fallback (+${FUZZY_NAME_SCORE})`,
      };
    }
    // Check plugin crosswalks before giving up on family mismatch
    if (crosswalks) {
      for (const cw of crosswalks) {
        const srcMatch =
          cw.sourceFamily.family === detectionFamily.family &&
          (!cw.sourceFamily.namespace || !detectionFamily.namespace ||
            cw.sourceFamily.namespace === detectionFamily.namespace);
        const tgtMatch =
          cw.targetFamily.family === entryFamily.family &&
          (!cw.targetFamily.namespace || !entryFamily.namespace ||
            cw.targetFamily.namespace === entryFamily.namespace);
        if (srcMatch && tgtMatch) {
          return {
            score: CROSSWALK_SCORE,
            strategy: "alias_crosswalk",
            reason: `crosswalk: ${cw.description} (+${CROSSWALK_SCORE})`,
          };
        }
      }
    }
    // Incompatible families, no match
    return { score: 0, strategy: "none", reason: "family mismatch" };
  }

  // Same family — check namespace
  const entryNs = entryFamily.namespace;
  const detNs = detectionFamily.namespace;

  // Both have namespaces and they match → exact
  if (entryNs && detNs && entryNs === detNs) {
    return {
      score: EXACT_NAMESPACE_SCORE,
      strategy: "direct_code",
      reason: `${entryFamily.family}/${entryNs} exact match (+${EXACT_NAMESPACE_SCORE})`,
    };
  }

  // Same family, no namespace on entry (wildcard) → family-only
  if (!entryNs) {
    return {
      score: FAMILY_ONLY_SCORE,
      strategy: "direct_code",
      reason: `${entryFamily.family} family match, entry has no namespace (+${FAMILY_ONLY_SCORE})`,
    };
  }

  // Same family, no namespace on detection (detection is generic) → family-only
  if (!detNs) {
    return {
      score: FAMILY_ONLY_SCORE,
      strategy: "direct_code",
      reason: `${entryFamily.family} family match, detection has no namespace (+${FAMILY_ONLY_SCORE})`,
    };
  }

  // Same family, different namespaces → alias/crosswalk potential
  // This is weaker than exact but stronger than fuzzy name
  return {
    score: FAMILY_ONLY_SCORE,
    strategy: "alias_crosswalk",
    reason: `${entryFamily.family}/${entryNs} ↔ ${detectionFamily.family}/${detNs}: namespace mismatch, crosswalk needed (+${FAMILY_ONLY_SCORE})`,
  };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function notReady(strategy: JoinStrategy, reasons: string[]): JoinPlanResult {
  return {
    mapReady: false,
    strategy,
    confidence: 0,
    reasons,
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Math.round(v * 100) / 100));
}

function r2(v: number): string {
  return (Math.round(v * 100) / 100).toFixed(2);
}

// ═══════════════════════════════════════════════════════════════
// Plugin-aware join planning
// ═══════════════════════════════════════════════════════════════

/**
 * Plan a join with plugin enrichment.
 *
 * Runs the generic planJoin first, then applies plugin contributions.
 * Plugins can boost/penalize confidence and contribute join-key families,
 * but they never bypass the planner or force mapReady.
 *
 * When no plugins are registered or applicable, this returns
 * the same result as planJoin.
 */
export function planJoinWithPlugins(
  detection: DetectionResult,
  countryHints: string[],
  source: NormalizedSourceResult,
  geometryLookup?: (country: string, level: GeographyLevel) => GeometryEntry[],
): JoinPlanResult {
  // Collect enrichment FIRST so crosswalks are available for scoring
  const enrichment = collectJoinEnrichment(source);
  const base = planJoin(detection, countryHints, geometryLookup, enrichment.joinKeyFamilies);

  return applyJoinEnrichment(
    base,
    enrichment,
    source,
    detection.level,
    detection.codeFamily,
  );
}
