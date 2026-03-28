/**
 * Geometry-type guards: auto-correct map family when geometry doesn't match,
 * and auto-cluster large point datasets.
 *
 * Shared between generate-map and chat pipelines.
 */

import type { MapManifest } from "@atlas/data-models";
import type { DatasetProfile } from "./types";

const NEEDS_POINT = new Set(["point", "cluster", "heatmap", "proportional-symbol"]);
const NEEDS_POLY = new Set(["choropleth", "isochrone", "extrusion"]);
const NEEDS_LINE = new Set(["flow", "animated-route"]);

/**
 * Apply geometry guards to a manifest:
 * 1. Family↔geometry mismatch correction (point↔poly↔line swaps)
 * 2. Auto-cluster for >5000 point features
 *
 * Mutates `manifest` in place. Returns an array of warning messages.
 */
export function applyGeometryGuards(
  manifest: MapManifest,
  profile: DatasetProfile,
): string[] {
  const warnings: string[] = [];
  const layer = manifest.layers[0];
  if (!layer) return warnings;

  const family = layer.style?.mapFamily;
  if (!family) return warnings;

  const geo = profile.geometryType;
  const isPoint = geo === "Point" || geo === "MultiPoint";
  const isPoly = geo === "Polygon" || geo === "MultiPolygon";
  const isLine = geo === "LineString" || geo === "MultiLineString";

  // ── Family↔geometry mismatch correction ──
  if (NEEDS_POINT.has(family) && isPoly) {
    layer.style.mapFamily = "choropleth";
    warnings.push(`Switched ${family} → choropleth (data has ${geo} geometry)`);
  } else if (NEEDS_POINT.has(family) && isLine) {
    layer.style.mapFamily = "flow";
    warnings.push(`Switched ${family} → flow (data has ${geo} geometry)`);
  } else if (NEEDS_POLY.has(family) && isPoint) {
    const target = profile.featureCount > 2000 ? "heatmap" : "proportional-symbol";
    layer.style.mapFamily = target;
    warnings.push(`Switched ${family} → ${target} (data has ${geo} geometry)`);
  } else if (NEEDS_POLY.has(family) && isLine) {
    layer.style.mapFamily = "flow";
    warnings.push(`Switched ${family} → flow (data has ${geo} geometry)`);
  } else if (NEEDS_LINE.has(family) && isPoint) {
    const target = profile.featureCount > 2000 ? "heatmap" : "point";
    layer.style.mapFamily = target;
    warnings.push(`Switched ${family} → ${target} (data has ${geo} geometry)`);
  } else if (NEEDS_LINE.has(family) && isPoly) {
    layer.style.mapFamily = "choropleth";
    warnings.push(`Switched ${family} → choropleth (data has ${geo} geometry)`);
  }

  // ── Auto-cluster large point datasets ──
  if (profile.featureCount > 5000 && layer.style?.mapFamily === "point") {
    layer.style.mapFamily = "cluster";
    layer.style.clusterRadius = layer.style.clusterRadius ?? 50;
    warnings.push(`Switched to cluster (${profile.featureCount} points would overload browser)`);
  }

  return warnings;
}
