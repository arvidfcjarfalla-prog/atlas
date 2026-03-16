/**
 * AI-powered metric matching for PxWeb contents dimensions.
 *
 * When the deterministic keyword matcher in selectDimensions() fails
 * (score 0 on a contents dimension with 2+ values), this module uses
 * Haiku to pick the best matching value.
 *
 * Called from resolveOneTable() in pxweb-resolution.ts.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { PxDimensionValue } from "./pxweb-client";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 64;
const TIMEOUT_MS = 3_000;

/**
 * Build the prompt for AI metric matching.
 * Exported for testing.
 */
export function buildMetricMatchPrompt(
  prompt: string,
  values: PxDimensionValue[],
  tableLabel: string,
): { system: string; user: string } {
  const valueList = values
    .map((v) => `${v.code}: ${v.label}`)
    .join("\n");

  return {
    system:
      "You are a statistics metadata matcher. Given a user query and a list of metric labels from a statistical table, return ONLY the code of the metric that best matches the query. Output nothing else — just the code string.",
    user: `Table: ${tableLabel}\n\nUser query: ${prompt}\n\nAvailable metrics:\n${valueList}\n\nBest matching code:`,
  };
}

/**
 * Parse the AI response to extract a valid metric code.
 * Exported for testing.
 */
export function parseMetricMatchResponse(
  text: string,
  validCodes: string[],
): string | null {
  const trimmed = text.trim();

  // Direct match
  if (validCodes.includes(trimmed)) return trimmed;

  // Try extracting from surrounding text
  for (const code of validCodes) {
    if (trimmed.includes(code)) return code;
  }

  return null;
}

/**
 * Use Haiku to select the best matching contents value when
 * deterministic keyword matching fails.
 *
 * Returns the code of the best-matching value, or null on error/timeout.
 * Caller should fall back to the deterministic selection when null.
 */
export async function aiSelectContentsValue(
  prompt: string,
  values: PxDimensionValue[],
  tableLabel: string,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey });
    const { system, user } = buildMetricMatchPrompt(prompt, values, tableLabel);

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    if (!textBlock) return null;

    const validCodes = values.map((v) => v.code);
    return parseMetricMatchResponse(textBlock.text, validCodes);
  } catch {
    return null;
  }
}
