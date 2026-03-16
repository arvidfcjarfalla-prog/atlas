/**
 * Cartographic quality scorer: assigns a structural quality score (0–100)
 * to a MapManifest based on objective, explainable criteria.
 *
 * No aesthetic judgment — only structural and cartographic correctness.
 */

import type { MapManifest, MapFamily, ColorScheme } from "@atlas/data-models";
import type { DatasetProfile } from "./types";

export interface QualityScore {
  /** Overall score 0–100. */
  total: number;
  breakdown: {
    schemaCompleteness: number;    // 0–20
    familyAppropriateness: number; // 0–25
    colorSchemeQuality: number;    // 0–20
    classificationQuality: number; // 0–15
    normalization: number;         // 0–10
    legendCompleteness: number;    // 0–10
  };
  /** Human-readable reasons for lost points. */
  deductions: string[];
}

const SEQUENTIAL_SCHEMES = new Set<ColorScheme>([
  "blues", "greens", "reds", "oranges", "purples", "greys",
  "viridis", "magma", "plasma", "inferno", "cividis",
]);

const DIVERGING_SCHEMES = new Set<ColorScheme>([
  "blue-red", "blue-yellow-red", "spectral",
]);

const CATEGORICAL_SCHEMES = new Set<ColorScheme>([
  "set1", "set2", "paired",
]);

/**
 * Detect categorical choropleths — editorial/ranking maps where regions are
 * assigned to named categories rather than numeric ranges. These should use
 * categorical color schemes and do NOT need normalization.
 */
function isCategoricalChoropleth(manifest: MapManifest): boolean {
  const layer = manifest.layers?.[0];
  if (layer?.style?.mapFamily !== "choropleth") return false;
  // Explicit categorical legend
  if (layer.legend?.type === "categorical") return true;
  // Manual classification with a categorical scheme
  const scheme = layer.style?.color?.scheme;
  if (
    layer.style?.classification?.method === "manual" &&
    scheme &&
    CATEGORICAL_SCHEMES.has(scheme)
  ) {
    return true;
  }
  return false;
}

/** Families that work with point geometry. */
const POINT_FAMILIES = new Set<MapFamily>([
  "point", "cluster", "heatmap", "proportional-symbol",
]);

/** Families that work with polygon geometry. */
const POLYGON_FAMILIES = new Set<MapFamily>([
  "choropleth", "isochrone",
]);

/**
 * Score a manifest on structural/cartographic quality.
 *
 * @param manifest — the MapManifest to score
 * @param profile — optional dataset profile for geometry-aware scoring
 */
export function scoreManifest(
  manifest: MapManifest,
  profile?: DatasetProfile,
): QualityScore {
  const deductions: string[] = [];
  const layer = manifest.layers?.[0];
  const family = layer?.style?.mapFamily;

  // ── Schema completeness (0–20) ──
  let schemaCompleteness = 0;

  // Required fields present (+10)
  if (manifest.id && manifest.title && manifest.layers?.length > 0 && layer?.id && layer?.style) {
    schemaCompleteness += 10;
  } else {
    deductions.push("Missing required manifest fields (id, title, layers, layer.id, layer.style)");
  }

  // Useful optional fields filled (+10)
  let optionalCount = 0;
  if (manifest.description) optionalCount++;
  if (manifest.defaultCenter) optionalCount++;
  if (manifest.defaultZoom !== undefined) optionalCount++;
  if (manifest.defaultBounds) optionalCount++;
  if (layer?.legend) optionalCount++;
  if (layer?.interaction) optionalCount++;
  // 6 possible optional fields → scale to 10 points
  schemaCompleteness += Math.round((optionalCount / 6) * 10);
  if (optionalCount < 3) {
    deductions.push(`Only ${optionalCount}/6 optional fields filled (description, center, zoom, bounds, legend, interaction)`);
  }

  // ── Family appropriateness (0–25) ──
  let familyAppropriateness = 25; // full score unless profile says otherwise

  if (profile && family) {
    const geoType = profile.geometryType;
    const isPointGeo = geoType === "Point" || geoType === "MultiPoint";
    const isPolygonGeo = geoType === "Polygon" || geoType === "MultiPolygon";
    const isLineGeo = geoType === "LineString" || geoType === "MultiLineString";

    if (isPointGeo && !POINT_FAMILIES.has(family)) {
      familyAppropriateness = 0;
      deductions.push(`Family "${family}" is not appropriate for ${geoType} geometry`);
    } else if (isPolygonGeo && !POLYGON_FAMILIES.has(family) && family !== "point") {
      // point on polygon is unusual but not wrong
      familyAppropriateness = 10;
      deductions.push(`Family "${family}" is unusual for ${geoType} geometry`);
    } else if (isLineGeo && family !== "flow") {
      familyAppropriateness = 10;
      deductions.push(`Family "${family}" is unusual for ${geoType} geometry — consider flow`);
    }
  } else if (!profile) {
    // Without profile, we can't score family appropriateness — give benefit of the doubt
    familyAppropriateness = 15;
  }

  // ── Color scheme quality (0–20) ──
  let colorSchemeQuality = 0;
  const colorConfig = layer?.style?.color;

  // Colorblind-safe (+10)
  if (colorConfig?.colorblindSafe !== false) {
    colorSchemeQuality += 10;
  } else {
    deductions.push("Colorblind safety is disabled");
  }

  // Scheme type matches data usage (+10)
  const scheme = colorConfig?.scheme;
  const categorical = isCategoricalChoropleth(manifest);
  if (scheme) {
    if (categorical) {
      // Categorical choropleth → categorical scheme preferred
      if (CATEGORICAL_SCHEMES.has(scheme)) {
        colorSchemeQuality += 10;
      } else {
        colorSchemeQuality += 5;
        deductions.push(`Sequential/diverging scheme "${scheme}" used for categorical choropleth`);
      }
    } else if (family === "choropleth" || family === "heatmap" || family === "isochrone") {
      // Sequential data → sequential or diverging scheme
      if (SEQUENTIAL_SCHEMES.has(scheme) || DIVERGING_SCHEMES.has(scheme)) {
        colorSchemeQuality += 10;
      } else {
        deductions.push(`Categorical scheme "${scheme}" used for sequential data (${family})`);
      }
    } else if (layer?.style?.colorField && !layer?.style?.classification) {
      // Categorical data → categorical scheme preferred
      if (CATEGORICAL_SCHEMES.has(scheme)) {
        colorSchemeQuality += 10;
      } else {
        colorSchemeQuality += 5;
        deductions.push(`Sequential/diverging scheme "${scheme}" used for categorical data`);
      }
    } else {
      // No strong opinion → full score
      colorSchemeQuality += 10;
    }
  } else {
    // No scheme specified → half credit
    colorSchemeQuality += 5;
  }

  // ── Classification quality (0–15) ──
  let classificationQuality = 0;
  const classification = layer?.style?.classification;

  if (family === "choropleth" || family === "proportional-symbol") {
    if (classification) {
      // Method specified (+10)
      classificationQuality += 10;
      // Class count 3–7 (+5)
      if (classification.classes >= 3 && classification.classes <= 7) {
        classificationQuality += 5;
      } else {
        deductions.push(`Classification has ${classification.classes} classes — 3–7 is recommended`);
      }
    } else {
      deductions.push("No classification specified for quantitative family");
    }
  } else {
    // Non-quantitative families get full score
    classificationQuality = 15;
  }

  // ── Normalization (0–10) ──
  let normalization = 10; // full by default

  if (family === "choropleth" && !categorical) {
    if (!layer?.style?.normalization) {
      // Skip penalty if the colorField name suggests the data is already
      // a rate, index, percentage, or per-capita value (not a raw count).
      const cf = (layer?.style?.colorField ?? "").toLowerCase();
      const isAlreadyNormalized = /rate|pct|percent|index|wage|salary|expectancy|coefficient|median|average|per_capita|per_hab|gini|hdi|fertility|literacy/.test(cf);
      if (!isAlreadyNormalized) {
        normalization = 0;
        deductions.push("Choropleth without normalization — raw counts may be misleading");
      }
    }
  }

  // ── Legend completeness (0–10) ──
  let legendCompleteness = 0;
  const legend = layer?.legend;

  if (legend?.title) {
    legendCompleteness += 5;
  } else {
    deductions.push("Legend is missing a title");
  }

  if (legend?.type) {
    legendCompleteness += 5;
  } else {
    deductions.push("Legend is missing a type");
  }

  const total =
    schemaCompleteness +
    familyAppropriateness +
    colorSchemeQuality +
    classificationQuality +
    normalization +
    legendCompleteness;

  return {
    total,
    breakdown: {
      schemaCompleteness,
      familyAppropriateness,
      colorSchemeQuality,
      classificationQuality,
      normalization,
      legendCompleteness,
    },
    deductions,
  };
}
