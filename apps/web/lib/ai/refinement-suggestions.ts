/**
 * Derives user-facing refinement suggestions from quality deductions
 * and manifest gaps. Max 3 suggestions, prioritized by impact.
 */

import type { MapManifest } from "@atlas/data-models";
import type { QualityScore } from "./quality-scorer";
import type { RefinementSuggestion } from "./types";

interface SuggestionRule {
  /** Substring to match against quality deductions. */
  match: string;
  suggestion: RefinementSuggestion;
  /** Points lost — higher = more impactful, shown first. */
  weight: number;
}

const DEDUCTION_RULES: SuggestionRule[] = [
  {
    match: "Choropleth without normalization",
    suggestion: {
      label: "Compare fairly by population",
      promptSuffix: "Normalize the choropleth per capita so regions are comparable.",
      action: "add-normalization",
      source: "quality-deduction",
    },
    weight: 10,
  },
  {
    match: "Categorical scheme",
    suggestion: {
      label: "Use a sequential color scheme",
      promptSuffix: "Use the viridis color scheme for sequential data.",
      action: "change-color-scheme",
      source: "quality-deduction",
    },
    weight: 10,
  },
  {
    match: "Sequential/diverging scheme",
    suggestion: {
      label: "Use categorical colors",
      promptSuffix: "Use the set2 color scheme for categorical data.",
      action: "change-color-scheme",
      source: "quality-deduction",
    },
    weight: 5,
  },
  {
    match: "No classification specified",
    suggestion: {
      label: "Add data classification",
      promptSuffix: "Add quantile classification with 5 classes.",
      action: "add-classification",
      source: "quality-deduction",
    },
    weight: 15,
  },
  {
    match: "classes — 3–7 is recommended",
    suggestion: {
      label: "Use 5 classes instead",
      promptSuffix: "Use 5 classification classes for better readability.",
      action: "adjust-classes",
      source: "quality-deduction",
    },
    weight: 5,
  },
  {
    match: "Colorblind safety is disabled",
    suggestion: {
      label: "Enable colorblind-safe colors",
      promptSuffix: "Use a colorblind-safe color scheme.",
      action: "enable-colorblind-safe",
      source: "quality-deduction",
    },
    weight: 10,
  },
  {
    match: "Legend is missing a title",
    suggestion: {
      label: "Add a legend title",
      promptSuffix: "Include a descriptive legend title.",
      action: "add-legend-title",
      source: "quality-deduction",
    },
    weight: 5,
  },
  {
    match: "Legend is missing a type",
    suggestion: {
      label: "Add a legend",
      promptSuffix: "Include a complete legend with title and type.",
      action: "add-legend",
      source: "quality-deduction",
    },
    weight: 5,
  },
  {
    match: "is not appropriate for",
    suggestion: {
      label: "Switch to a better map type",
      promptSuffix: "Choose the map family that best fits the geometry type of the data.",
      action: "change-family",
      source: "quality-deduction",
    },
    weight: 25,
  },
  {
    match: "is unusual for",
    suggestion: {
      label: "Try a different map type",
      promptSuffix: "Choose the map family that best fits the geometry type of the data.",
      action: "change-family",
      source: "quality-deduction",
    },
    weight: 10,
  },
];

const MAX_SUGGESTIONS = 3;
const QUALITY_GOOD_ENOUGH = 85;

/**
 * Derive up to 3 refinement suggestions from quality score and manifest state.
 * Returns empty array if quality is already good (≥85).
 */
export function getSuggestions(
  quality: QualityScore,
  manifest: MapManifest,
): RefinementSuggestion[] {
  if (quality.total >= QUALITY_GOOD_ENOUGH) return [];

  const matched: { suggestion: RefinementSuggestion; weight: number }[] = [];

  // Match deductions to suggestion rules
  for (const deduction of quality.deductions) {
    for (const rule of DEDUCTION_RULES) {
      if (deduction.includes(rule.match)) {
        // Avoid duplicate actions
        if (!matched.some((m) => m.suggestion.action === rule.suggestion.action)) {
          matched.push({ suggestion: rule.suggestion, weight: rule.weight });
        }
        break;
      }
    }
  }

  // Check for manifest gaps not covered by deductions
  const layer = manifest.layers?.[0];
  if (layer && !layer.interaction?.tooltipFields?.length) {
    if (!matched.some((m) => m.suggestion.action === "add-tooltips")) {
      matched.push({
        suggestion: {
          label: "Add hover tooltips",
          promptSuffix: "Add tooltips that show key data fields on hover.",
          action: "add-tooltips",
          source: "manifest-gap",
        },
        weight: 3,
      });
    }
  }

  if (!manifest.description) {
    if (!matched.some((m) => m.suggestion.action === "add-description")) {
      matched.push({
        suggestion: {
          label: "Add a map description",
          promptSuffix: "Include a concise description explaining what this map shows.",
          action: "add-description",
          source: "manifest-gap",
        },
        weight: 2,
      });
    }
  }

  // Sort by weight (highest impact first), take top 3
  matched.sort((a, b) => b.weight - a.weight);
  return matched.slice(0, MAX_SUGGESTIONS).map((m) => m.suggestion);
}
