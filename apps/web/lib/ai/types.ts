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

// ─── Agency hint ────────────────────────────────────────────

export interface AgencyHint {
  agencyName: string;
  portalUrl: string;
  countryName: string;
  coverageTags: string[];
}

// ─── Clarification ──────────────────────────────────────────

export interface ClarificationQuestion {
  id: string;
  question: string;
  options?: string[];
  /** The single best default answer when the AI is ≥70% confident. */
  recommended?: string;
  aspect: "geography" | "metric" | "timeframe" | "data-source" | "visualization" | "basemap";
}

/**
 * Resolution status from the map pipeline.
 *
 * - "map_ready"    — data + geometry joined, can render a map
 * - "tabular_only" — data found but no geometry available or joinable
 *
 * Only set when the universal resolution pipeline was used.
 * Absent for legacy fast paths (catalog, World Bank, Overpass, etc.)
 * which predate the pipeline.
 */
export type ClarifyResolutionStatus = "map_ready" | "tabular_only";

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
  /**
   * Resolution status from the universal map pipeline.
   *
   * When present, indicates what the pipeline decided:
   * - "map_ready": safe to auto-generate a map
   * - "tabular_only": data exists but geometry join failed;
   *   frontend should NOT auto-generate a choropleth
   *
   * When absent, the response came from a legacy fast path and
   * `ready: true` has its original meaning (data URL resolved).
   */
  resolutionStatus?: ClarifyResolutionStatus;
  /** AI-generated follow-up prompt suggestions (tabular_only). */
  suggestions?: string[];
  /** Pipeline confidence 0-1. */
  confidence?: number;
  /** Join coverage ratio 0-1 (fraction of regions matched). */
  coverageRatio?: number;
  /** Geographic scope hint — tells generate-map to apply a filter. */
  scopeHint?: { region: string; filterField: string };
  /** Agency hint when a relevant source was identified but no adapter exists. */
  agencyHint?: AgencyHint;
}

/** Request body for /api/ai/clarify. */
export interface ClarifyRequest {
  prompt: string;
  answers?: Record<string, string>;
}

// ─── Case memory ─────────────────────────────────────────────

import type { QualityScore } from "./quality-scorer";

/** A refinement event logged when the user improves a generated map. */
export interface RefinementEvent {
  type: "chat" | "ui";
  action: string;
  detail: string;
  timestamp: string;
}

/** A suggested refinement surfaced to the user after generation. */
export interface RefinementSuggestion {
  label: string;
  promptSuffix: string;
  action: string;
  source: "quality-deduction" | "manifest-gap" | "default";
}

/** A saved record of a map generation for future retrieval/learning. */
export interface CaseRecord {
  id: string;
  /** Links to the parent case when this was generated via a refinement chip. */
  parentCaseId?: string;
  timestamp: string;
  prompt: string;
  clarifications?: {
    questions: { id: string; question: string }[];
    answers: Record<string, string>;
  };
  resolvedSource?: {
    url: string;
    source: string;
  };
  manifest: MapManifest;
  quality: QualityScore;
  attempts: number;
  outcome: "accepted" | "edited" | "reset";
  refinements: RefinementEvent[];
  /** Token usage from the AI generation. */
  usage?: { inputTokens: number; outputTokens: number };
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
