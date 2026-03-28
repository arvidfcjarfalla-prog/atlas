/**
 * Pure classification logic for clarify responses.
 *
 * Decides what the create page should do after receiving a
 * ClarifyResponse from the /api/ai/clarify endpoint.
 *
 * Extracted from the page component so it can be unit-tested
 * without React rendering.
 */

import type {
  ClarifyResponse,
  ClarificationQuestion,
  DatasetProfile,
} from "./types";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** Auto-generate a map — data + geometry resolved. */
export interface GenerateAction {
  kind: "generate";
  resolvedPrompt: string;
  dataUrl: string | null;
  dataProfile: DatasetProfile | null;
  /** Join coverage ratio 0-1, if available. */
  coverageRatio: number | null;
  /** Geographic scope hint — tells generate-map to filter by region. */
  scopeHint: { region: string; filterField: string } | null;
}

/** Data found but not mappable — show warning with suggestions, stay in prompt state. */
export interface TabularWarningAction {
  kind: "tabular_warning";
  message: string;
  /** AI-generated follow-up prompt suggestions. */
  suggestions: string[];
}

/** Need more info — show clarification questions. */
export interface AskQuestionsAction {
  kind: "ask_questions";
  questions: ClarificationQuestion[];
  warning: string | null;
}

/** All questions have recommended answers — auto-submit them. */
export interface AutoAnswerAction {
  kind: "auto_answer";
  answers: Record<string, string>;
}

/** What the create page should do after a clarify response. */
export type ClarifyAction =
  | GenerateAction
  | TabularWarningAction
  | AskQuestionsAction
  | AutoAnswerAction;

// ═══════════════════════════════════════════════════════════════
// Decision function
// ═══════════════════════════════════════════════════════════════

/**
 * Decide what the create page should do with a clarify response.
 *
 * @param data - The ClarifyResponse from the API
 * @param fallbackPrompt - Used when data.resolvedPrompt is absent
 */
export function decideClarifyAction(
  data: ClarifyResponse,
  fallbackPrompt: string,
): ClarifyAction {
  if (data.ready) {
    // tabular_only: data found but no geometry join possible.
    // Do NOT auto-generate — show a warning instead.
    if (data.resolutionStatus === "tabular_only") {
      return {
        kind: "tabular_warning",
        message:
          "Atlas found statistical data matching your query, but could not join it to map boundaries. You can upload your own GeoJSON or try a prompt that targets a supported region.",
        suggestions: data.suggestions ?? [],
      };
    }

    // map_ready or absent (legacy paths) — auto-generate
    return {
      kind: "generate",
      resolvedPrompt: data.resolvedPrompt ?? fallbackPrompt,
      dataUrl: data.dataUrl ?? null,
      dataProfile: data.dataProfile ?? null,
      coverageRatio: data.coverageRatio ?? null,
      scopeHint: data.scopeHint ?? null,
    };
  }

  // Not ready — show alternative suggestions if available.
  // Suggestions are preferred over clarification questions because
  // they let the user pick a working prompt with one click.
  const suggestions = data.suggestions ?? [];
  if (suggestions.length > 0 || data.dataWarning) {
    return {
      kind: "tabular_warning",
      message: data.dataWarning ?? "Atlas kunde inte hitta data för din sökning.",
      suggestions,
    };
  }

  const questions = data.questions ?? [];

  // If every question has a recommended answer and there's no warning
  // that the user should see, auto-submit the recommended answers
  // to skip the question step entirely.
  if (
    questions.length > 0 &&
    questions.every((q) => q.recommended)
  ) {
    const answers: Record<string, string> = {};
    for (const q of questions) {
      answers[q.id] = q.recommended!;
    }
    return { kind: "auto_answer", answers };
  }

  return {
    kind: "ask_questions",
    questions,
    warning: null,
  };
}
