import type { MapManifest, ManifestValidation, ColorScheme } from "@atlas/data-models";
import type { DatasetProfile, AttributeProfile } from "../types";

const CATEGORICAL_SCHEMES = new Set<ColorScheme>(["set1", "set2", "paired"]);

/**
 * Detect categorical choropleths — editorial/ranking maps where regions are
 * assigned to named categories rather than numeric ranges.
 */
function isCategoricalChoropleth(layer: MapManifest["layers"][number]): boolean {
  if (layer.style?.mapFamily !== "choropleth") return false;
  if (layer.legend?.type === "categorical") return true;
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

/** Cartographic rule validation — domain-specific map quality checks. */
export function validateCartographic(
  manifest: MapManifest,
  profile?: DatasetProfile | null,
): ManifestValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Build attribute lookup from profile
  const attrMap = new Map<string, AttributeProfile>();
  if (profile) {
    for (const attr of profile.attributes) {
      attrMap.set(attr.name, attr);
    }
  }

  for (const layer of manifest.layers) {
    const family = layer.style?.mapFamily;
    const id = layer.id;

    // Choropleth requires polygon geometry
    if (
      family === "choropleth" &&
      layer.geometryType &&
      layer.geometryType !== "polygon" &&
      layer.geometryType !== "multi-polygon"
    ) {
      errors.push(
        `Layer "${id}": choropleth requires polygon geometry, got "${layer.geometryType}"`,
      );
    }

    // Choropleth without normalization → warning (skip for categorical/editorial choropleths)
    if (family === "choropleth" && !layer.style?.normalization && !isCategoricalChoropleth(layer)) {
      warnings.push(
        `Layer "${id}": choropleth without normalization — raw counts may be misleading`,
      );
    }

    // Proportional symbol requires sizeField
    if (family === "proportional-symbol" && !layer.style?.sizeField) {
      errors.push(
        `Layer "${id}": proportional-symbol requires sizeField`,
      );
    }

    // Heatmap should have maxZoom ≤ 12
    if (family === "heatmap" && layer.style?.maxZoom && layer.style.maxZoom > 12) {
      warnings.push(
        `Layer "${id}": heatmap maxZoom > 12 may produce noisy results`,
      );
    }

    // Large point datasets without clustering
    if (
      family === "point" &&
      !layer.style?.clusterEnabled &&
      layer.performance?.featureThreshold &&
      layer.performance.featureThreshold > 500
    ) {
      warnings.push(
        `Layer "${id}": > 500 features without clustering — consider enabling clusters or using heatmap`,
      );
    }

    // Colorblind safety disabled
    if (layer.style?.color?.colorblindSafe === false) {
      warnings.push(
        `Layer "${id}": colorblindSafe is disabled — map may be inaccessible`,
      );
    }

    // Sequential data with diverging scheme (or vice versa)
    const scheme = layer.style?.color?.scheme;
    const divergingSchemes = ["blue-red", "blue-yellow-red", "spectral"];
    if (
      family === "choropleth" &&
      scheme &&
      divergingSchemes.includes(scheme) &&
      !layer.style?.normalization
    ) {
      warnings.push(
        `Layer "${id}": diverging color scheme without clear midpoint — consider a sequential scheme`,
      );
    }

    // Flow requires line geometry
    if (
      family === "flow" &&
      layer.geometryType &&
      layer.geometryType !== "line"
    ) {
      errors.push(
        `Layer "${id}": flow requires line geometry, got "${layer.geometryType}"`,
      );
    }

    // Flow without weightField → warning
    if (family === "flow" && !layer.flow?.weightField) {
      warnings.push(
        `Layer "${id}": flow without weightField — all lines will have equal width`,
      );
    }

    // Isochrone requires polygon geometry
    if (
      family === "isochrone" &&
      layer.geometryType &&
      layer.geometryType !== "polygon" &&
      layer.geometryType !== "multi-polygon"
    ) {
      errors.push(
        `Layer "${id}": isochrone requires polygon geometry, got "${layer.geometryType}"`,
      );
    }

    // Isochrone breakpoints should be sorted ascending
    if (family === "isochrone" && layer.isochrone?.breakpoints) {
      const bp = layer.isochrone.breakpoints;
      const isSorted = bp.every((v, i) => i === 0 || v > bp[i - 1]);
      if (!isSorted) {
        warnings.push(
          `Layer "${id}": isochrone breakpoints should be sorted ascending`,
        );
      }
    }

    // Isochrone with too many breakpoints → warning
    if (
      family === "isochrone" &&
      layer.isochrone?.breakpoints &&
      layer.isochrone.breakpoints.length > 6
    ) {
      warnings.push(
        `Layer "${id}": more than 6 isochrone breakpoints may be hard to distinguish visually`,
      );
    }

    // ─── Profile-aware checks (only when profile is provided) ───

    if (profile && attrMap.size > 0) {
      // colorField must exist in dataset
      const colorField = layer.style?.colorField;
      if (colorField && !attrMap.has(colorField)) {
        errors.push(
          `Layer "${id}": colorField "${colorField}" not found in dataset attributes`,
        );
      }

      // sizeField must exist in dataset
      const sizeField = layer.style?.sizeField;
      if (sizeField && !attrMap.has(sizeField)) {
        errors.push(
          `Layer "${id}": sizeField "${sizeField}" not found in dataset attributes`,
        );
      }

      // sizeField should be numeric
      if (sizeField && attrMap.has(sizeField)) {
        const attr = attrMap.get(sizeField)!;
        if (attr.type !== "number") {
          warnings.push(
            `Layer "${id}": sizeField "${sizeField}" is ${attr.type}, expected number`,
          );
        }
      }

      // tooltipFields must exist in dataset
      if (layer.interaction?.tooltipFields) {
        for (const field of layer.interaction.tooltipFields) {
          if (!attrMap.has(field)) {
            errors.push(
              `Layer "${id}": tooltipField "${field}" not found in dataset attributes`,
            );
          }
        }
      }

      // normalization.field must exist in dataset
      const normField = layer.style?.normalization?.field;
      if (normField && !attrMap.has(normField)) {
        errors.push(
          `Layer "${id}": normalization.field "${normField}" not found in dataset attributes`,
        );
      }

      // labelField must exist in dataset
      const labelField = layer.style?.labelField;
      if (labelField && !attrMap.has(labelField)) {
        errors.push(
          `Layer "${id}": labelField "${labelField}" not found in dataset attributes`,
        );
      }

      // flow.weightField must exist in dataset
      if (family === "flow" && layer.flow?.weightField && !attrMap.has(layer.flow.weightField)) {
        errors.push(
          `Layer "${id}": flow.weightField "${layer.flow.weightField}" not found in dataset attributes`,
        );
      }

      // flow.weightField should be numeric
      if (family === "flow" && layer.flow?.weightField && attrMap.has(layer.flow.weightField)) {
        const attr = attrMap.get(layer.flow.weightField)!;
        if (attr.type !== "number") {
          warnings.push(
            `Layer "${id}": flow.weightField "${layer.flow.weightField}" is ${attr.type}, expected number`,
          );
        }
      }

      // flow.originField / destinationField must exist in dataset
      if (family === "flow" && layer.flow) {
        if (layer.flow.originField && !attrMap.has(layer.flow.originField)) {
          errors.push(
            `Layer "${id}": flow.originField "${layer.flow.originField}" not found in dataset attributes`,
          );
        }
        if (layer.flow.destinationField && !attrMap.has(layer.flow.destinationField)) {
          errors.push(
            `Layer "${id}": flow.destinationField "${layer.flow.destinationField}" not found in dataset attributes`,
          );
        }
      }

      // colorField with high null rate → warning
      if (colorField && attrMap.has(colorField)) {
        const attr = attrMap.get(colorField)!;
        const totalValues = attr.nullCount + attr.uniqueValues;
        if (totalValues > 0 && attr.nullCount / totalValues > 0.5) {
          warnings.push(
            `Layer "${id}": colorField "${colorField}" has >50% null values`,
          );
        }
      }

      // Large point dataset without clustering (using actual feature count)
      if (
        (family === "point" || family === "proportional-symbol") &&
        !layer.style?.clusterEnabled &&
        profile.featureCount > 500
      ) {
        warnings.push(
          `Layer "${id}": ${profile.featureCount} features without clustering — consider cluster or heatmap`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
