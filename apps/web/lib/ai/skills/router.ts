/**
 * Skill-based message classifiers for chat and generation pipelines.
 *
 * Fast regex/keyword matching — no LLM calls.
 */

import type { DatasetProfile } from "../types";

// ─── Types ───────────────────────────────────────────────────

export type ChatSkill = "style" | "data" | "insight" | "general";
export type GenSkill = "thematic" | "locational" | "flow" | "general";

// ─── Patterns ────────────────────────────────────────────────

// Note: trailing \b is omitted so prefixes match plurals (e.g. "colors", "restaurants").
const STYLE_KEYWORDS =
  /\b(colou?r|dark|light|basemap|zoom|pitch|famil(?:y|ies)|legend|label|opacit|filter|stroke|choropleth|heatmap|cluster|point|theme|scheme|gradient|night|hillshade|terrain|classification|class(?:es)?|fill|marker|extrusion|3d)/i;

const STYLE_ACTIONS =
  /\b(change|switch|make|set|increase|decrease|adjust|toggle|enable|disable|turn|use|try|apply)\b/i;

const DATA_KEYWORDS =
  /\b(show|find|search|gdp|population|unemploy|emission|data|restaurant|cafe|park|hospital|school|hotel|shop|store|museum|airport|station|income|poverty|temperature|rainfall|crime|accident|birth|death|fertility|literacy|trade|export|import)/i;

const GEO_TERMS =
  /\b(in|for|of|from|across)\s+[A-Z]/;

const URL_PATTERN =
  /https?:\/\/\S+/;

const INSIGHT_KEYWORDS =
  /\b(what|why|how|compare|explain|analy[sz]e|describe|interpret|insight|trend|pattern|distribution|highest|lowest|average|mean|median|outlier|correlation)\b/i;

const THEMATIC_KEYWORDS =
  /\b(rate|percent|gdp|unemploy|emission|choropleth|comparison|compar|index|ratio|density|per\s*capita|income|poverty|wage|salary|expectancy|mortality|fertility|literacy|gini|hdi|coefficient)/i;

const LOCATIONAL_KEYWORDS =
  /\b(restaurant|cafe|park|hospital|school|hotel|shop|store|museum|airport|station|place|location|point|poi|bar|pharmacy|gym|cinema|theater|library|church|mosque|temple|synagogue)/i;

const FLOW_KEYWORDS =
  /\b(route|trade|migration|flow|commut|travel|transport|ship|flight|movement|origin|destination|connection|corridor|network)/i;

// ─── Chat classifier ────────────────────────────────────────

/**
 * Classify a chat message into a skill for focused prompt + tool selection.
 *
 * @param message  - The user's chat message
 * @param hasData  - Whether the current map already has data loaded
 */
export function classifyChatSkill(message: string, hasData: boolean): ChatSkill {
  const lower = message.toLowerCase();

  // Style: must have both a style keyword AND either an action verb or hasData
  if (STYLE_KEYWORDS.test(lower) && STYLE_ACTIONS.test(lower) && hasData) {
    return "style";
  }

  // Insight: analytical questions about existing data
  if (INSIGHT_KEYWORDS.test(lower) && hasData) {
    // Exclude if it also matches data keywords strongly (user wants new data)
    if (!DATA_KEYWORDS.test(lower) || !GEO_TERMS.test(message)) {
      return "insight";
    }
  }

  // Data: searching for new data or POI
  if (DATA_KEYWORDS.test(lower) && (GEO_TERMS.test(message) || !hasData)) {
    return "data";
  }
  if (URL_PATTERN.test(message)) {
    return "data";
  }

  return "general";
}

// ─── Generation classifier ───────────────────────────────────

/**
 * Classify a generation prompt into a skill for system prompt trimming.
 *
 * @param prompt  - The user's map generation prompt
 * @param profile - Optional dataset profile (when data is pre-resolved)
 */
export function classifyGenSkill(
  prompt: string,
  profile?: DatasetProfile | null,
): GenSkill {
  const lower = prompt.toLowerCase();
  const geo = profile?.geometryType;

  // Geometry-based classification when profile is available
  if (geo === "LineString" || geo === "MultiLineString") {
    return "flow";
  }
  if (FLOW_KEYWORDS.test(lower)) {
    return "flow";
  }

  if (geo === "Point" || geo === "MultiPoint") {
    // Point data — but thematic keywords override (user might want proportional-symbol)
    if (THEMATIC_KEYWORDS.test(lower)) {
      return "thematic";
    }
    return "locational";
  }

  if (geo === "Polygon" || geo === "MultiPolygon") {
    return "thematic";
  }

  // No profile — classify from prompt keywords
  if (THEMATIC_KEYWORDS.test(lower)) {
    return "thematic";
  }
  if (LOCATIONAL_KEYWORDS.test(lower)) {
    return "locational";
  }

  return "general";
}
