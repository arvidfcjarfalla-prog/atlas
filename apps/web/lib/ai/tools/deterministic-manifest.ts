/**
 * Deterministic manifest generator for PxWeb statistical data.
 *
 * Replaces the AI generation step for any source that produces
 * joined polygon GeoJSON with _atlas_value:
 *   NormalizedSourceResult + DatasetProfile + dataUrl → MapManifest
 *
 * No AI calls. Sub-second. Computed classification from actual data profile.
 *
 * Scope: choropleth only (single time period). The join pipeline currently
 * collapses multi-year data to "first", so timeline is not supported yet.
 */

import type { MapManifest, LayerManifest, ColorScheme, ClassificationMethod } from "@atlas/data-models";
import type { DatasetProfile, AttributeProfile } from "../types";
import type { NormalizedSourceResult } from "./normalized-result";

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

export interface DeterministicManifestInput {
  normalized: NormalizedSourceResult;
  profile: DatasetProfile;
  dataUrl: string;
  /** Original user prompt (for intent tracking). */
  prompt?: string;
}

export interface DeterministicManifestResult {
  manifest: MapManifest;
  /** Why the deterministic path was chosen over AI. */
  reasons: string[];
}

/**
 * Check whether a NormalizedSourceResult is eligible for the
 * deterministic (no-AI) path.
 *
 * Source-agnostic: any source that produced a joined polygon
 * GeoJSON with _atlas_value qualifies.
 */
export function canGenerateDeterministic(
  _normalized: NormalizedSourceResult, // reserved for future source-specific checks
  profile: DatasetProfile,
): boolean {
  // Must have polygon geometry (choropleth territory)
  const geo = profile.geometryType;
  if (geo !== "Polygon" && geo !== "MultiPolygon") return false;

  // Must have the _atlas_value field (join pipeline sets this)
  if (!profile.attributes.some((a) => a.name === "_atlas_value")) return false;

  // Must have enough features for a meaningful choropleth
  if (profile.featureCount < 5) return false;

  return true;
}

/**
 * Generate a MapManifest deterministically from statistical data.
 *
 * Assumes `canGenerateDeterministic()` returned true.
 */
export function generateDeterministicManifest(
  input: DeterministicManifestInput,
): DeterministicManifestResult {
  const { normalized, profile, dataUrl, prompt } = input;
  const reasons: string[] = [];
  const lang = normalized.sourceMetadata.language ?? "en";
  const sourceName = normalized.sourceMetadata.sourceName || "Statistics";

  const tableLabel = normalized.sourceMetadata.tableLabel ?? "Statistical data";
  const metricLabel = pickMetricLabel(normalized);
  const timeDim = normalized.dimensions.find((d) => d.role === "time");
  const latestTime = timeDim?.values[timeDim.values.length - 1]?.code;
  const unit = detectUnit(metricLabel, tableLabel);

  reasons.push(`Choropleth: polygon geometry, ${sourceName}`);

  const valueAttr = profile.attributes.find((a) => a.name === "_atlas_value");
  const classification = computeClassification(valueAttr, profile.featureCount);
  reasons.push(
    `Classification: ${classification.method} with ${classification.classes} classes`,
  );

  const scheme = chooseColorScheme(valueAttr, unit);
  reasons.push(`Color scheme: ${scheme}`);

  const title = cleanTitle(tableLabel, metricLabel, lang);

  const bounds = profile.bounds;
  const center: [number, number] = [
    (bounds[0][0] + bounds[1][0]) / 2,
    (bounds[0][1] + bounds[1][1]) / 2,
  ];
  const zoom = computeZoom(bounds);
  const tooltipFields = buildTooltipFields(profile);

  const layer: LayerManifest = {
    id: "data",
    kind: "zone",
    label: metricLabel,
    sourceType: "geojson-url",
    sourceUrl: dataUrl,
    geometryType: "polygon",
    style: {
      markerShape: "circle", // required by LayerStyle type, unused for choropleth
      mapFamily: "choropleth",
      colorField: "_atlas_value",
      classification,
      color: {
        scheme,
        colorblindSafe: true,
      },
      fillOpacity: 0.85,
      strokeColor: "rgba(255,255,255,0.3)",
      strokeWidth: 0.5,
    },
    legend: {
      title: legendTitle(metricLabel, unit),
      type: "gradient",
    },
    interaction: {
      tooltipFields,
      clickBehavior: "detail-panel",
      hoverEffect: "highlight",
    },
  };

  const manifest: MapManifest = {
    id: crypto.randomUUID(),
    title,
    description: buildDescription(normalized, metricLabel, latestTime),
    theme: "editorial",
    defaultCenter: center,
    defaultZoom: zoom,
    defaultBounds: [
      [bounds[0][0], bounds[0][1]],
      [bounds[1][0], bounds[1][1]],
    ],
    layers: [layer],
    version: 2,
    basemap: { style: "dark" },
    modules: {
      legend: true,
      detailPanel: true,
    },
    accessibility: {
      colorblindSafe: true,
    },
    ...(prompt
      ? {
          intent: {
            userPrompt: prompt,
            taskType: "regional-comparison",
            confidence: 1.0,
            assumptions: ["Deterministic path — no AI generation"],
          },
        }
      : {}),
  };

  return { manifest, reasons };
}

// ═══════════════════════════════════════════════════════════════
// Internal helpers (exported for testing)
// ═══════════════════════════════════════════════════════════════

/** Pick the best metric label from the normalized result. */
export function pickMetricLabel(normalized: NormalizedSourceResult): string {
  const metricDim = normalized.dimensions.find((d) => d.role === "metric");
  if (metricDim && metricDim.values.length > 0) {
    return metricDim.values[0].label;
  }
  if (normalized.candidateMetricFields.length > 0) {
    return normalized.candidateMetricFields[0];
  }
  return "Value";
}

/**
 * Detect the unit from metric/table label strings.
 * Multilingual: covers Nordic, Baltic, Swiss, Slovenian, and English.
 */
export function detectUnit(metricLabel: string, tableLabel: string): string {
  const combined = `${metricLabel} ${tableLabel}`.toLowerCase();

  // Percentage (all languages)
  if (/procent|percent|prosent|prosenttia|prósent|protsent|procents|odstotek|%|andel|osuus|hlutfall/.test(combined)) return "%";

  // Per 1000
  if (/per\s*1[\s.]?000/.test(combined)) return "per 1 000";

  // Per capita
  if (/per\s*capita|invånare|innbygger|asukasta|íbúa|elaniku|iedzīvotāju|prebivalca/.test(combined)) return "per capita";

  // Currencies — return ISO code
  if (/kronor|\bsek\b/.test(combined)) return "SEK";
  if (/kroner|\bnok\b/.test(combined)) return "NOK";
  if (/krónur|\bisk\b/.test(combined)) return "ISK";
  if (/franken|franc[si]?\b|\bchf\b/.test(combined)) return "CHF";
  if (/\beur\b|eurot?|eiro/.test(combined)) return "EUR";
  if (/\busd\b|dollar/.test(combined)) return "USD";
  if (/\bgbp\b|pound/.test(combined)) return "GBP";

  // Count / number (return empty — no unit suffix needed)
  if (/antal|number|count|antall|lukumäärä|fjöldi|arv|skaits|število/.test(combined)) return "";

  return "";
}

/** Compute classification method and class count from the data profile. */
export function computeClassification(
  valueAttr: AttributeProfile | undefined,
  featureCount: number,
): {
  method: ClassificationMethod;
  classes: number;
} {
  const classes = featureCount < 20 ? 4 : 5;

  if (!valueAttr || valueAttr.type !== "number" || valueAttr.min == null || valueAttr.max == null) {
    return { method: "quantile", classes };
  }

  if (valueAttr.min === valueAttr.max) {
    return { method: "equal-interval", classes: 2 };
  }

  if (valueAttr.distribution === "skewed-right" || valueAttr.distribution === "skewed-left") {
    return { method: "natural-breaks", classes };
  }

  return { method: "quantile", classes };
}

/** Choose a color scheme based on data characteristics. */
export function chooseColorScheme(
  valueAttr: AttributeProfile | undefined,
  unit: string,
): ColorScheme {
  if (valueAttr && valueAttr.min != null && valueAttr.min < 0) {
    return "blue-red";
  }
  if (unit === "%" || unit === "per capita" || unit === "per 1 000") {
    return "viridis";
  }
  // Currency — warm tones
  if (["SEK", "NOK", "ISK", "CHF", "EUR", "USD", "GBP"].includes(unit)) {
    return "oranges";
  }
  return "blues";
}

/**
 * Clean up statistical table labels into readable titles.
 * Strips language-specific "by region, age and sex" suffixes.
 */
const DIMENSION_SUFFIX: Record<string, RegExp> = {
  sv: /\s*efter\s+.*/i,
  no: /\s*etter\s+.*/i,
  nn: /\s*etter\s+.*/i,
  en: /\s*,?\s*by\s+.*/i,
  de: /\s*nach\s+.*/i,
  fr: /\s*,?\s*par\s+.*/i,
  fi: /\s*(?:mukaan|alueittain)\b.*/i,
  is: /\s*eftir\s+.*/i,
  et: /\s*(?:järgi|piirkonna)\b.*/i,
  lv: /\s*pēc\s+.*/i,
  sl: /\s*po\s+.*/i,
};

export function cleanTitle(tableLabel: string, metricLabel: string, lang?: string): string {
  let title = tableLabel;

  // Language-specific dimension suffix removal
  const pattern = lang ? DIMENSION_SUFFIX[lang] : undefined;
  if (pattern) {
    title = title.replace(pattern, "");
  } else {
    // Generic fallback: try all patterns
    for (const re of Object.values(DIMENSION_SUFFIX)) {
      const cleaned = title.replace(re, "");
      if (cleaned !== title) {
        title = cleaned;
        break;
      }
    }
  }

  // Remove trailing year patterns ". År 2023", ", 2020-2023", ". Year 2024"
  title = title.replace(/[.,]\s*(?:år|year|vuosi|ár|aasta|gads|leto)?\s*\d{4}[\s–-]*\d{0,4}\s*$/i, "");

  // Remove leading table ID patterns "TAB694: " or "05810: "
  title = title.replace(/^[\w]+:\s*/, "");

  // Remove trailing whitespace and periods
  title = title.replace(/[\s.]+$/, "");

  // Fallback: if too long or empty, use metric label
  if (title.length > 60 || !title) {
    title = metricLabel;
  }

  return title;
}

/** Build a human-readable description. */
function buildDescription(
  normalized: NormalizedSourceResult,
  metricLabel: string,
  latestTime?: string,
): string {
  const source = normalized.sourceMetadata.sourceName || "Statistics";
  const table = normalized.sourceMetadata.tableLabel || "";

  const parts = [metricLabel];
  if (latestTime) parts.push(latestTime);
  parts.push(`Source: ${source}`);
  if (table) parts.push(`Table: ${table}`);

  return parts.join(". ");
}

/** Build legend title with unit. */
function legendTitle(metricLabel: string, unit: string): string {
  if (unit) return `${metricLabel} (${unit})`;
  return metricLabel;
}

/** Compute appropriate zoom level from bounding box. */
export function computeZoom(bounds: [[number, number], [number, number]]): number {
  const latSpan = Math.abs(bounds[1][0] - bounds[0][0]);
  const lngSpan = Math.abs(bounds[1][1] - bounds[0][1]);
  const maxSpan = Math.max(latSpan, lngSpan);

  if (maxSpan > 100) return 2;
  if (maxSpan > 50) return 3;
  if (maxSpan > 20) return 4;
  if (maxSpan > 10) return 5;
  if (maxSpan > 5) return 6;
  if (maxSpan > 2) return 7;
  if (maxSpan > 1) return 8;
  return 9;
}

/** Build tooltip fields from profile. */
function buildTooltipFields(profile: DatasetProfile): string[] {
  const fields: string[] = [];

  const nameAttr = profile.attributes.find(
    (a) => a.name === "name" || a.name === "NAME" || a.name === "namn",
  );
  if (nameAttr) fields.push(nameAttr.name);

  fields.push("_atlas_value");

  return fields;
}
