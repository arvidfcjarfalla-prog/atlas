/**
 * AI-powered follow-up suggestion generator.
 *
 * When PxWeb finds tabular data but no geometry join is possible
 * (tabular_only), this module generates 2-3 actionable prompt
 * suggestions the user can click to try alternative approaches.
 *
 * Called from the clarify route before surfacing the tabular fallback.
 */

import { generateText } from "ai";
import { MODELS } from "../ai-client";

const MAX_TOKENS = 256;

/**
 * Build the prompt for suggestion generation.
 * Exported for testing.
 */
export function buildSuggestionPrompt(
  originalPrompt: string,
  tableLabel: string,
  reasons: string[],
): { system: string; user: string } {
  const reasonSummary = reasons.length > 0
    ? `\nPipeline notes: ${reasons.slice(0, 3).join("; ")}`
    : "";

  return {
    system: `You are a geographic data assistant. The user asked for a map but we found statistical data ("${tableLabel}") that lacks map boundaries.

Generate exactly 3 short alternative prompt suggestions (under 15 words each) as a JSON array of strings. Focus on:
1. The same data at a different geographic level that might have geometry
2. A related topic that might be available with map boundaries
3. A different country or region where this data might be mappable

Rules:
- Output ONLY a JSON array, no other text
- Each suggestion must be a complete prompt the user can submit directly
- Do not suggest uploading data — only suggest map-ready prompts`,
    user: `Original prompt: ${originalPrompt}${reasonSummary}`,
  };
}

/**
 * Parse the AI response to extract suggestion strings.
 * Exported for testing.
 */
export function parseSuggestionResponse(text: string): string[] {
  try {
    // Try to parse as JSON array
    const trimmed = text.trim();
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) return [];

    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .slice(0, 3);
  } catch {
    return [];
  }
}

/**
 * Generate follow-up suggestions for tabular-only results.
 *
 * Returns 2-3 short actionable prompt suggestions, or [] on failure.
 */
export async function generateTabularSuggestions(
  originalPrompt: string,
  tableLabel: string,
  reasons: string[],
): Promise<string[]> {
  try {
    const { system, user } = buildSuggestionPrompt(
      originalPrompt,
      tableLabel,
      reasons,
    );

    const { text } = await generateText({
      model: MODELS.utility(),
      maxOutputTokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
    });

    return parseSuggestionResponse(text);
  } catch {
    return [];
  }
}

/**
 * Generate alternative prompt suggestions when data resolution fails entirely.
 *
 * Similar to tabular suggestions but for the general "no data found" case.
 * Suggests prompts that are as close as possible to what the user asked
 * but that Atlas can actually resolve (World Bank, Eurostat, Overpass, etc.).
 */
export async function generateAlternativeSuggestions(
  originalPrompt: string,
  warning?: string,
): Promise<string[]> {
  try {
    const system = `You are a geographic data assistant for Atlas, a mapping platform. The user asked for a map but we could not find the data.

Atlas can resolve these data sources automatically:
- World Bank: country-level stats (GDP, population, CO2, life expectancy, literacy, unemployment, etc.)
- Eurostat: European country-level stats (minimum wage, Gini, unemployment, etc.)
- Data Commons: subnational stats for US states, European NUTS regions
- Overpass/OSM: points of interest in cities (restaurants, parks, museums, hospitals, etc.)
- NASA EONET: active natural events (earthquakes, wildfires, volcanoes, storms)
- USGS: earthquake data

Generate exactly 3 short alternative prompt suggestions (under 15 words each) as a JSON array of strings. Each suggestion must be:
1. As close as possible to the user's original intent
2. Something Atlas can actually resolve with its built-in data sources
3. A complete prompt the user can submit directly

Rules:
- Output ONLY a JSON array, no other text
- Do not suggest uploading data
- Prefer the same geographic region if possible
- Prefer the same topic/metric at a different geographic level if possible`;

    const { text } = await generateText({
      model: MODELS.utility(),
      maxOutputTokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: `Original prompt: ${originalPrompt}${warning ? `\nReason for failure: ${warning}` : ""}` }],
    });

    return parseSuggestionResponse(text);
  } catch {
    return [];
  }
}
