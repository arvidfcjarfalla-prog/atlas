/**
 * Universal geography detection layer.
 *
 * Consumes a NormalizedSourceResult and infers what kind of geographic
 * structure the data contains — without country-specific rules.
 *
 * Detection is confidence-based and uses multiple evidence signals:
 *   1. Dimension role (adapter already classified "geo")
 *   2. Value-shape patterns (code format, cardinality, string structure)
 *   3. Country hints + geography hints from the resolver
 *   4. Profile geometry type (inline Point/Polygon vs null)
 *
 * Returns a DetectionResult with level, code family, confidence,
 * human-readable reasons, and a render hint.
 */

import type {
  NormalizedSourceResult,
  NormalizedDimension,
  GeographyLevel,
  GeographyDetectionResult,
  CodeFamily,
} from "./normalized-result";
import {
  collectDetectionEnrichment,
  applyDetectionEnrichment,
} from "./geography-plugins";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** How the detected geography might be rendered on a map. */
export type RenderHint = "polygon_join" | "point_based" | "non_geographic";

/** Full detection output — extends GeographyDetectionResult with extras. */
export interface DetectionResult extends GeographyDetectionResult {
  /** Human-readable reasons for the detection decision. */
  reasons: string[];
  /** Whether this data is joinable to polygons, point-based, or non-spatial. */
  renderHint: RenderHint;
}

// ═══════════════════════════════════════════════════════════════
// Code pattern classifiers (pure functions, no country-specific rules)
// ═══════════════════════════════════════════════════════════════

/** Regex patterns for recognizing code formats from values alone. */

/** ISO 3166-1 alpha-2: exactly 2 uppercase letters. */
const ISO_A2_RE = /^[A-Z]{2}$/;
/** ISO 3166-1 alpha-3: exactly 3 uppercase letters. */
const ISO_A3_RE = /^[A-Z]{3}$/;
/** ISO 3166-2 subdivision: 2 uppercase letters + dash + 1-3 alphanumeric (e.g. BR-SP, AU-WA, JP-13). */
const ISO_3166_2_RE = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;
/** NUTS codes: 2 uppercase letters + 1-3 digits/letters. */
const NUTS_RE = /^[A-Z]{2}[A-Z0-9]{1,3}$/;
/** Pure numeric admin codes (2-6 digits, leading zeros preserved). */
const NUMERIC_ADMIN_RE = /^0?\d{1,5}$/;
/** Postal-code-like: 3-10 alphanumeric, may contain space/dash. */
const POSTAL_RE = /^[A-Z0-9]{2,5}[\s-]?[A-Z0-9]{0,5}$/;
/** Lat/lng coordinate-like string. */
const COORD_RE = /^-?\d{1,3}\.\d+$/;

export interface CodeShapeEvidence {
  pattern: "iso_a2" | "iso_a3" | "iso_3166_2" | "nuts" | "numeric_admin" | "postal" | "coordinate" | "mixed" | "unknown";
  matchRatio: number;
  sampleSize: number;
}

/**
 * Classify the shape of codes in a set of values.
 * Samples up to 50 values for efficiency.
 */
export function classifyCodeShape(codes: string[]): CodeShapeEvidence {
  if (codes.length === 0) {
    return { pattern: "unknown", matchRatio: 0, sampleSize: 0 };
  }

  const sample = codes.length > 50 ? codes.slice(0, 50) : codes;
  const n = sample.length;

  const counts = {
    iso_a2: 0,
    iso_a3: 0,
    iso_3166_2: 0,
    nuts: 0,
    numeric_admin: 0,
    postal: 0,
    coordinate: 0,
  };

  for (const code of sample) {
    const trimmed = code.trim();
    if (ISO_A2_RE.test(trimmed)) counts.iso_a2++;
    if (ISO_A3_RE.test(trimmed)) counts.iso_a3++;
    if (ISO_3166_2_RE.test(trimmed)) counts.iso_3166_2++;
    if (NUTS_RE.test(trimmed)) counts.nuts++;
    if (NUMERIC_ADMIN_RE.test(trimmed)) counts.numeric_admin++;
    if (POSTAL_RE.test(trimmed)) counts.postal++;
    if (COORD_RE.test(trimmed)) counts.coordinate++;
  }

  // ISO-A2 and ISO-A3 overlap with NUTS (e.g. "SE" matches both A2 and NUTS).
  // Prefer the most specific match by priority.
  // If >80% match a pattern, call it that pattern.
  const threshold = 0.8;

  // Check coordinate first (very specific)
  if (counts.coordinate / n >= threshold) {
    return { pattern: "coordinate", matchRatio: counts.coordinate / n, sampleSize: n };
  }

  // ISO 3166-2: "XX-YYY" — unambiguous due to dash separator
  if (counts.iso_3166_2 / n >= threshold) {
    return { pattern: "iso_3166_2", matchRatio: counts.iso_3166_2 / n, sampleSize: n };
  }

  const avgLen = sample.reduce((s, c) => s + c.trim().length, 0) / n;

  // ISO-A2: exactly 2 uppercase letters, avg length ~2
  if (counts.iso_a2 / n >= threshold && avgLen >= 1.8 && avgLen <= 2.2) {
    return { pattern: "iso_a2", matchRatio: counts.iso_a2 / n, sampleSize: n };
  }
  // Disambiguate ISO-A3 vs NUTS: both are uppercase letter patterns.
  // ISO-A3 = 3 pure letters ("SWE", "NOR"). NUTS = 2 letters + digits ("SE11", "DE1").
  // Count how many codes contain digits to distinguish.
  const hasDigit = sample.filter((c) => /\d/.test(c)).length;
  const digitRatio = hasDigit / n;

  // ISO-A3: 3 pure letters, no digits
  if (counts.iso_a3 / n >= threshold && avgLen >= 2.8 && avgLen <= 3.2 && digitRatio < 0.2) {
    return { pattern: "iso_a3", matchRatio: counts.iso_a3 / n, sampleSize: n };
  }
  // NUTS: 2 letters + digits (e.g. "DE1", "SE11", "FR10")
  // Must have digits in the codes and match the NUTS regex
  if (counts.nuts / n >= threshold && avgLen >= 3 && digitRatio >= 0.5) {
    return { pattern: "nuts", matchRatio: counts.nuts / n, sampleSize: n };
  }
  if (counts.numeric_admin / n >= threshold) {
    return { pattern: "numeric_admin", matchRatio: counts.numeric_admin / n, sampleSize: n };
  }
  if (counts.postal / n >= threshold && avgLen > 3) {
    return { pattern: "postal", matchRatio: counts.postal / n, sampleSize: n };
  }

  // If multiple patterns match but none dominates, it's mixed
  const anyCount = Object.values(counts).reduce((a, b) => a + b, 0);
  if (anyCount > n * 0.5) {
    return { pattern: "mixed", matchRatio: anyCount / (n * 6), sampleSize: n };
  }

  return { pattern: "unknown", matchRatio: 0, sampleSize: n };
}

// ═══════════════════════════════════════════════════════════════
// Level inference from code shape + cardinality
// ═══════════════════════════════════════════════════════════════

interface LevelInference {
  level: GeographyLevel;
  confidence: number;
  reason: string;
}

/**
 * Infer geography level from code pattern + unit count.
 * Conservative: returns "unknown" with low confidence when ambiguous.
 */
export function inferLevelFromCodeShape(
  shape: CodeShapeEvidence,
  unitCount: number,
  geographyHints: GeographyLevel[],
): LevelInference {
  // If hints are present and unambiguous, trust them with moderate confidence
  const hintLevel = geographyHints.length === 1 ? geographyHints[0] : undefined;

  switch (shape.pattern) {
    case "iso_a2":
    case "iso_a3":
      return {
        level: "country",
        confidence: shape.matchRatio * 0.85,
        reason: `codes match ${shape.pattern.toUpperCase()} pattern (${Math.round(shape.matchRatio * 100)}% of ${shape.sampleSize} values)`,
      };

    case "iso_3166_2":
      return {
        level: hintLevel && hintLevel !== "unknown" ? hintLevel : "admin1",
        confidence: shape.matchRatio * 0.75,
        reason: `codes match ISO 3166-2 subdivision pattern (${Math.round(shape.matchRatio * 100)}% of ${shape.sampleSize} values)`,
      };

    case "nuts": {
      // NUTS level determined by code length: 2=NUTS0, 3=NUTS1, 4=NUTS2, 5=NUTS3
      // But we can't easily determine this from mixed lengths
      const level = hintLevel && hintLevel.startsWith("nuts") ? hintLevel : "nuts2";
      return {
        level,
        confidence: shape.matchRatio * 0.7,
        reason: `codes match NUTS pattern (${Math.round(shape.matchRatio * 100)}% of ${shape.sampleSize} values)`,
      };
    }

    case "numeric_admin": {
      // Numeric codes are highly ambiguous. Use cardinality + hints.
      if (hintLevel && hintLevel !== "unknown") {
        return {
          level: hintLevel,
          confidence: shape.matchRatio * 0.6,
          reason: `numeric codes with ${unitCount} units, hint: ${hintLevel}`,
        };
      }
      // Rough cardinality heuristics (very conservative)
      if (unitCount >= 100 && unitCount <= 500) {
        return {
          level: "municipality",
          confidence: 0.3,
          reason: `${unitCount} numeric codes — municipality-range cardinality (weak)`,
        };
      }
      if (unitCount >= 5 && unitCount <= 30) {
        return {
          level: "admin1",
          confidence: 0.3,
          reason: `${unitCount} numeric codes — admin1-range cardinality (weak)`,
        };
      }
      return {
        level: "unknown",
        confidence: 0.15,
        reason: `${unitCount} numeric codes — ambiguous cardinality`,
      };
    }

    case "postal":
      return {
        level: "postal_code",
        confidence: shape.matchRatio * 0.5,
        reason: `codes match postal pattern (${Math.round(shape.matchRatio * 100)}% of ${shape.sampleSize} values)`,
      };

    case "coordinate":
      return {
        level: "point_set",
        confidence: shape.matchRatio * 0.8,
        reason: `values appear to be coordinates`,
      };

    case "mixed":
    case "unknown":
      if (hintLevel && hintLevel !== "unknown") {
        return {
          level: hintLevel,
          confidence: 0.25,
          reason: `code pattern unrecognized, using hint: ${hintLevel}`,
        };
      }
      return {
        level: "unknown",
        confidence: 0.1,
        reason: `code pattern unrecognized, no usable hints`,
      };
  }
}

// ═══════════════════════════════════════════════════════════════
// Code family mapping
// ═══════════════════════════════════════════════════════════════

function codeFamilyFromShape(
  shape: CodeShapeEvidence,
  sourceId: string,
): CodeFamily {
  switch (shape.pattern) {
    case "iso_a2":
      return { family: "iso", namespace: "alpha2" };
    case "iso_a3":
      return { family: "iso", namespace: "alpha3" };
    case "iso_3166_2":
      return { family: "iso", namespace: "3166-2" };
    case "nuts":
      return { family: "eurostat", namespace: "nuts" };
    case "numeric_admin":
      return { family: "national", namespace: sourceId || undefined };
    case "postal":
      return { family: "custom", namespace: "postal" };
    case "coordinate":
      return { family: "custom", namespace: "coordinates" };
    case "mixed":
    case "unknown":
      return { family: "name" };
  }
}

// ═══════════════════════════════════════════════════════════════
// Render hint inference
// ═══════════════════════════════════════════════════════════════

function inferRenderHint(
  level: GeographyLevel,
  codeShape: CodeShapeEvidence,
  profileGeometryType?: string,
): RenderHint {
  // If the profile already has real geometry, respect it
  if (profileGeometryType === "Point" || profileGeometryType === "MultiPoint") {
    return "point_based";
  }
  if (
    profileGeometryType === "Polygon" ||
    profileGeometryType === "MultiPolygon"
  ) {
    return "polygon_join";
  }

  // Coordinates → point-based
  if (codeShape.pattern === "coordinate") {
    return "point_based";
  }
  // Point sets are point-based
  if (level === "point_set") {
    return "point_based";
  }

  // Area-like levels with recognized codes → polygon-joinable
  const polygonLevels: GeographyLevel[] = [
    "country", "admin1", "admin2", "municipality", "county", "region",
    "nuts0", "nuts1", "nuts2", "nuts3", "metro_area", "grid",
  ];
  if (polygonLevels.includes(level) && codeShape.pattern !== "unknown") {
    return "polygon_join";
  }

  return "non_geographic";
}

// ═══════════════════════════════════════════════════════════════
// Dimension scoring: which dimension is the geo dimension?
// ═══════════════════════════════════════════════════════════════

interface DimensionScore {
  dimension: NormalizedDimension;
  score: number;
  codeShape: CodeShapeEvidence;
  reasons: string[];
}

/**
 * Score each dimension's likelihood of being the geographic dimension.
 * Uses role, code shape, and cardinality — not just labels.
 */
function scoreDimensions(dimensions: NormalizedDimension[]): DimensionScore[] {
  return dimensions.map((dim) => {
    const codes = dim.values.map((v) => v.code);
    const codeShape = classifyCodeShape(codes);
    let score = 0;
    const reasons: string[] = [];

    // Role signal: adapter already classified this as "geo"
    if (dim.role === "geo") {
      score += 40;
      reasons.push("adapter classified as geo dimension");
    }
    // Anti-signal: known non-geo roles
    if (dim.role === "time") {
      score -= 50;
      reasons.push("classified as time dimension");
    }
    if (dim.role === "metric") {
      score -= 50;
      reasons.push("classified as metric dimension");
    }

    // Code shape signals
    if (codeShape.pattern === "iso_a2" || codeShape.pattern === "iso_a3") {
      score += 30;
      reasons.push(`code shape: ${codeShape.pattern}`);
    }
    if (codeShape.pattern === "iso_3166_2") {
      score += 28;
      reasons.push("code shape: ISO 3166-2 subdivision");
    }
    if (codeShape.pattern === "nuts") {
      score += 25;
      reasons.push("code shape: NUTS");
    }
    if (codeShape.pattern === "numeric_admin") {
      // Weaker signal — many things are numeric
      score += 10;
      reasons.push("code shape: numeric admin");
    }

    // Cardinality signal: meaningful geographic data usually has 3+ units
    const unitCount = new Set(codes).size;
    if (unitCount >= 3 && unitCount <= 500) {
      score += 5;
      reasons.push(`${unitCount} unique values (plausible geographic cardinality)`);
    }
    if (unitCount < 2) {
      score -= 20;
      reasons.push("only 1 unique value — unlikely geographic");
    }

    return { dimension: dim, score, codeShape, reasons };
  });
}

// ═══════════════════════════════════════════════════════════════
// Main detection function
// ═══════════════════════════════════════════════════════════════

/**
 * Detect geographic structure in a NormalizedSourceResult.
 *
 * Returns a DetectionResult with level, code family, confidence,
 * reasons, and render hint.
 *
 * Confidence model:
 *   0.0–0.2: no evidence or contradictory evidence
 *   0.2–0.4: weak evidence (cardinality only, or hint-only)
 *   0.4–0.6: moderate evidence (code shape matches + some hints)
 *   0.6–0.8: strong evidence (code shape + role + hints agree)
 *   0.8–1.0: very strong (multiple independent signals converge)
 */
export function detectGeography(source: NormalizedSourceResult): DetectionResult {
  const reasons: string[] = [];

  // ── No dimensions at all → non-geographic ───────────────
  if (source.dimensions.length === 0) {
    // Check if profile has inline geometry
    if (source.profile) {
      const gt = source.profile.geometryType;
      if (gt === "Point" || gt === "MultiPoint") {
        reasons.push("no dimensions but profile has point geometry");
        return {
          level: "point_set",
          codeFamily: { family: "custom", namespace: "inline" },
          unitCount: source.profile.featureCount,
          confidence: 0.6,
          reasons,
          renderHint: "point_based",
        };
      }
      if (gt === "Polygon" || gt === "MultiPolygon") {
        const level: GeographyLevel = source.geographyHints[0] ?? "unknown";
        reasons.push("no dimensions but profile has polygon geometry");
        return {
          level,
          codeFamily: { family: "custom", namespace: "inline" },
          unitCount: source.profile.featureCount,
          confidence: 0.5,
          reasons,
          renderHint: "polygon_join",
        };
      }
    }

    reasons.push("no dimensions and no geometry in profile");
    return noGeoResult(reasons, source.geographyHints);
  }

  // ── Score each dimension ────────────────────────────────
  const scored = scoreDimensions(source.dimensions);
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const best = sorted[0];

  // ── No dimension scored positively ──────────────────────
  if (best.score <= 0) {
    reasons.push("no dimension scored as geographic");
    for (const s of sorted.slice(0, 3)) {
      reasons.push(`  ${s.dimension.id}: score=${s.score} [${s.reasons.join(", ")}]`);
    }
    return noGeoResult(reasons, source.geographyHints);
  }

  // ── We have a candidate geo dimension ───────────────────
  const geoDim = best.dimension;
  const codes = geoDim.values.map((v) => v.code);
  const uniqueCodes = new Set(codes);
  const unitCount = uniqueCodes.size;

  reasons.push(`geo dimension: ${geoDim.id} (score: ${best.score})`);
  reasons.push(...best.reasons.map((r) => `  ${r}`));

  // Infer level from code shape
  const levelInference = inferLevelFromCodeShape(
    best.codeShape,
    unitCount,
    source.geographyHints,
  );
  reasons.push(levelInference.reason);

  // Build confidence from multiple signals
  let confidence = levelInference.confidence;

  // Boost: adapter role agrees
  if (geoDim.role === "geo") {
    confidence = Math.min(1.0, confidence + 0.15);
    reasons.push("role=geo boosts confidence +0.15");
  }

  // Boost: geography hints agree with inferred level
  if (
    source.geographyHints.length > 0 &&
    source.geographyHints.includes(levelInference.level)
  ) {
    confidence = Math.min(1.0, confidence + 0.1);
    reasons.push("geography hint agrees with inferred level +0.1");
  }

  // Boost: country hints present (we know what country, narrows ambiguity)
  if (source.countryHints.length > 0) {
    confidence = Math.min(1.0, confidence + 0.05);
    reasons.push(`country hints present: [${source.countryHints.join(", ")}] +0.05`);
  }

  // Penalty: very low cardinality is suspicious
  if (unitCount === 1) {
    confidence = Math.max(0, confidence - 0.45);
    reasons.push("single geographic unit — likely national aggregate -0.45");
  } else if (unitCount === 2) {
    confidence = Math.max(0, confidence - 0.2);
    reasons.push("only 2 geographic units -0.2");
  }

  const codeFamily = codeFamilyFromShape(best.codeShape, source.sourceMetadata.sourceId);
  const renderHint = inferRenderHint(
    levelInference.level,
    best.codeShape,
    source.profile?.geometryType,
  );

  return {
    level: levelInference.level,
    geoDimensionId: geoDim.id,
    codeFamily,
    unitCount,
    confidence: clamp01(confidence),
    reasons,
    renderHint,
  };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function noGeoResult(
  reasons: string[],
  geographyHints: GeographyLevel[],
): DetectionResult {
  // Even with no geo dimension, check if hints suggest something
  if (geographyHints.length > 0 && geographyHints[0] !== "unknown") {
    reasons.push(`hint suggests ${geographyHints[0]} but no supporting evidence in data`);
  }
  return {
    level: "unknown",
    codeFamily: { family: "name" },
    unitCount: 0,
    confidence: 0,
    reasons,
    renderHint: "non_geographic",
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Math.round(v * 100) / 100));
}

// ═══════════════════════════════════════════════════════════════
// Plugin-aware detection
// ═══════════════════════════════════════════════════════════════

/**
 * Detect geography with plugin enrichment.
 *
 * Runs the generic detectGeography first, then applies plugin
 * contributions. Plugins enrich the result — they never replace
 * the generic detection.
 *
 * When no plugins are registered or applicable, this returns
 * the same result as detectGeography.
 */
export function detectGeographyWithPlugins(
  source: NormalizedSourceResult,
): DetectionResult {
  const base = detectGeography(source);

  // Find the geo dimension used in detection (if any)
  const geoDim = base.geoDimensionId
    ? source.dimensions.find((d) => d.id === base.geoDimensionId)
    : undefined;

  const enrichment = collectDetectionEnrichment(source, geoDim);
  return applyDetectionEnrichment(base, enrichment, source);
}
