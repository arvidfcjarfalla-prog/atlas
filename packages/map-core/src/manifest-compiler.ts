/**
 * Manifest compiler: converts a LayerManifest + GeoJSON data into
 * MapLibre source config, layer specifications, and legend items.
 *
 * Pure function — no DOM, no MapLibre API calls.
 */

import type {
  LayerManifest,
  ColorScheme,
  MapFamily,
  ImageFillConfig,
  ChartOverlayConfig,
} from "@atlas/data-models";
import { getColors, classify } from "@atlas/data-models";
import type { LayerSpecification } from "maplibre-gl";
import { applyArcInterpolation } from "./arc-interpolator";
import { applyTransforms } from "./turf-transforms";

// ─── Public types ───────────────────────────────────────────

export interface CompiledLegendItem {
  label: string;
  color: string;
  shape: "circle" | "line" | "square";
  /** For proportional legends: the circle radius in px. */
  radius?: number;
}

export interface CompiledSourceConfig {
  type: "geojson";
  data: GeoJSON.FeatureCollection | string;
  generateId?: boolean;
  cluster?: boolean;
  clusterRadius?: number;
  clusterMaxZoom?: number;
}

export interface TimelineMetadata {
  timeField: string;
  min: number;
  max: number;
  steps: number[];
  cumulative: boolean;
  playSpeed: number;
}

export interface CompiledLayer {
  sourceId: string;
  sourceConfig: CompiledSourceConfig;
  /** Extra sources needed by layers (e.g. centroid points for polygon labels). */
  extraSources?: Record<string, CompiledSourceConfig>;
  layers: LayerSpecification[];
  legendItems: CompiledLegendItem[];
  /** Compiler warnings — field mismatches, empty data, fallback usage. */
  warnings?: string[];
  /** When true, the renderer should animate a marker along the route. */
  _animatable?: boolean;
  /** Timeline metadata for time-based filtering. */
  _timeline?: TimelineMetadata;
  /** Image fill metadata: maps feature values to image URLs. */
  _imageFill?: {
    imageField: string;
    imageMap: Record<string, string>;
    fallbackUrl?: string;
    opacity: number;
    resolution: number;
  };
  /** deck.gl layer configs — resolved by useDeckOverlay hook. */
  deckLayers?: DeckLayerConfig[];
  /** Chart overlay metadata: pre-computed centroids + values per feature. */
  _chartOverlay?: {
    config: ChartOverlayConfig;
    features: Array<{
      centroid: [number, number];
      values: number[];
      label?: string;
    }>;
  };
}

export interface DeckLayerConfig {
  type: string;                    // "HexagonLayer" | "ScreenGridLayer" | "TripsLayer"
  props: Record<string, unknown>;  // serializable props
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Returns the centroid of a polygon ring (array of [lng, lat] positions).
 * Simple average — good enough for label placement.
 */
function ringCentroid(ring: number[][]): [number, number] {
  if (ring.length === 0) return [0, 0];
  let sumLng = 0, sumLat = 0;
  for (const [lng, lat] of ring) { sumLng += lng; sumLat += lat; }
  return [sumLng / ring.length, sumLat / ring.length];
}

/**
 * Returns the area (in squared degrees) of a polygon ring using the shoelace formula.
 * Used to pick the largest ring in a MultiPolygon.
 */
function ringArea(ring: number[][]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(area / 2);
}

/**
 * Builds a FeatureCollection of Point features at the centroid of the largest
 * polygon ring for each feature. Properties are copied over for label access.
 * Used to avoid duplicate labels on MultiPolygon archipelago geometries.
 */
function buildCentroidCollection(
  data: GeoJSON.FeatureCollection,
): GeoJSON.FeatureCollection {
  const points: GeoJSON.Feature[] = [];
  for (const f of data.features) {
    if (!f.geometry) continue;
    let bestRing: number[][] | null = null;
    let bestArea = -1;
    if (f.geometry.type === "Polygon") {
      bestRing = f.geometry.coordinates[0] as number[][];
    } else if (f.geometry.type === "MultiPolygon") {
      for (const poly of f.geometry.coordinates as number[][][][]) {
        const outer = poly[0];
        const a = ringArea(outer);
        if (a > bestArea) { bestArea = a; bestRing = outer; }
      }
    }
    if (!bestRing) continue;
    const [lng, lat] = ringCentroid(bestRing);
    points.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: { ...f.properties },
    });
  }
  return { type: "FeatureCollection", features: points };
}

function numericValues(
  data: GeoJSON.FeatureCollection,
  field: string,
): number[] {
  const values: number[] = [];
  for (const f of data.features) {
    const v = f.properties?.[field];
    if (typeof v === "number" && isFinite(v)) values.push(v);
  }
  return values;
}

/**
 * Compute normalized values (field * multiplier / normField) for classification.
 * Skips features where either field is missing, zero, or non-numeric.
 */
function normalizedValues(
  data: GeoJSON.FeatureCollection,
  field: string,
  normField: string,
  multiplier = 1,
): number[] {
  const values: number[] = [];
  for (const f of data.features) {
    const v = f.properties?.[field];
    const d = f.properties?.[normField];
    if (
      typeof v === "number" && isFinite(v) &&
      typeof d === "number" && isFinite(d) && d !== 0
    ) {
      values.push((v * multiplier) / d);
    }
  }
  return values;
}

function uniqueStringValues(
  data: GeoJSON.FeatureCollection,
  field: string,
  max = 12,
): string[] {
  const seen = new Set<string>();
  for (const f of data.features) {
    const v = f.properties?.[field];
    if (typeof v === "string" && v.length > 0) {
      seen.add(v);
      if (seen.size >= max) break;
    }
  }
  return [...seen];
}

/**
 * Resolve a field name against actual data properties.
 * Returns the correct field name (possibly case-corrected) and an optional warning.
 */
function resolveField(
  data: GeoJSON.FeatureCollection,
  fieldName: string,
): { resolved: string; warning?: string } {
  if (data.features.length === 0) return { resolved: fieldName };
  const sample = data.features.slice(0, 20);
  const hasField = sample.some(f => f.properties?.[fieldName] !== undefined);
  if (hasField) return { resolved: fieldName };

  const allKeys = new Set<string>();
  sample.forEach(f => {
    if (f.properties) Object.keys(f.properties).forEach(k => allKeys.add(k));
  });
  const match = [...allKeys].find(k => k.toLowerCase() === fieldName.toLowerCase());
  if (match) {
    return {
      resolved: match,
      warning: `Auto-corrected "${fieldName}" → "${match}" (case mismatch)`,
    };
  }
  return {
    resolved: fieldName,
    warning: `Field "${fieldName}" not found in data. Available: ${[...allKeys].slice(0, 8).join(", ")}`,
  };
}

type Expr = unknown[];

function scheme(layer: LayerManifest): ColorScheme {
  return layer.style.color?.scheme ?? "blues";
}

function classes(layer: LayerManifest): number {
  return layer.style.classification?.classes ?? 5;
}

// ─── Compiler entry point ───────────────────────────────────

/**
 * Compile a LayerManifest into MapLibre-compatible source + layer specs.
 */
export function compileLayer(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
): CompiledLayer {
  // Defensive: ensure features array exists (malformed GeoJSON or empty response)
  if (!data.features) {
    data = { ...data, features: [] };
  }

  const warnings: string[] = [];

  // Warn on empty data
  if (data.features.length === 0) {
    warnings.push("Dataset has no features — map will appear empty");
  }

  // Resolve field names against actual data (auto-correct case mismatches)
  let resolved = layer;
  if (data.features.length > 0) {
    const patch: Partial<LayerManifest["style"]> = {};
    const interactionPatch: Partial<NonNullable<LayerManifest["interaction"]>> = {};
    let needsPatch = false;
    let needsInteractionPatch = false;

    if (layer.style.colorField) {
      const r = resolveField(data, layer.style.colorField);
      if (r.warning) warnings.push(r.warning);
      if (r.resolved !== layer.style.colorField) { patch.colorField = r.resolved; needsPatch = true; }
    }
    if (layer.style.sizeField) {
      const r = resolveField(data, layer.style.sizeField);
      if (r.warning) warnings.push(r.warning);
      if (r.resolved !== layer.style.sizeField) { patch.sizeField = r.resolved; needsPatch = true; }
    }
    if (layer.style.labelField) {
      const r = resolveField(data, layer.style.labelField);
      if (r.warning) warnings.push(r.warning);
      if (r.resolved !== layer.style.labelField) { patch.labelField = r.resolved; needsPatch = true; }
    }
    if (layer.style.normalization?.field) {
      const r = resolveField(data, layer.style.normalization.field);
      if (r.warning) warnings.push(r.warning);
      if (r.resolved !== layer.style.normalization.field) {
        patch.normalization = { ...layer.style.normalization, field: r.resolved };
        needsPatch = true;
      }
    }
    if (layer.interaction?.tooltipFields) {
      const resolvedFields = layer.interaction.tooltipFields.map(f => {
        const r = resolveField(data, f);
        if (r.warning) warnings.push(r.warning);
        return r.resolved;
      });
      if (resolvedFields.some((f, i) => f !== layer.interaction!.tooltipFields![i])) {
        interactionPatch.tooltipFields = resolvedFields;
        needsInteractionPatch = true;
      }
    }

    if (needsPatch || needsInteractionPatch) {
      resolved = {
        ...layer,
        style: { ...layer.style, ...patch },
        ...(needsInteractionPatch ? { interaction: { ...layer.interaction, ...interactionPatch } } : {}),
      };
    }
  }

  // Apply transforms before family-specific compilation
  if (resolved.transform) {
    data = applyTransforms(data, resolved.transform, warnings);
  }

  const family: MapFamily = resolved.style.mapFamily ?? "point";

  let result: CompiledLayer;
  switch (family) {
    case "point":
      result = compilePoint(resolved, data, warnings); break;
    case "cluster":
      result = compileCluster(resolved, data, warnings); break;
    case "choropleth":
      result = compileChoropleth(resolved, data, warnings); break;
    case "heatmap":
      result = compileHeatmap(resolved, data); break;
    case "proportional-symbol":
      result = compileProportionalSymbol(resolved, data, warnings); break;
    case "flow":
      result = compileFlow(resolved, data, warnings); break;
    case "isochrone":
      result = compileIsochrone(resolved, data); break;
    case "extrusion":
      result = compileExtrusion(resolved, data, warnings); break;
    case "animated-route":
      result = compileAnimatedRoute(resolved, data); break;
    case "timeline":
      result = compileTimeline(resolved, data, warnings); break;
    case "hexbin":
      result = compileHexbin(resolved, data, warnings); break;
    case "hexbin-3d":
    case "screen-grid":
    case "trip":
      // deck.gl families — compiled to DeckLayerConfig (Phase 4)
      result = compileDeckFamily(resolved, data, family, warnings); break;
    default:
      result = compilePoint(resolved, data, warnings); break;
  }

  // Apply user-provided filter to all generated layers
  if (resolved.filter) {
    for (const spec of result.layers) {
      const s = spec as Record<string, unknown>;
      const existing = s.filter as unknown[] | undefined;
      s.filter = existing ? ["all", existing, resolved.filter] : resolved.filter;
    }
  }

  // Attach image fill metadata
  if (resolved.style.imageFill) {
    const cfg = resolved.style.imageFill;
    const imageMap: Record<string, string> = {};
    for (const f of data.features) {
      const val = f.properties?.[cfg.imageField];
      if (typeof val === "string" && val.length > 0) {
        const key = String(f.properties?.name ?? f.properties?.NAME ?? f.properties?.id ?? val);
        if (!imageMap[key]) imageMap[key] = val;
      }
    }
    result._imageFill = {
      imageField: cfg.imageField,
      imageMap,
      fallbackUrl: cfg.fallbackUrl,
      opacity: cfg.opacity ?? 0.85,
      resolution: cfg.resolution ?? 256,
    };
  }

  // Attach chart overlay metadata
  if (resolved.chartOverlay) {
    const cfg = resolved.chartOverlay;
    const chartFeatures: Array<{ centroid: [number, number]; values: number[]; label?: string }> = [];
    for (const f of data.features) {
      if (!f.geometry) continue;
      let centroid: [number, number] | null = null;
      if (f.geometry.type === "Point") {
        centroid = f.geometry.coordinates as [number, number];
      } else if (f.geometry.type === "Polygon") {
        centroid = ringCentroid(f.geometry.coordinates[0] as number[][]);
      } else if (f.geometry.type === "MultiPolygon") {
        let bestRing: number[][] | null = null;
        let bestArea = -1;
        for (const poly of f.geometry.coordinates as number[][][][]) {
          const a = ringArea(poly[0]);
          if (a > bestArea) { bestArea = a; bestRing = poly[0]; }
        }
        if (bestRing) centroid = ringCentroid(bestRing);
      }
      if (!centroid) continue;
      const values = cfg.fields.map((field) => {
        const v = f.properties?.[field];
        return typeof v === "number" && isFinite(v) ? v : 0;
      });
      chartFeatures.push({
        centroid,
        values,
        label: cfg.labelField ? String(f.properties?.[cfg.labelField] ?? "") : undefined,
      });
    }
    result._chartOverlay = { config: cfg, features: chartFeatures };
  }

  if (warnings.length > 0) result.warnings = warnings;
  return result;
}

// ─── Point ──────────────────────────────────────────────────

function compilePoint(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
  warnings: string[] = [],
): CompiledLayer {
  const sourceId = `${layer.id}-source`;
  const pointsId = `${layer.id}-points`;
  const highlightId = `${layer.id}-highlight`;

  const colorField = layer.style.colorField;
  const colorExpr = colorField
    ? buildColorExpression(layer, data, warnings)
    : scheme(layer)
      ? getColors(scheme(layer), 1)[0]
      : "#6baed6";

  // Check what geometry types the data contains
  const hasLines = data.features.some(
    (f) => f.geometry && (f.geometry.type === "LineString" || f.geometry.type === "MultiLineString"),
  );
  const hasPolygons = data.features.some(
    (f) => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"),
  );
  const hasPoints = data.features.some(
    (f) => f.geometry && (f.geometry.type === "Point" || f.geometry.type === "MultiPoint"),
  );

  const baseColor = typeof colorExpr === "string" ? colorExpr : "#6baed6";
  let radiusExpr: Expr | number = 5;
  const sizeField = layer.style.sizeField;
  if (sizeField) {
    const vals = numericValues(data, sizeField);
    if (vals.length > 0) {
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      radiusExpr = [
        "interpolate",
        ["linear"],
        ["sqrt", ["max", ["-", ["get", sizeField], min], 0]],
        0,
        3,
        Math.sqrt(Math.max(max - min, 1)),
        18,
      ];
    } else {
      warnings.push(`Layer "${layer.id}": sizeField "${sizeField}" has no numeric values; using fixed point radius`);
    }
  }
  const highlightRadiusExpr = typeof radiusExpr === "number"
    ? radiusExpr + 5
    : [...(radiusExpr as Expr).slice(0, -1), ((radiusExpr as Expr).at(-1) as number) + 5];
  const layers: LayerSpecification[] = [];

  if (hasPolygons) {
    warnings.push("Point family received Polygon data — rendering as filled areas");
    layers.push({
      id: `${layer.id}-fill`,
      type: "fill",
      source: sourceId,
      filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
      paint: {
        "fill-color": baseColor,
        "fill-opacity": layer.style.fillOpacity ?? 0.6,
      },
    } as LayerSpecification);
  }

  if (hasLines) {
    const lineId = `${layer.id}-lines`;
    layers.push({
      id: lineId,
      type: "line",
      source: sourceId,
      filter: ["any",
        ["==", ["geometry-type"], "LineString"],
        ["==", ["geometry-type"], "MultiLineString"],
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": baseColor,
        "line-width": 3,
        "line-opacity": layer.style.fillOpacity ?? 0.85,
      },
    } as LayerSpecification);
  }

  if (hasPoints || (!hasLines && !hasPolygons)) {
    layers.push(
      {
        id: pointsId,
        type: "circle",
        source: sourceId,
        ...(hasLines || hasPolygons ? { filter: ["==", ["geometry-type"], "Point"] } : {}),
        paint: {
          "circle-color": colorExpr as string,
          "circle-radius": radiusExpr as number,
          "circle-stroke-width": 1,
          "circle-stroke-color": layer.style.strokeColor ?? "rgba(255,255,255,0.3)",
          "circle-opacity": layer.style.fillOpacity ?? 0.85,
        },
      } as LayerSpecification,
      {
        id: highlightId,
        type: "circle",
        source: sourceId,
        ...(hasLines || hasPolygons ? { filter: ["==", ["geometry-type"], "Point"] } : {}),
        paint: {
          "circle-color": "transparent",
          "circle-radius": highlightRadiusExpr as number,
          "circle-stroke-width": 2,
          "circle-stroke-color": "rgba(255,255,255,0.6)",
          "circle-stroke-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            1,
            0,
          ],
        },
      } as LayerSpecification,
    );
  }

  return {
    sourceId,
    sourceConfig: { type: "geojson", data, generateId: true },
    layers,
    legendItems: buildLegendItems(layer, data, "circle"),
  };
}

// ─── Cluster ────────────────────────────────────────────────

function compileCluster(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
  warnings: string[] = [],
): CompiledLayer {
  const sourceId = `${layer.id}-source`;
  const clustersId = `${layer.id}-clusters`;
  const clusterCountId = `${layer.id}-cluster-count`;
  const pointsId = `${layer.id}-points`;

  const radius = layer.style.clusterRadius ?? 50;
  const colors = getColors(scheme(layer), 3);

  const layers: LayerSpecification[] = [
    {
      id: clustersId,
      type: "circle",
      source: sourceId,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "step",
          ["get", "point_count"],
          colors[0],
          10,
          colors[1],
          50,
          colors[2],
        ],
        "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 50, 24],
        "circle-opacity": 0.85,
        "circle-stroke-width": 1,
        "circle-stroke-color": "rgba(255,255,255,0.15)",
      },
    } as LayerSpecification,
    {
      id: clusterCountId,
      type: "symbol",
      source: sourceId,
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-size": 11,
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      },
      paint: {
        "text-color": "rgba(255,255,255,0.9)",
      },
    } as LayerSpecification,
    {
      id: pointsId,
      type: "circle",
      source: sourceId,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": buildColorExpression(layer, data, warnings) as string,
        "circle-radius": 4,
        "circle-stroke-width": 1,
        "circle-stroke-color": layer.style.strokeColor ?? "rgba(255,255,255,0.3)",
        "circle-opacity": layer.style.fillOpacity ?? 0.85,
      },
    } as LayerSpecification,
  ];

  return {
    sourceId,
    sourceConfig: {
      type: "geojson",
      data,
      generateId: true,
      cluster: true,
      clusterRadius: radius,
      clusterMaxZoom: 14,
    },
    layers,
    legendItems: buildLegendItems(layer, data, "circle"),
  };
}

// ─── Choropleth ─────────────────────────────────────────────

function compileChoropleth(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
  warnings: string[] = [],
): CompiledLayer {
  const sourceId = `${layer.id}-source`;
  const fillId = `${layer.id}-fill`;
  const strokeId = `${layer.id}-stroke`;
  const highlightId = `${layer.id}-highlight`;

  const colorField = layer.style.colorField;
  const classCount = classes(layer);
  const method = layer.style.classification?.method ?? "quantile";
  const colorScheme = scheme(layer);
  let paletteColors = getColors(colorScheme, classCount);
  if (paletteColors.length === 0 && classCount > 0) {
    warnings.push(`Unknown color scheme "${colorScheme}", falling back to "viridis"`);
    paletteColors = getColors("viridis", classCount);
  }
  const normField = layer.style.normalization?.field;
  const multiplier = layer.style.normalization?.multiplier ?? 1;

  let fillColor: string | Expr = paletteColors[Math.floor(paletteColors.length / 2)];

  if (colorField) {
    // Use normalized values for classification when normalization is configured
    const vals = normField
      ? normalizedValues(data, colorField, normField, multiplier)
      : numericValues(data, colorField);

    // Pre-computed breaks from generate-map (used when data is a URL)
    const preBreaks = layer.style.classification?.breaks;
    const preMin = layer.style.classification?.min;
    const preMax = layer.style.classification?.max;

    if (vals.length > 0) {
      const manualBreaks = layer.style.classification?.breaks;
      const breaks = classify(vals, method, classCount, manualBreaks);
      if (breaks.breaks.length > 0) {
        // The value expression: either normalized (field * multiplier / normField) or raw
        let valueExpr: Expr;
        if (normField) {
          const numerator: Expr = multiplier !== 1
            ? ["*", ["get", colorField], multiplier]
            : ["get", colorField];
          valueExpr = ["/", numerator, ["max", ["get", normField], 1]];
        } else {
          valueExpr = ["get", colorField];
        }

        const expr: Expr = ["step", valueExpr, paletteColors[0]];
        for (let i = 0; i < breaks.breaks.length; i++) {
          expr.push(breaks.breaks[i]);
          expr.push(paletteColors[Math.min(i + 1, paletteColors.length - 1)]);
        }
        fillColor = expr;
      }
    } else if (preBreaks?.length && preMin != null && preMax != null) {
      // No local data (URL source) — use pre-computed breaks from generate-map
      let valueExpr: Expr;
      if (normField) {
        const numerator: Expr = multiplier !== 1
          ? ["*", ["get", colorField], multiplier]
          : ["get", colorField];
        valueExpr = ["/", numerator, ["max", ["get", normField], 1]];
      } else {
        valueExpr = ["get", colorField];
      }
      const expr: Expr = ["step", valueExpr, paletteColors[0]];
      for (let i = 0; i < preBreaks.length; i++) {
        expr.push(preBreaks[i]);
        expr.push(paletteColors[Math.min(i + 1, paletteColors.length - 1)]);
      }
      fillColor = expr;
    }
  }

  // Check if data has polygons — if only points/lines, fallback to appropriate layer types
  const hasPolys = data.features.some(
    (f) => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"),
  );
  const hasLineData = data.features.some(
    (f) => f.geometry && (f.geometry.type === "LineString" || f.geometry.type === "MultiLineString"),
  );
  const hasPointData = data.features.some(
    (f) => f.geometry && f.geometry.type === "Point",
  );

  const layers: LayerSpecification[] = [];

  if (hasPolys) {
    layers.push(
      {
        id: fillId,
        type: "fill",
        source: sourceId,
        filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
        paint: {
          "fill-color": fillColor as string,
          "fill-opacity": layer.style.fillOpacity ?? 0.85,
        },
      } as LayerSpecification,
      {
        id: strokeId,
        type: "line",
        source: sourceId,
        filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
        paint: {
          "line-color": layer.style.strokeColor ?? "rgba(255,255,255,0.3)",
          "line-width": layer.style.strokeWidth ?? 0.5,
        },
      } as LayerSpecification,
      {
        id: highlightId,
        type: "fill",
        source: sourceId,
        filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
        paint: {
          "fill-color": "rgba(255,255,255,0.1)",
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            1,
            0,
          ],
        },
      } as LayerSpecification,
    );
  }

  if (hasLineData && !hasPolys) {
    warnings.push("Choropleth received LineString data — rendering as colored lines");
    layers.push({
      id: `${layer.id}-lines`,
      type: "line",
      source: sourceId,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": fillColor as string,
        "line-width": 3,
        "line-opacity": layer.style.fillOpacity ?? 0.85,
      },
    } as LayerSpecification);
  }

  if (hasPointData && !hasPolys) {
    warnings.push("Choropleth received Point data — rendering as colored circles");
    layers.push({
      id: `${layer.id}-circles`,
      type: "circle",
      source: sourceId,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": fillColor as string,
        "circle-radius": 6,
        "circle-opacity": layer.style.fillOpacity ?? 0.85,
        "circle-stroke-width": 1,
        "circle-stroke-color": "rgba(255,255,255,0.3)",
      },
    } as LayerSpecification);
  }

  if (layers.length === 0) {
    // Fallback: emit standard fill layers (original behavior)
    layers.push(
      {
        id: fillId,
        type: "fill",
        source: sourceId,
        paint: { "fill-color": fillColor as string, "fill-opacity": layer.style.fillOpacity ?? 0.85 },
      } as LayerSpecification,
      {
        id: strokeId,
        type: "line",
        source: sourceId,
        paint: { "line-color": layer.style.strokeColor ?? "rgba(255,255,255,0.3)", "line-width": layer.style.strokeWidth ?? 0.5 },
      } as LayerSpecification,
    );
  }

  // Optional text labels on polygons — use centroid points to avoid duplicate
  // labels on MultiPolygon archipelago features (one label per largest ring).
  const labelField = layer.style.labelField;
  let extraSources: Record<string, CompiledSourceConfig> | undefined;
  if (labelField) {
    const labelsId = `${layer.id}-labels`;
    const centroidsSourceId = `${sourceId}-centroids`;
    const textFieldExpr: string | Expr = layer.style.labelFormat
      ? layer.style.labelFormat
      : ["get", labelField];

    const centroidData = typeof data === "string"
      ? { type: "FeatureCollection" as const, features: [] }
      : buildCentroidCollection(data);

    extraSources = {
      [centroidsSourceId]: { type: "geojson", data: centroidData },
    };

    layers.push({
      id: labelsId,
      type: "symbol",
      source: centroidsSourceId,
      layout: {
        "symbol-placement": "point",
        "text-field": textFieldExpr as string,
        "text-size": 11,
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Regular"],
        "text-variable-anchor": ["center", "top", "bottom"],
        "text-radial-offset": 0,
        "text-justify": "center",
        "text-max-width": 8,
        "text-allow-overlap": false,
        "text-optional": true,
      },
      paint: {
        "text-color": "rgba(255,255,255,0.9)",
        "text-halo-color": "rgba(0,0,0,0.7)",
        "text-halo-width": 1.5,
        "text-halo-blur": 0.5,
      },
    } as LayerSpecification);
  }

  return {
    sourceId,
    sourceConfig: { type: "geojson", data, generateId: true },
    extraSources,
    layers,
    legendItems: buildChoroplethLegend(layer, data, paletteColors),
  };
}

// ─── Heatmap ────────────────────────────────────────────────

function compileHeatmap(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
): CompiledLayer {
  const sourceId = `${layer.id}-source`;
  const heatmapId = `${layer.id}-heatmap`;

  const colorScheme = scheme(layer);
  const ramp = getColors(colorScheme, 6);

  // Derive weight domain from actual data instead of hardcoded [0, 10]
  let weightExpr: Expr | number = 1;
  if (layer.style.sizeField) {
    const vals = numericValues(data, layer.style.sizeField);
    const lo = vals.length > 0 ? Math.min(...vals) : 0;
    const hi = vals.length > 0 ? Math.max(...vals) : 1;
    const range = hi - lo || 1;
    weightExpr = ["interpolate", ["linear"], ["get", layer.style.sizeField], lo, 0, lo + range, 1];
  }

  const layers: LayerSpecification[] = [
    {
      id: heatmapId,
      type: "heatmap",
      source: sourceId,
      maxzoom: layer.style.maxZoom ?? 12,
      paint: {
        "heatmap-weight": weightExpr as number,
        "heatmap-intensity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0,
          1,
          12,
          3,
        ],
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0,
          "rgba(0,0,0,0)",
          0.2,
          ramp[0],
          0.4,
          ramp[1],
          0.6,
          ramp[2],
          0.8,
          ramp[3],
          0.9,
          ramp[4],
          1,
          ramp[5],
        ],
        "heatmap-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0,
          4,
          12,
          30,
        ],
        "heatmap-opacity": 0.8,
      },
    } as LayerSpecification,
  ];

  return {
    sourceId,
    sourceConfig: { type: "geojson", data, generateId: true },
    layers,
    legendItems: [
      { label: "Low density", color: ramp[0], shape: "square" },
      { label: "Medium density", color: ramp[2], shape: "square" },
      { label: "High density", color: ramp[5], shape: "square" },
    ],
  };
}

// ─── Proportional Symbol ────────────────────────────────────

function compileProportionalSymbol(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
  warnings: string[] = [],
): CompiledLayer {
  const sourceId = `${layer.id}-source`;
  const circlesId = `${layer.id}-circles`;
  const highlightId = `${layer.id}-highlight`;

  const sizeField = layer.style.sizeField;
  let radiusExpr: Expr | number = 6;

  if (sizeField) {
    const vals = numericValues(data, sizeField);
    const min = vals.length > 0 ? Math.min(...vals) : 0;
    const max = vals.length > 0 ? Math.max(...vals) : 1;
    // sqrt scale for area-proportional perception
    radiusExpr = [
      "interpolate",
      ["linear"],
      ["sqrt", ["max", ["-", ["get", sizeField], min], 0]],
      0,
      3,
      Math.sqrt(Math.max(max - min, 1)),
      30,
    ];
  }

  const layers: LayerSpecification[] = [
    {
      id: circlesId,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-color": buildColorExpression(layer, data, warnings) as string,
        "circle-radius": radiusExpr as number,
        "circle-opacity": layer.style.fillOpacity ?? 0.7,
        "circle-stroke-width": layer.style.strokeWidth ?? 1,
        "circle-stroke-color": layer.style.strokeColor ?? "rgba(255,255,255,0.5)",
      },
    } as LayerSpecification,
    {
      id: highlightId,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-color": "transparent",
        "circle-radius": typeof radiusExpr === "number" ? radiusExpr + 4 : [...(radiusExpr as Expr).slice(0, -1), ((radiusExpr as Expr).at(-1) as number) + 4],
        "circle-stroke-width": 2,
        "circle-stroke-color": "rgba(255,255,255,0.6)",
        "circle-stroke-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          1,
          0,
        ],
      },
    } as LayerSpecification,
  ];

  return {
    sourceId,
    sourceConfig: { type: "geojson", data, generateId: true },
    layers,
    legendItems: buildProportionalLegend(layer, data),
  };
}

// ─── Flow ────────────────────────────────────────────────────

/**
 * Flow map: lines connecting origins to destinations, with width/color
 * driven by a weight field.
 *
 * Assumptions:
 * - Data is pre-processed as LineString features with origin/destination
 *   metadata in properties.
 * - When flow.arc is true, 2-point LineStrings are converted to smooth
 *   arcs (great circle for long distances, Bézier for short).
 * - Width scales linearly between flow.minWidth and flow.maxWidth.
 */
function compileFlow(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
  warnings: string[] = [],
): CompiledLayer {
  const sourceId = `${layer.id}-source`;
  const linesId = `${layer.id}-lines`;
  const highlightId = `${layer.id}-highlight`;

  // Apply arc interpolation if enabled
  const useArc = layer.flow?.arc === true;
  const sourceData = useArc ? applyArcInterpolation(data) : data;

  const flow = layer.flow;
  const minWidth = flow?.minWidth ?? 1;
  const maxWidth = flow?.maxWidth ?? 8;
  const weightField = flow?.weightField;

  let widthExpr: Expr | number = (minWidth + maxWidth) / 2;

  if (weightField) {
    const vals = numericValues(data, weightField);
    const valMin = vals.length > 0 ? Math.min(...vals) : 0;
    const valMax = vals.length > 0 ? Math.max(...vals) : 1;
    if (valMax > valMin) {
      widthExpr = [
        "interpolate",
        ["linear"],
        ["get", weightField],
        valMin,
        minWidth,
        valMax,
        maxWidth,
      ];
    }
  }

  const colorExpr = layer.style.colorField
    ? buildColorExpression(layer, data, warnings)
    : getColors(scheme(layer), 1)[0];

  const layers: LayerSpecification[] = [
    {
      id: linesId,
      type: "line",
      source: sourceId,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": colorExpr as string,
        "line-width": widthExpr as number,
        "line-opacity": layer.style.fillOpacity ?? 0.7,
      },
    } as LayerSpecification,
    {
      id: highlightId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": "rgba(255,255,255,0.4)",
        "line-width": typeof widthExpr === "number" ? widthExpr + 2 : ["+", widthExpr, 2],
        "line-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          0.6,
          0,
        ],
      },
    } as LayerSpecification,
  ];

  return {
    sourceId,
    sourceConfig: { type: "geojson", data: sourceData, generateId: true },
    layers,
    legendItems: buildFlowLegend(layer, data),
  };
}

// ─── Isochrone ────────────────────────────────────────────────

/**
 * Isochrone map: concentric polygons showing reachability zones.
 *
 * Assumptions:
 * - Polygon data is pre-computed by an external routing API (e.g. OSRM,
 *   Mapbox Isochrone API, Valhalla). Each feature has a property matching
 *   the breakpoint value.
 * - Features are ordered largest-to-smallest so smaller (shorter time)
 *   polygons render on top.
 * - The compiler assigns colors from a sequential palette based on the
 *   breakpoints defined in isochrone config.
 */
function compileIsochrone(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
): CompiledLayer {
  const sourceId = `${layer.id}-source`;
  const fillId = `${layer.id}-fill`;
  const strokeId = `${layer.id}-stroke`;
  const highlightId = `${layer.id}-highlight`;

  const iso = layer.isochrone;
  const breakpoints = iso?.breakpoints ?? [5, 10, 15];
  const unit = iso?.unit ?? "minutes";
  const colorScheme = scheme(layer);
  const paletteColors = getColors(colorScheme, breakpoints.length);

  // Build fill-color expression based on breakpoints.
  // Uses the colorField if set, otherwise tries "value" as default property name.
  const colorField = layer.style.colorField ?? "value";

  // Step expression: assigns colors based on breakpoint thresholds
  let fillColor: string | Expr = paletteColors[0];
  if (breakpoints.length > 1) {
    const expr: Expr = ["step", ["get", colorField], paletteColors[0]];
    for (let i = 1; i < breakpoints.length; i++) {
      expr.push(breakpoints[i]);
      expr.push(paletteColors[Math.min(i, paletteColors.length - 1)]);
    }
    fillColor = expr;
  }

  const layers: LayerSpecification[] = [
    {
      id: fillId,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": fillColor as string,
        "fill-opacity": layer.style.fillOpacity ?? 0.5,
      },
    } as LayerSpecification,
    {
      id: strokeId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": layer.style.strokeColor ?? "rgba(255,255,255,0.5)",
        "line-width": layer.style.strokeWidth ?? 1,
      },
    } as LayerSpecification,
    {
      id: highlightId,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": "rgba(255,255,255,0.15)",
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          1,
          0,
        ],
      },
    } as LayerSpecification,
  ];

  const unitLabel = unit === "minutes" ? "min" : "km";
  const legendItems: CompiledLegendItem[] = breakpoints.map((bp, i) => ({
    label: `≤ ${bp} ${unitLabel}`,
    color: paletteColors[Math.min(i, paletteColors.length - 1)],
    shape: "square" as const,
  }));

  return {
    sourceId,
    sourceConfig: { type: "geojson", data, generateId: true },
    layers,
    legendItems,
  };
}

// ─── Extrusion ─────────────────────────────────────────────

function compileExtrusion(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
  warnings: string[] = [],
): CompiledLayer {
  const sourceId = `${layer.id}-source`;
  const extrusionId = `${layer.id}-extrusion`;
  const highlightId = `${layer.id}-highlight`;

  const heightField = layer.extrusion?.heightField ?? layer.style.sizeField ?? layer.style.colorField;
  const minHeight = layer.extrusion?.minHeight ?? 0;
  const maxHeight = layer.extrusion?.maxHeight ?? 500_000;

  let heightExpr: Expr | number = (minHeight + maxHeight) / 2;

  if (heightField) {
    const vals = numericValues(data, heightField);
    const valMin = vals.length > 0 ? Math.min(...vals) : 0;
    const valMax = vals.length > 0 ? Math.max(...vals) : 1;
    if (valMax > valMin) {
      heightExpr = [
        "interpolate", ["linear"], ["get", heightField],
        valMin, minHeight,
        valMax, maxHeight,
      ];
    }
  }

  const colorExpr = buildColorExpression(layer, data, warnings);

  const layers: LayerSpecification[] = [
    {
      id: extrusionId,
      type: "fill-extrusion",
      source: sourceId,
      paint: {
        "fill-extrusion-color": colorExpr as string,
        "fill-extrusion-height": heightExpr as number,
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": layer.style.fillOpacity ?? 0.85,
      },
    } as LayerSpecification,
    {
      id: highlightId,
      type: "fill-extrusion",
      source: sourceId,
      paint: {
        "fill-extrusion-color": "rgba(255,255,255,0.3)",
        "fill-extrusion-height": heightExpr as number,
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          0.5,
          0,
        ],
      },
    } as LayerSpecification,
  ];

  return {
    sourceId,
    sourceConfig: { type: "geojson", data, generateId: true },
    layers,
    legendItems: buildLegendItems(layer, data, "square"),
  };
}

// ─── Animated Route ────────────────────────────────────────

function compileAnimatedRoute(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
): CompiledLayer {
  const sourceId = `${layer.id}-source`;
  const lineId = `${layer.id}-line`;
  const stopsId = `${layer.id}-stops`;
  const labelsId = `${layer.id}-labels`;

  const color = getColors(scheme(layer), 1)[0];

  // Separate LineStrings from Points
  const lines = data.features.filter(
    (f) => f.geometry && (f.geometry.type === "LineString" || f.geometry.type === "MultiLineString"),
  );
  const points = data.features.filter(
    (f) => f.geometry && f.geometry.type === "Point",
  );

  const layers: LayerSpecification[] = [
    {
      id: lineId,
      type: "line",
      source: sourceId,
      filter: ["any",
        ["==", ["geometry-type"], "LineString"],
        ["==", ["geometry-type"], "MultiLineString"],
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": color,
        "line-width": 3,
        "line-opacity": 0.7,
        "line-dasharray": [2, 2],
      },
    } as LayerSpecification,
    {
      id: stopsId,
      type: "circle",
      source: sourceId,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 6,
        "circle-color": color,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    } as LayerSpecification,
  ];

  // Add labels if points have names
  if (points.some((p) => p.properties?.name)) {
    layers.push({
      id: labelsId,
      type: "symbol",
      source: sourceId,
      filter: ["==", ["geometry-type"], "Point"],
      layout: {
        "text-field": ["get", "name"],
        "text-size": 12,
        "text-offset": [0, 1.5],
        "text-anchor": "top",
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(0,0,0,0.7)",
        "text-halo-width": 1,
      },
    } as LayerSpecification);
  }

  const legendItems: CompiledLegendItem[] = [
    { label: layer.label, color, shape: "line" },
  ];

  return {
    sourceId,
    sourceConfig: { type: "geojson", data, generateId: true },
    layers,
    legendItems,
    _animatable: true,
  };
}

// ─── Timeline ──────────────────────────────────────────────

function compileTimeline(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
  warnings: string[] = [],
): CompiledLayer {
  const timeField = layer.timeline?.timeField;

  // Detect geometry type and delegate to appropriate base compiler
  const hasPolygons = data.features.some(
    (f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon",
  );

  // Compile base layers (choropleth for polygons, point for points)
  const base = hasPolygons
    ? compileChoropleth(layer, data, warnings)
    : compilePoint(layer, data, warnings);

  // Attach timeline metadata for the renderer
  if (timeField) {
    const timeValues = data.features
      .map((f) => f.properties?.[timeField])
      .filter((v) => v != null)
      .map(Number)
      .filter(isFinite);

    const uniqueTimes = [...new Set(timeValues)].sort((a, b) => a - b);

    base._timeline = {
      timeField,
      min: uniqueTimes[0] ?? 0,
      max: uniqueTimes[uniqueTimes.length - 1] ?? 0,
      steps: uniqueTimes,
      cumulative: layer.timeline?.cumulative ?? true,
      playSpeed: layer.timeline?.playSpeed ?? 1000,
    };
  }

  return base;
}

// ─── Hexbin ─────────────────────────────────────────────────

function compileHexbin(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
  warnings: string[] = [],
): CompiledLayer {
  const sourceId = `${layer.id}-source`;
  const fillId = `${layer.id}-fill`;
  const strokeId = `${layer.id}-stroke`;
  const highlightId = `${layer.id}-highlight`;

  const config = layer.hexbin;
  const resolution = config?.resolution ?? 6;
  const aggregation = config?.aggregation ?? "count";
  const aggField = config?.aggregationField;

  // Dynamic import h3-js at compile time — it's a pure function call.
  // For SSR/Node safety, guard with try/catch.
  let hexData: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const h3 = require("h3-js");

    // Bin points into H3 cells
    const cellMap = new Map<string, { count: number; values: number[] }>();
    for (const f of data.features) {
      if (!f.geometry || f.geometry.type !== "Point") continue;
      const [lng, lat] = f.geometry.coordinates;
      const cell = h3.latLngToCell(lat, lng, resolution);
      if (!cellMap.has(cell)) cellMap.set(cell, { count: 0, values: [] });
      const entry = cellMap.get(cell)!;
      entry.count++;
      if (aggField) {
        const v = f.properties?.[aggField];
        if (typeof v === "number" && isFinite(v)) entry.values.push(v);
      }
    }

    // Convert cells to polygon features
    const features: GeoJSON.Feature[] = [];
    for (const [cell, { count, values }] of cellMap) {
      const boundary = h3.cellToBoundary(cell, true); // [lng, lat] pairs
      let value = count;
      if (aggregation !== "count" && values.length > 0) {
        switch (aggregation) {
          case "sum": value = values.reduce((a, b) => a + b, 0); break;
          case "mean": value = values.reduce((a, b) => a + b, 0) / values.length; break;
          case "max": value = Math.max(...values); break;
          case "min": value = Math.min(...values); break;
        }
      }
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [boundary] },
        properties: { _hex_value: value, _hex_count: count },
      });
    }
    hexData = { type: "FeatureCollection", features };

    if (features.length === 0) {
      warnings.push("Hexbin produced no cells — input may lack Point geometry");
    }
  } catch {
    warnings.push("H3 hexbin computation unavailable — rendering empty");
  }

  // Use choropleth-style fill coloring on _hex_value
  const classCount = classes(layer);
  const colorScheme = scheme(layer);
  const paletteColors = getColors(colorScheme, classCount);
  const vals = numericValues(hexData, "_hex_value");

  let fillColor: string | Expr = paletteColors[Math.floor(paletteColors.length / 2)];
  if (vals.length > 0) {
    const method = layer.style.classification?.method ?? "quantile";
    const manualBreaks = layer.style.classification?.breaks;
    const breaks = classify(vals, method, classCount, manualBreaks);
    if (breaks.breaks.length > 0) {
      const expr: Expr = ["step", ["get", "_hex_value"], paletteColors[0]];
      for (let i = 0; i < breaks.breaks.length; i++) {
        expr.push(breaks.breaks[i]);
        expr.push(paletteColors[Math.min(i + 1, paletteColors.length - 1)]);
      }
      fillColor = expr;
    }
  }

  const layers: LayerSpecification[] = [
    {
      id: fillId,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": fillColor as string,
        "fill-opacity": layer.style.fillOpacity ?? 0.8,
      },
    } as LayerSpecification,
    {
      id: strokeId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": layer.style.strokeColor ?? "rgba(255,255,255,0.2)",
        "line-width": layer.style.strokeWidth ?? 0.5,
      },
    } as LayerSpecification,
    {
      id: highlightId,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": "rgba(255,255,255,0.1)",
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          1,
          0,
        ],
      },
    } as LayerSpecification,
  ];

  return {
    sourceId,
    sourceConfig: { type: "geojson", data: hexData, generateId: true },
    layers,
    legendItems: buildChoroplethLegend(
      { ...layer, style: { ...layer.style, colorField: "_hex_value" } },
      hexData,
      paletteColors,
    ),
  };
}

// ─── deck.gl families (Phase 4) ─────────────────────────────

function compileDeckFamily(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
  family: MapFamily,
  warnings: string[] = [],
): CompiledLayer {
  const sourceId = `${layer.id}-source`;
  const deckLayers: DeckLayerConfig[] = [];

  if (family === "hexbin-3d") {
    const config = layer.hexbin3d;
    deckLayers.push({
      type: "HexagonLayer",
      props: {
        data: data.features
          .filter((f): f is GeoJSON.Feature<GeoJSON.Point> => f.geometry?.type === "Point")
          .map((f) => f.geometry.coordinates),
        getPosition: "identity",
        radius: 1000,
        elevationScale: config?.elevationScale ?? 10000,
        coverage: config?.coverage ?? 0.8,
        extruded: true,
        pickable: true,
      },
    });
  } else if (family === "screen-grid") {
    const config = layer.screenGrid;
    deckLayers.push({
      type: "ScreenGridLayer",
      props: {
        data: data.features
          .filter((f): f is GeoJSON.Feature<GeoJSON.Point> => f.geometry?.type === "Point")
          .map((f) => f.geometry.coordinates),
        getPosition: "identity",
        cellSizePixels: config?.cellSize ?? 50,
        pickable: false,
        opacity: layer.style.fillOpacity ?? 0.8,
      },
    });
  } else if (family === "trip") {
    const config = layer.trip;
    if (!config?.timestampField) {
      warnings.push(`Layer "${layer.id}": trip family requires trip.timestampField`);
    }
    deckLayers.push({
      type: "TripsLayer",
      props: {
        data: data.features,
        getPath: "geometry.coordinates",
        getTimestamps: config?.timestampField
          ? `properties.${config.timestampField}`
          : undefined,
        trailLength: config?.trailLength ?? 50,
        widthMinPixels: config?.widthPixels ?? 3,
      },
    });
  }

  return {
    sourceId,
    sourceConfig: { type: "geojson", data },
    layers: [], // No MapLibre layers — rendered by deck.gl overlay
    legendItems: [{ label: layer.label, color: getColors(scheme(layer), 1)[0], shape: "circle" }],
    deckLayers,
  };
}

// ─── Field type detection ───────────────────────────────────

/** Sample up to 50 features to determine if a field is predominantly numeric or string. */
function detectFieldType(
  data: GeoJSON.FeatureCollection,
  field: string,
): "number" | "string" | "missing" {
  let numCount = 0;
  let strCount = 0;
  const limit = Math.min(data.features.length, 50);
  for (let i = 0; i < limit; i++) {
    const v = data.features[i]?.properties?.[field];
    if (v === undefined || v === null) continue;
    if (typeof v === "number") numCount++;
    else strCount++;
  }
  if (numCount === 0 && strCount === 0) return "missing";
  return numCount >= strCount ? "number" : "string";
}

// ─── Color expression builders ──────────────────────────────

function buildColorExpression(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
  warnings: string[] = [],
): string | Expr {
  const colorField = layer.style.colorField;
  if (!colorField) {
    const colors = getColors(scheme(layer), 1);
    return colors.length > 0 ? colors[0] : "#6baed6";
  }

  const fieldType = detectFieldType(data, colorField);

  if (fieldType === "number") {
    // Numeric → classified step expression
    const classCount = classes(layer);
    const method = layer.style.classification?.method ?? "quantile";
    let paletteColors = getColors(scheme(layer), classCount);
    if (paletteColors.length === 0 && classCount > 0) {
      warnings.push(`Unknown color scheme "${scheme(layer)}", falling back to "viridis"`);
      paletteColors = getColors("viridis", classCount);
    }
    const vals = numericValues(data, colorField);

    if (vals.length === 0) {
      warnings.push(`No numeric values for "${colorField}" — using fallback color`);
      return paletteColors[0];
    }

    const manualBreaks = layer.style.classification?.breaks;
    const breaks = classify(vals, method, classCount, manualBreaks);
    if (breaks.breaks.length === 0) {
      if (breaks.min === breaks.max) {
        warnings.push(`All values for "${colorField}" are identical (${breaks.min}) — classification not applied`);
      }
      return paletteColors[0];
    }

    const expr: Expr = ["step", ["get", colorField], paletteColors[0]];
    for (let i = 0; i < breaks.breaks.length; i++) {
      expr.push(breaks.breaks[i]);
      expr.push(paletteColors[Math.min(i + 1, paletteColors.length - 1)]);
    }
    return expr;
  }

  // String → categorical match expression
  const categories = uniqueStringValues(data, colorField);
  let paletteColors = getColors(scheme(layer), categories.length);
  if (paletteColors.length === 0 && categories.length > 0) {
    warnings.push(`Unknown color scheme "${scheme(layer)}", falling back to "viridis"`);
    paletteColors = getColors("viridis", categories.length);
  }

  if (categories.length === 0) return paletteColors[0] ?? "#888888";

  const expr: Expr = ["match", ["get", colorField]];
  for (let i = 0; i < categories.length; i++) {
    expr.push(categories[i]);
    expr.push(paletteColors[i]);
  }
  expr.push("#888888"); // fallback
  return expr;
}

// ─── Legend builders ────────────────────────────────────────

function buildLegendItems(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
  shape: "circle" | "line" | "square",
): CompiledLegendItem[] {
  const colorField = layer.style.colorField;
  if (!colorField) {
    return [
      {
        label: layer.label,
        color: getColors(scheme(layer), 1)[0],
        shape,
      },
    ];
  }

  const fieldType = detectFieldType(data, colorField);

  if (fieldType === "number") {
    // Numeric → class-based legend
    const classCount = classes(layer);
    const method = layer.style.classification?.method ?? "quantile";
    const paletteColors = getColors(scheme(layer), classCount);
    const vals = numericValues(data, colorField);
    if (vals.length === 0) return [{ label: "No data", color: "#999999", shape }];

    const manualBreaks = layer.style.classification?.breaks;
    const breaks = classify(vals, method, classCount, manualBreaks);
    const items: CompiledLegendItem[] = [];
    const allBreaks = [breaks.min, ...breaks.breaks, breaks.max];

    for (let i = 0; i < classCount && i < paletteColors.length; i++) {
      const lo = allBreaks[i] ?? breaks.min;
      const hi = allBreaks[i + 1] ?? breaks.max;
      items.push({
        label: `${formatNumber(lo)} – ${formatNumber(hi)}`,
        color: paletteColors[i],
        shape,
      });
    }
    return items;
  }

  // Categorical
  const categories = uniqueStringValues(data, colorField);
  const paletteColors = getColors(scheme(layer), categories.length);
  return categories.map((cat, i) => ({
    label: cat,
    color: paletteColors[i],
    shape,
  }));
}

function buildChoroplethLegend(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
  paletteColors: string[],
): CompiledLegendItem[] {
  const colorField = layer.style.colorField;
  if (!colorField) {
    return [{ label: layer.label, color: paletteColors[0], shape: "square" }];
  }

  const classCount = classes(layer);
  const method = layer.style.classification?.method ?? "quantile";
  const normField = layer.style.normalization?.field;
  const multiplier = layer.style.normalization?.multiplier ?? 1;
  const vals = normField
    ? normalizedValues(data, colorField, normField, multiplier)
    : numericValues(data, colorField);
  if (vals.length === 0) {
    // Try pre-computed breaks from generate-map (URL-based data)
    const preBreaks = layer.style.classification?.breaks;
    const preMin = layer.style.classification?.min;
    const preMax = layer.style.classification?.max;
    if (preBreaks?.length && preMin != null && preMax != null) {
      const allBreaks = [preMin, ...preBreaks, preMax];
      const items: CompiledLegendItem[] = [];
      for (let i = 0; i < classCount && i < paletteColors.length; i++) {
        const lo = allBreaks[i] ?? preMin;
        const hi = allBreaks[i + 1] ?? preMax;
        items.push({
          label: `${formatNumber(lo)} – ${formatNumber(hi)}`,
          color: paletteColors[i],
          shape: "square",
        });
      }
      return items;
    }
    return [{ label: "No data", color: "#999999", shape: "square" as const }];
  }

  const manualBreaks = layer.style.classification?.breaks;
  const breaks = classify(vals, method, classCount, manualBreaks);
  const items: CompiledLegendItem[] = [];
  const allBreaks = [breaks.min, ...breaks.breaks, breaks.max];

  for (let i = 0; i < classCount && i < paletteColors.length; i++) {
    const lo = allBreaks[i] ?? breaks.min;
    const hi = allBreaks[i + 1] ?? breaks.max;
    items.push({
      label: `${formatNumber(lo)} – ${formatNumber(hi)}`,
      color: paletteColors[i],
      shape: "square",
    });
  }
  return items;
}

function buildProportionalLegend(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
): CompiledLegendItem[] {
  const sizeField = layer.style.sizeField;
  const color = getColors(scheme(layer), 1)[0];

  if (!sizeField) {
    return [{ label: layer.label, color, shape: "circle" }];
  }

  const vals = numericValues(data, sizeField);
  if (vals.length === 0) return [{ label: "No data", color: "#999999", shape: "circle" as const }];

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const mid = (min + max) / 2;

  // Example values from manifest or computed
  const examples = layer.legend?.exampleValues ?? [min, mid, max];

  return examples.map((v) => ({
    label: formatNumber(v),
    color,
    shape: "circle" as const,
    radius: 3 + (27 * Math.sqrt(Math.max(v - min, 0))) / Math.sqrt(Math.max(max - min, 1)),
  }));
}

function buildFlowLegend(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
): CompiledLegendItem[] {
  const colorField = layer.style.colorField;
  const weightField = layer.flow?.weightField;
  const color = getColors(scheme(layer), 1)[0];

  // If there's a colorField, use the generic legend builder (categorical/numeric)
  if (colorField) {
    return buildLegendItems(layer, data, "line");
  }

  // If there's a weightField, show min/mid/max weight as line items
  if (weightField) {
    const vals = numericValues(data, weightField);
    if (vals.length > 0) {
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const mid = (min + max) / 2;
      return [
        { label: formatNumber(min), color, shape: "line" },
        { label: formatNumber(mid), color, shape: "line" },
        { label: formatNumber(max), color, shape: "line" },
      ];
    }
  }

  return [{ label: layer.label, color, shape: "line" }];
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  if (Number.isInteger(n)) return String(n);
  if (Math.abs(n) < 0.01 && n !== 0) return n.toExponential(1);
  if (Math.abs(n) < 1) return n.toPrecision(3);
  return n.toFixed(1);
}
