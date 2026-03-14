import type { MapFamily, MapManifest, GeometryType } from "@atlas/data-models";

// ─── Dataset profiling ───────────────────────────────────────

export type ProfileGeometryType =
  | "Point"
  | "LineString"
  | "Polygon"
  | "MultiPolygon"
  | "MultiPoint"
  | "MultiLineString"
  | "Mixed";

export type DistributionShape =
  | "normal"
  | "skewed-right"
  | "skewed-left"
  | "uniform"
  | "bimodal";

export interface AttributeProfile {
  name: string;
  type: "string" | "number" | "boolean" | "null";
  uniqueValues: number;
  nullCount: number;
  /** Only for numeric fields. */
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  distribution?: DistributionShape;
  /** Only for string fields — up to 5 sample values. */
  sampleValues?: string[];
}

/** Statistical profile of a GeoJSON dataset, used to guide map generation. */
export interface DatasetProfile {
  featureCount: number;
  geometryType: ProfileGeometryType;
  /** [[south, west], [north, east]] */
  bounds: [[number, number], [number, number]];
  crs: string | null;
  attributes: AttributeProfile[];
}

// ─── Clarification ──────────────────────────────────────────

export interface ClarificationQuestion {
  id: string;
  question: string;
  options?: string[];
  aspect: "geography" | "metric" | "timeframe" | "data-source" | "visualization";
}

/** Response from the /api/ai/clarify endpoint. */
export interface ClarifyResponse {
  /** If true, prompt is clear enough to proceed to generation. */
  ready: boolean;
  /** Enhanced prompt with resolved context (when ready). */
  resolvedPrompt?: string;
  /** Resolved data endpoint URL (when ready and data is available). */
  dataUrl?: string;
  /** Dataset profile if data was fetched and profiled. */
  dataProfile?: DatasetProfile;
  /** Follow-up questions (max 2) when not ready. */
  questions?: ClarificationQuestion[];
  /** Warning when data is unavailable for the requested topic. */
  dataWarning?: string;
}

/** Request body for /api/ai/clarify. */
export interface ClarifyRequest {
  prompt: string;
  answers?: Record<string, string>;
}

// ─── Map patterns ────────────────────────────────────────────

/** A reusable map design pattern with defaults and validation rules. */
export interface MapPattern {
  id: string;
  family: MapFamily;
  name: string;
  description: string;
  /** Geometry types this pattern can render. */
  validGeometry: GeometryType[];
  /** Analytical tasks this pattern fits (e.g. "compare-regions", "show-density"). */
  validTasks: string[];
  /** Common mistakes to warn about. */
  antiPatterns: string[];
  /** Partial manifest template with sensible defaults for this pattern. */
  template: Partial<MapManifest>;
  /** Validation rules specific to this pattern. */
  validationRules: PatternValidationRule[];
}

export interface PatternValidationRule {
  id: string;
  severity: "error" | "warning";
  message: string;
  /** Returns true if the rule passes. */
  check: (manifest: MapManifest) => boolean;
}
