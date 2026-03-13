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
} from "@atlas/data-models";
import { getColors, classify } from "@atlas/data-models";
import type { LayerSpecification } from "maplibre-gl";

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
  cluster?: boolean;
  clusterRadius?: number;
  clusterMaxZoom?: number;
}

export interface CompiledLayer {
  sourceId: string;
  sourceConfig: CompiledSourceConfig;
  layers: LayerSpecification[];
  legendItems: CompiledLegendItem[];
}

// ─── Helpers ────────────────────────────────────────────────

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

function uniqueStringValues(
  data: GeoJSON.FeatureCollection,
  field: string,
  max = 7,
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

type Expr = unknown[];

function scheme(layer: LayerManifest): ColorScheme {
  return layer.style.color?.scheme ?? "viridis";
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
  const family: MapFamily = layer.style.mapFamily ?? "point";

  switch (family) {
    case "point":
      return compilePoint(layer, data);
    case "cluster":
      return compileCluster(layer, data);
    case "choropleth":
      return compileChoropleth(layer, data);
    case "heatmap":
      return compileHeatmap(layer, data);
    case "proportional-symbol":
      return compileProportionalSymbol(layer, data);
    case "flow":
      return compileFlow(layer, data);
    case "isochrone":
      return compileIsochrone(layer, data);
    default:
      return compilePoint(layer, data);
  }
}

// ─── Point ──────────────────────────────────────────────────

function compilePoint(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
): CompiledLayer {
  const sourceId = `${layer.id}-source`;
  const pointsId = `${layer.id}-points`;
  const highlightId = `${layer.id}-highlight`;

  const colorField = layer.style.colorField;
  const colorExpr = colorField
    ? buildColorExpression(layer, data)
    : scheme(layer)
      ? getColors(scheme(layer), 1)[0]
      : "#6baed6";

  const layers: LayerSpecification[] = [
    {
      id: pointsId,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-color": colorExpr as string,
        "circle-radius": 5,
        "circle-stroke-width": 1,
        "circle-stroke-color": layer.style.strokeColor ?? "rgba(255,255,255,0.3)",
        "circle-opacity": layer.style.fillOpacity ?? 0.85,
      },
    } as LayerSpecification,
    {
      id: highlightId,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-color": "transparent",
        "circle-radius": 10,
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
    sourceConfig: { type: "geojson", data },
    layers,
    legendItems: buildLegendItems(layer, data, "circle"),
  };
}

// ─── Cluster ────────────────────────────────────────────────

function compileCluster(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
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
        "circle-color": buildColorExpression(layer, data) as string,
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
): CompiledLayer {
  const sourceId = `${layer.id}-source`;
  const fillId = `${layer.id}-fill`;
  const strokeId = `${layer.id}-stroke`;
  const highlightId = `${layer.id}-highlight`;

  const colorField = layer.style.colorField;
  const classCount = classes(layer);
  const method = layer.style.classification?.method ?? "quantile";
  const colorScheme = scheme(layer);
  const paletteColors = getColors(colorScheme, classCount);

  let fillColor: string | Expr = paletteColors[Math.floor(paletteColors.length / 2)];

  if (colorField) {
    const vals = numericValues(data, colorField);
    if (vals.length > 0) {
      const breaks = classify(vals, method, classCount);
      if (breaks.breaks.length > 0) {
        // Build step expression: ["step", ["get", field], color0, break1, color1, ...]
        const expr: Expr = ["step", ["get", colorField], paletteColors[0]];
        for (let i = 0; i < breaks.breaks.length; i++) {
          expr.push(breaks.breaks[i]);
          expr.push(paletteColors[Math.min(i + 1, paletteColors.length - 1)]);
        }
        fillColor = expr;
      }
    }
  }

  const layers: LayerSpecification[] = [
    {
      id: fillId,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": fillColor as string,
        "fill-opacity": layer.style.fillOpacity ?? 0.85,
      },
    } as LayerSpecification,
    {
      id: strokeId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": layer.style.strokeColor ?? "rgba(255,255,255,0.3)",
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
    sourceConfig: { type: "geojson", data },
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

  const weightExpr: Expr | number = layer.style.sizeField
    ? ["interpolate", ["linear"], ["get", layer.style.sizeField], 0, 0, 10, 1]
    : 1;

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
    sourceConfig: { type: "geojson", data },
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
        "circle-color": buildColorExpression(layer, data) as string,
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
    sourceConfig: { type: "geojson", data },
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
 * - Arc rendering (curved lines) is deferred — all lines are straight.
 * - Width scales linearly between flow.minWidth and flow.maxWidth.
 */
function compileFlow(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
): CompiledLayer {
  const sourceId = `${layer.id}-source`;
  const linesId = `${layer.id}-lines`;
  const highlightId = `${layer.id}-highlight`;

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
    ? buildColorExpression(layer, data)
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
    sourceConfig: { type: "geojson", data },
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
    sourceConfig: { type: "geojson", data },
    layers,
    legendItems,
  };
}

// ─── Color expression builders ──────────────────────────────

function buildColorExpression(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
): string | Expr {
  const colorField = layer.style.colorField;
  if (!colorField) {
    return getColors(scheme(layer), 1)[0];
  }

  // Check if field is numeric or string
  const sample = data.features[0]?.properties?.[colorField];

  if (typeof sample === "number") {
    // Numeric → classified step expression
    const classCount = classes(layer);
    const method = layer.style.classification?.method ?? "quantile";
    const paletteColors = getColors(scheme(layer), classCount);
    const vals = numericValues(data, colorField);

    if (vals.length === 0) return paletteColors[0];

    const breaks = classify(vals, method, classCount);
    if (breaks.breaks.length === 0) return paletteColors[0];

    const expr: Expr = ["step", ["get", colorField], paletteColors[0]];
    for (let i = 0; i < breaks.breaks.length; i++) {
      expr.push(breaks.breaks[i]);
      expr.push(paletteColors[Math.min(i + 1, paletteColors.length - 1)]);
    }
    return expr;
  }

  // String → categorical match expression
  const categories = uniqueStringValues(data, colorField);
  const paletteColors = getColors(scheme(layer), categories.length);

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

  const sample = data.features[0]?.properties?.[colorField];

  if (typeof sample === "number") {
    // Numeric → class-based legend
    const classCount = classes(layer);
    const method = layer.style.classification?.method ?? "quantile";
    const paletteColors = getColors(scheme(layer), classCount);
    const vals = numericValues(data, colorField);
    if (vals.length === 0) return [];

    const breaks = classify(vals, method, classCount);
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
  const vals = numericValues(data, colorField);
  if (vals.length === 0) return [];

  const breaks = classify(vals, method, classCount);
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
  if (vals.length === 0) return [];

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
  return n.toFixed(1);
}
