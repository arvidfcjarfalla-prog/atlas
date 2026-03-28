import type { EntityKind } from "./entities/base";

// ─── Existing v1 types ───────────────────────────────────────

export type MapTheme = "editorial" | "explore" | "decision";

// ─── v2: Map family ──────────────────────────────────────────

export type MapFamily =
  | "point"
  | "cluster"
  | "choropleth"
  | "heatmap"
  | "proportional-symbol"
  | "flow"
  | "isochrone"
  | "extrusion"
  | "animated-route"
  | "timeline"
  | "hexbin"
  | "hexbin-3d"
  | "screen-grid"
  | "trip";

// ─── v2: Travel mode (for isochrone) ────────────────────────

export type TravelMode =
  | "driving"
  | "walking"
  | "cycling"
  | "transit";

// ─── v2: Flow config ────────────────────────────────────────

export interface FlowConfig {
  /** Property name for the origin location label/id. */
  originField: string;
  /** Property name for the destination location label/id. */
  destinationField: string;
  /** Property name for flow weight/volume (drives line width). */
  weightField?: string;
  /** Property name for flow direction (optional — lines are bidirectional by default). */
  directionField?: string;
  /** Render lines as curved arcs (great circle for long distances, Bézier for short). Default false. */
  arc?: boolean;
  /** Min line width in px (default 1). */
  minWidth?: number;
  /** Max line width in px (default 8). */
  maxWidth?: number;
}

// ─── v2: Isochrone config ───────────────────────────────────

export type IsochroneUnit = "minutes" | "kilometers";

export interface IsochroneConfig {
  /** Travel mode for isochrone calculation. */
  mode: TravelMode;
  /** Breakpoints for isochrone contours (e.g. [5, 10, 15, 30]). */
  breakpoints: number[];
  /** Unit for breakpoints. Default "minutes". */
  unit?: IsochroneUnit;
  /** Origin point as [lat, lng]. If omitted, uses defaultCenter. */
  origin?: [number, number];
}

// ─── v2: Extrusion config ────────────────────────────────────

export interface ExtrusionConfig {
  /** Property driving the extrusion height. */
  heightField: string;
  /** Minimum height in meters (default 0). */
  minHeight?: number;
  /** Maximum height in meters (default 500000). */
  maxHeight?: number;
}

// ─── v2: Animated route config ──────────────────────────────

export interface AnimatedRouteConfig {
  /** Property with stop order for sorting. */
  orderField?: string;
  /** Full animation duration in ms (default 10000). */
  durationMs?: number;
  /** Loop the animation (default true). */
  loop?: boolean;
}

// ─── v2: Timeline config ────────────────────────────────────

export interface TimelineConfig {
  /** Property containing the time value (year, date, epoch). */
  timeField: string;
  /** Show all features up to current time (default true). */
  cumulative?: boolean;
  /** Auto-play speed in ms per step (default 1000). */
  playSpeed?: number;
}

// ─── v2: Transforms ─────────────────────────────────────────

export type TransformType = "buffer" | "voronoi" | "convex-hull" | "centroid" | "simplify" | "dissolve";

export interface BufferTransform { type: "buffer"; distance: number; units?: "kilometers" | "miles" | "meters"; }
export interface VoronoiTransform { type: "voronoi"; bbox?: [number, number, number, number]; }
export interface ConvexHullTransform { type: "convex-hull"; }
export interface CentroidTransform { type: "centroid"; keepProperties?: boolean; }
export interface SimplifyTransform { type: "simplify"; tolerance: number; }
export interface DissolveTransform { type: "dissolve"; groupByField: string; }

export type TransformConfig =
  | BufferTransform
  | VoronoiTransform
  | ConvexHullTransform
  | CentroidTransform
  | SimplifyTransform
  | DissolveTransform;

// ─── v2: Hexbin config ──────────────────────────────────────

export interface HexbinConfig {
  resolution?: number;           // 3-9, default 6
  aggregation?: "count" | "sum" | "mean" | "max" | "min";
  aggregationField?: string;     // required when aggregation !== "count"
}

// ─── v2: deck.gl family configs ─────────────────────────────

export interface Hexbin3DConfig {
  resolution?: number;           // default 6
  elevationScale?: number;       // default 10000
  coverage?: number;             // 0-1, default 0.8
  elevationField?: string;
  colorField?: string;
}

export interface ScreenGridConfig {
  cellSize?: number;             // pixels, default 50
}

export interface TripConfig {
  timestampField: string;
  trailLength?: number;          // default 50
  speed?: number;                // default 1
  widthPixels?: number;          // default 3
}

// ─── v2: Classification ──────────────────────────────────────

export type ClassificationMethod =
  | "quantile"
  | "equal-interval"
  | "natural-breaks"
  | "manual"
  | "categorical";

export interface ClassificationConfig {
  method: ClassificationMethod;
  /** Number of classes (2–7). */
  classes: number;
  /** Manual break values when method is "manual". */
  breaks?: number[];
}

// ─── v2: Color scheme ────────────────────────────────────────

export type ColorScheme =
  | "viridis" | "magma" | "plasma" | "inferno" | "cividis"
  | "blues" | "greens" | "reds" | "oranges" | "purples" | "greys"
  | "blue-red" | "blue-yellow-red" | "spectral"
  | "set1" | "set2" | "paired";

export interface ColorConfig {
  scheme: ColorScheme;
  /** Use colorblind-safe variant. Default true. */
  colorblindSafe?: boolean;
  /** Override individual class colors. Length must match classification.classes. */
  customColors?: string[];
}

// ─── v2: Normalization ───────────────────────────────────────

export type NormalizationMethod =
  | "per-capita"
  | "per-area"
  | "percentage"
  | "none";

export interface NormalizationConfig {
  /** Denominator field in the dataset. */
  field: string;
  method: NormalizationMethod;
  /** Scale factor applied to the numerator before dividing.
   *  Example: gdp_md is in millions → multiplier: 1_000_000 gives real per-capita USD. */
  multiplier?: number;
}

// ─── v2: Legend ───────────────────────────────────────────────

export type LegendType = "gradient" | "categorical" | "proportional" | "flow";

export interface LegendConfig {
  title: string;
  type: LegendType;
  /** For proportional legends: example size values. */
  exampleValues?: number[];
}

// ─── v2: Interaction ─────────────────────────────────────────

export interface InteractionConfig {
  tooltipFields?: string[];
  clickBehavior?: "detail-panel" | "popup" | "fly-to" | "none";
  hoverEffect?: "highlight" | "enlarge" | "none";
}

// ─── v2: Performance ─────────────────────────────────────────

export interface PerformanceConfig {
  /** Simplify geometry tolerance (degrees). */
  simplifyTolerance?: number;
  /** Max features before recommending clustering or tiling. */
  featureThreshold?: number;
}

// ─── v2: Accessibility ───────────────────────────────────────

export interface AccessibilityConfig {
  colorblindSafe?: boolean;
  contrastTarget?: "AA" | "AAA";
  locale?: string;
  rtl?: boolean;
}

// ─── v2: Basemap layers ──────────────────────────────────────

export type BasemapStyle = "dark" | "paper" | "nord" | "sepia" | "stark" | "retro" | "ocean";

export interface BasemapConfig {
  /** Visual basemap preset. Defaults to "dark". */
  style?: BasemapStyle;
  hillshade?: boolean;
  nightlights?: boolean;
  landMask?: boolean;
  terrain?: boolean | { exaggeration?: number };
  tectonic?: boolean;
  /** Show basemap text labels (country names, city names, etc.). Defaults to true. */
  labelsVisible?: boolean;
  /** Contour lines from DEM data. */
  contourLines?: boolean | { interval?: number; majorInterval?: number; opacity?: number; };
}

// ─── v2: Image fill config ──────────────────────────────────

export interface ImageFillConfig {
  /** Property name containing the image URL per feature. */
  imageField: string;
  /** Fallback image URL when a feature's imageField is empty. */
  fallbackUrl?: string;
  /** Fill opacity (0–1). Default 0.85. */
  opacity?: number;
  /** Image resolution to scale to (px). Default 256. */
  resolution?: number;
}

// ─── v2: Chart overlay config ───────────────────────────────

export type ChartOverlayType = "bar" | "pie" | "sparkline";

export interface ChartOverlayConfig {
  /** Chart type. */
  type: ChartOverlayType;
  /** Property names whose values form the chart data. */
  fields: string[];
  /** Labels for each field (same order). */
  labels?: string[];
  /** Chart size in px (default 40). */
  size?: number;
  /** Minimum zoom to show charts (default 3). */
  minZoom?: number;
  /** Max visible charts at once (default 50). */
  maxVisible?: number;
  /** Property name for the chart label (e.g. country name). */
  labelField?: string;
}

// ─── v2: AI intent tracking ──────────────────────────────────

export interface ManifestIntent {
  /** Original user prompt. */
  userPrompt: string;
  /** Detected analytical task type. */
  taskType: string;
  /** AI confidence 0–1. */
  confidence: number;
  /** Assumptions the AI made about data or intent. */
  assumptions?: string[];
}

// ─── v2: Validation result ───────────────────────────────────

export interface ManifestValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─── v2: Geometry type hint ──────────────────────────────────

export type GeometryType = "point" | "polygon" | "line" | "multi-polygon";

// ─── LayerStyle (extended) ───────────────────────────────────

export interface LayerStyle {
  // v1 fields (unchanged)
  markerShape: "circle" | "icon";
  colorField?: string;
  sizeField?: string;
  clusterEnabled?: boolean;
  clusterRadius?: number;
  minZoom?: number;
  maxZoom?: number;
  // v2 fields (all optional)
  mapFamily?: MapFamily;
  classification?: ClassificationConfig;
  color?: ColorConfig;
  normalization?: NormalizationConfig;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  /** Property name to display as text label on features (e.g. "name"). */
  labelField?: string;
  /** Format template using {field} placeholders (e.g. "{name}\n{value}"). */
  labelFormat?: string;
  /** Image fill config for polygon layers. */
  imageFill?: ImageFillConfig;
}

// ─── LayerManifest (extended) ────────────────────────────────

export interface LayerManifest {
  // v1 fields (unchanged)
  id: string;
  kind: EntityKind;
  label: string;
  sourceType: "geojson-url" | "geojson-static" | "api" | "pmtiles";
  sourceUrl?: string;
  refreshIntervalMs?: number;
  style: LayerStyle;
  attribution?: string;
  attributionUrl?: string;
  license?: string;
  // v2 fields (all optional)
  geometryType?: GeometryType;
  legend?: LegendConfig;
  interaction?: InteractionConfig;
  performance?: PerformanceConfig;
  /** MapLibre filter expression applied to all rendered layers (e.g. ["==", ["get", "continent"], "Europe"]). */
  filter?: unknown[];
  /** Flow-specific configuration. Required when mapFamily is "flow". */
  flow?: FlowConfig;
  /** Isochrone-specific configuration. Required when mapFamily is "isochrone". */
  isochrone?: IsochroneConfig;
  /** Extrusion-specific configuration. Required when mapFamily is "extrusion". */
  extrusion?: ExtrusionConfig;
  /** Animated route configuration. Required when mapFamily is "animated-route". */
  animatedRoute?: AnimatedRouteConfig;
  /** Timeline configuration. Required when mapFamily is "timeline". */
  timeline?: TimelineConfig;
  /** Chart overlay configuration — mini charts at feature centroids. */
  chartOverlay?: ChartOverlayConfig;
  /** Data transform(s) applied to GeoJSON before rendering. */
  transform?: TransformConfig | TransformConfig[];
  /** Hexbin-specific configuration. Required when mapFamily is "hexbin". */
  hexbin?: HexbinConfig;
  /** Hexbin-3D configuration (deck.gl). */
  hexbin3d?: Hexbin3DConfig;
  /** Screen-grid configuration (deck.gl). */
  screenGrid?: ScreenGridConfig;
  /** Trip animation configuration (deck.gl). */
  trip?: TripConfig;
}

// ─── MapManifest (extended) ──────────────────────────────────

/** Declarative config that defines a map product. */
export interface MapManifest {
  // v1 fields (unchanged)
  id: string;
  title: string;
  description: string;
  theme: MapTheme;
  defaultCenter?: [number, number]; // [lat, lng]
  defaultZoom?: number;
  defaultPitch?: number; // 0-45, default 0
  defaultBounds?: [[number, number], [number, number]];
  layers: LayerManifest[];
  timeline?: { enabled: boolean };
  modules?: {
    search?: boolean;
    legend?: boolean;
    detailPanel?: boolean;
  };
  // v2 fields (all optional)
  version?: 2;
  basemap?: BasemapConfig;
  intent?: ManifestIntent;
  validation?: ManifestValidation;
  accessibility?: AccessibilityConfig;
}
