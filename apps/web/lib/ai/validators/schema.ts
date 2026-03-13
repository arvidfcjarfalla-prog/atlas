import type { MapManifest, ManifestValidation, ColorScheme, TravelMode } from "@atlas/data-models";

const VALID_SCHEMES: ColorScheme[] = [
  "viridis", "magma", "plasma", "inferno", "cividis",
  "blues", "greens", "reds", "oranges", "purples", "greys",
  "blue-red", "blue-yellow-red", "spectral",
  "set1", "set2", "paired",
];

const VALID_TRAVEL_MODES: TravelMode[] = [
  "driving", "walking", "cycling", "transit",
];

/** Structural schema validation — required fields, value ranges, known enums. */
export function validateSchema(manifest: MapManifest): ManifestValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!manifest.id) errors.push("Missing required field: id");
  if (!manifest.title) errors.push("Missing required field: title");
  if (!manifest.layers || manifest.layers.length === 0) {
    errors.push("Manifest must have at least one layer");
  }

  const layerIds = new Set<string>();

  for (const layer of manifest.layers) {
    if (!layer.id) {
      errors.push("Layer missing id");
      continue;
    }

    if (layerIds.has(layer.id)) {
      errors.push(`Duplicate layer id: "${layer.id}"`);
    }
    layerIds.add(layer.id);

    if (!layer.style) {
      errors.push(`Layer "${layer.id}": missing style`);
      continue;
    }

    // Classification classes must be 2–7
    const classes = layer.style.classification?.classes;
    if (classes !== undefined && (classes < 2 || classes > 7)) {
      errors.push(
        `Layer "${layer.id}": classification classes must be 2–7, got ${classes}`,
      );
    }

    // Color scheme must be known
    const scheme = layer.style.color?.scheme;
    if (scheme && !VALID_SCHEMES.includes(scheme)) {
      errors.push(`Layer "${layer.id}": unknown color scheme "${scheme}"`);
    }

    // fillOpacity must be 0–1
    const opacity = layer.style.fillOpacity;
    if (opacity !== undefined && (opacity < 0 || opacity > 1)) {
      errors.push(
        `Layer "${layer.id}": fillOpacity must be 0–1, got ${opacity}`,
      );
    }

    // strokeWidth must be positive
    const sw = layer.style.strokeWidth;
    if (sw !== undefined && sw < 0) {
      errors.push(`Layer "${layer.id}": strokeWidth must be ≥ 0`);
    }

    // Flow: required fields
    const family = layer.style.mapFamily;
    if (family === "flow") {
      if (!layer.flow) {
        errors.push(`Layer "${layer.id}": flow family requires a flow config`);
      } else {
        if (!layer.flow.originField) {
          errors.push(`Layer "${layer.id}": flow.originField is required`);
        }
        if (!layer.flow.destinationField) {
          errors.push(`Layer "${layer.id}": flow.destinationField is required`);
        }
        if (layer.flow.minWidth !== undefined && layer.flow.minWidth < 0) {
          errors.push(`Layer "${layer.id}": flow.minWidth must be ≥ 0`);
        }
        if (layer.flow.maxWidth !== undefined && layer.flow.maxWidth < 0) {
          errors.push(`Layer "${layer.id}": flow.maxWidth must be ≥ 0`);
        }
      }
    }

    // Isochrone: required fields
    if (family === "isochrone") {
      if (!layer.isochrone) {
        errors.push(`Layer "${layer.id}": isochrone family requires an isochrone config`);
      } else {
        if (!VALID_TRAVEL_MODES.includes(layer.isochrone.mode)) {
          errors.push(
            `Layer "${layer.id}": unknown travel mode "${layer.isochrone.mode}"`,
          );
        }
        if (
          !Array.isArray(layer.isochrone.breakpoints) ||
          layer.isochrone.breakpoints.length === 0
        ) {
          errors.push(`Layer "${layer.id}": isochrone.breakpoints must be a non-empty array`);
        } else if (layer.isochrone.breakpoints.some((b) => typeof b !== "number" || b <= 0)) {
          errors.push(`Layer "${layer.id}": isochrone.breakpoints must be positive numbers`);
        }
        if (
          layer.isochrone.unit !== undefined &&
          layer.isochrone.unit !== "minutes" &&
          layer.isochrone.unit !== "kilometers"
        ) {
          errors.push(`Layer "${layer.id}": isochrone.unit must be "minutes" or "kilometers"`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
