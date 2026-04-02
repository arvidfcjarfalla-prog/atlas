/**
 * Shared AI model configuration.
 *
 * Centralises model selection so all call sites use consistent models.
 * Set `AI_UTILITY_MODEL=gemini` to switch utility calls to Gemini Flash.
 * Generation always uses Claude Sonnet for quality.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { generateText, type LanguageModel } from "ai";
import { logDiagnostic } from "../logger";

export const MODELS: {
  generation: () => LanguageModel;
  fallback: () => LanguageModel;
  utility: () => LanguageModel;
} = {
  /** Main map generation — needs best quality. */
  generation: () => anthropic("claude-sonnet-4-5-20250929"),

  /** Fallback for low quality scores (< 60) — stronger model, higher cost. */
  fallback: () => anthropic("claude-opus-4-5-20250918"),

  /** Fast utility tasks — intent extraction, metric matching, prompt enhancement. */
  utility: () =>
    process.env.AI_UTILITY_MODEL === "gemini"
      ? google("gemini-2.0-flash")
      : anthropic("claude-haiku-4-5-20251001"),
};

// ─── Retry with backoff ─────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrapper around `generateText` that retries on 429 (rate limit) errors
 * with exponential backoff. All other errors are thrown immediately.
 *
 * Backoff schedule: 1s → 2s → 4s (capped at 10s).
 */
export async function generateTextWithRetry(
  params: Parameters<typeof generateText>[0],
  maxAttempts = 3,
): Promise<Awaited<ReturnType<typeof generateText>>> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await generateText(params);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);

      // Only retry on rate limits — everything else is unrecoverable
      const isRateLimited = message.includes("429") || message.includes("rate");
      if (!isRateLimited || attempt === maxAttempts) {
        throw error;
      }

      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10_000);
      logDiagnostic("warning", "ai-client", "rate-limit", error, {
        attempt,
        delayMs: delay,
      });
      await sleep(delay);
    }
  }

  throw lastError;
}
