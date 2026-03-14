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
  | "isochrone";

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

// ─── v2: Classification ──────────────────────────────────────

export type ClassificationMethod =
  | "quantile"
  | "equal-interval"
  | "natural-breaks"
  | "manual";

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

export interface BasemapConfig {
  hillshade?: boolean;
  nightlights?: boolean;
  landMask?: boolean;
  terrain?: boolean | { exaggeration?: number };
  tectonic?: boolean;
  /** Show basemap text labels (country names, city names, etc.). Defaults to true. */
  labelsVisible?: boolean;
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
  license?: string;
  // v2 fields (all optional)
  geometryType?: GeometryType;
  legend?: LegendConfig;
  interaction?: InteractionConfig;
  performance?: PerformanceConfig;
  /** Flow-specific configuration. Required when mapFamily is "flow". */
  flow?: FlowConfig;
  /** Isochrone-specific configuration. Required when mapFamily is "isochrone". */
  isochrone?: IsochroneConfig;
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
