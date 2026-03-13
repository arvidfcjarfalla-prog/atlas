import type { MapManifest, ManifestValidation } from "@atlas/data-models";

/** Cartographic rule validation — domain-specific map quality checks. */
export function validateCartographic(
  manifest: MapManifest,
): ManifestValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

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

    // Choropleth without normalization → warning
    if (family === "choropleth" && !layer.style?.normalization) {
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

    // Flow arc is deferred
    if (family === "flow" && layer.flow?.arc) {
      warnings.push(
        `Layer "${id}": arc rendering is deferred — lines will render as straight segments`,
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
  }

  return { valid: errors.length === 0, errors, warnings };
}
