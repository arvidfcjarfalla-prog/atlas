/**
 * AI-powered follow-up suggestion generator.
 *
 * When PxWeb finds tabular data but no geometry join is possible
 * (tabular_only), this module generates 2-3 actionable prompt
 * suggestions the user can click to try alternative approaches.
 *
 * Called from the clarify route before surfacing the tabular fallback.
 */

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 256;
const TIMEOUT_MS = 3_000;

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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  try {
    const client = new Anthropic({ apiKey });
    const { system, user } = buildSuggestionPrompt(
      originalPrompt,
      tableLabel,
      reasons,
    );

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    if (!textBlock) return [];

    return parseSuggestionResponse(textBlock.text);
  } catch {
    return [];
  }
}
