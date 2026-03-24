/**
 * AI-powered metric matching for PxWeb contents dimensions.
 *
 * When the deterministic keyword matcher in selectDimensions() fails
 * (score 0 on a contents dimension with 2+ values), this module uses
 * a utility model to pick the best matching value.
 *
 * Called from resolveOneTable() in pxweb-resolution.ts.
 */

import { generateText } from "ai";
import { MODELS } from "../ai-client";
import type { PxDimensionValue, PxTableInfo } from "./pxweb-client";

const MAX_TOKENS = 64;
const MAX_TOKENS_TABLE = 32;
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
 * Use AI to select the best matching contents value when
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
  try {
    const { system, user } = buildMetricMatchPrompt(prompt, values, tableLabel);

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), TIMEOUT_MS),
    );
    const aiPromise = generateText({
      model: MODELS.utility(),
      maxOutputTokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
    }).then((r) => r.text);

    const text = await Promise.race([aiPromise, timeoutPromise]);
    if (!text) return null;

    const validCodes = values.map((v) => v.code);
    return parseMetricMatchResponse(text, validCodes);
  } catch {
    return null;
  }
}

/**
 * Use AI to select the best statistical table for a user prompt.
 *
 * Given a shortlist of candidate tables (id + label), returns the id of
 * the table whose subject best matches the prompt. Falls back to null on
 * error so the caller can use the deterministic rank order instead.
 */
export async function aiSelectTable(
  prompt: string,
  tables: PxTableInfo[],
  geoLevelHint?: string | null,
  preferredIds?: string[],
): Promise<string | null> {
  if (tables.length === 0) return null;
  if (tables.length === 1) return tables[0].id;

  const tableList = tables
    .map((t) => {
      const vars = t.variableNames?.length ? ` [dims: ${t.variableNames.join(", ")}]` : "";
      return `${t.id}: ${t.label}${vars}`;
    })
    .join("\n");

  const geoHint = geoLevelHint
    ? ` The user wants data at the ${geoLevelHint} geographic level — prefer tables with a matching region dimension (e.g. "(K)" for municipality, "(F)" for county/fylke).`
    : "";

  const preferenceHint =
    preferredIds && preferredIds.length > 0
      ? ` The following table IDs are authoritative canonical choices for this topic from the national statistics plugin: [${preferredIds.join(", ")}]. Prefer one of these unless you have strong reason to believe a different table is a clearly better match for the query.`
      : "";

  const system =
    `You are a statistics metadata selector. Given a user query and a list of statistical tables (with their dimension names), return ONLY the table ID that best matches what the user wants to map. Prefer tables whose subject directly matches the query topic, not tables where the topic appears only as a breakdown dimension.${geoHint}${preferenceHint} Output nothing else — just the ID string.`;
  const user = `User query: ${prompt}\n\nAvailable tables:\n${tableList}\n\nBest matching table ID:`;

  try {
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), TIMEOUT_MS),
    );
    const aiPromise = generateText({
      model: MODELS.utility(),
      maxOutputTokens: MAX_TOKENS_TABLE,
      system,
      messages: [{ role: "user", content: user }],
    }).then((r) => r.text);

    const text = await Promise.race([aiPromise, timeoutPromise]);
    if (!text) return null;

    const trimmed = text.trim();
    const validIds = tables.map((t) => t.id);

    if (validIds.includes(trimmed)) return trimmed;
    // Try to find any valid ID mentioned in the response
    for (const id of validIds) {
      if (trimmed.includes(id)) return id;
    }
    return null;
  } catch {
    return null;
  }
}
