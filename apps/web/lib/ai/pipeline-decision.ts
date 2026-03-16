/**
 * Pipeline decision tree.
 *
 * Pure functions that map a PxWebResolutionResult into a concrete
 * routing decision: terminate the pipeline (map_ready), stash for
 * later (tabular_only), or continue to the next source.
 *
 * Extracted from the clarify route so the decision logic is testable
 * without Next.js runtime.
 *
 * Core invariant: only map_ready with a valid cacheKey terminates
 * the map pipeline. Everything else continues to fallback sources.
 */

import type { ClarifyResponse, DatasetProfile } from "./types";
import type { PxWebResolutionResult } from "./tools/pxweb-resolution";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** Data stashed from a tabular-only result for potential later use. */
export interface TabularStash {
  dataUrl: string;
  profile?: DatasetProfile;
  /** Table label from PxWeb, for suggestion generation context. */
  tableLabel?: string;
  /** Pipeline reasons for context. */
  reasons?: string[];
  /** Pipeline confidence 0-1. */
  confidence?: number;
}

/** Terminate the pipeline — data + geometry resolved, send response. */
export interface TerminateDecision {
  kind: "terminate";
  response: ClarifyResponse;
}

/** Stash tabular data — data exists but no geometry, try other sources first. */
export interface StashTabularDecision {
  kind: "stash_tabular";
  stash: TabularStash;
}

/** Continue — no usable result from this source, try next source. */
export interface ContinueDecision {
  kind: "continue";
}

/**
 * What the route should do with a pipeline result.
 *
 * - terminate: send the response immediately (map_ready)
 * - stash_tabular: hold data aside, surface later if all map-capable sources fail
 * - continue: this source produced nothing actionable, try next
 */
export type PipelineDecision =
  | TerminateDecision
  | StashTabularDecision
  | ContinueDecision;

// ═══════════════════════════════════════════════════════════════
// Decision function
// ═══════════════════════════════════════════════════════════════

/**
 * Classify a pipeline result into a routing decision.
 *
 * Rules:
 *   map_ready    + cacheKey → terminate (send map response)
 *   map_ready    - cacheKey → continue  (can't serve without cache)
 *   tabular_only + cacheKey → stash     (hold for fallback)
 *   tabular_only - cacheKey → continue  (nothing to stash)
 *   candidate_mode          → continue  (user must pick; not automated yet)
 *   unsupported             → continue  (try next source)
 *
 * @param result - The resolution result from the pipeline
 * @param resolvedPrompt - The full context prompt for the response
 */
export function classifyPipelineResult(
  result: PxWebResolutionResult,
  resolvedPrompt: string,
): PipelineDecision {
  // ── map_ready: only status that terminates the pipeline ────
  if (result.status === "map_ready") {
    if (!result.cacheKey) {
      // Map-ready but no cache → can't serve data, continue
      return { kind: "continue" };
    }
    const dataUrl = `/api/geo/cached/${encodeURIComponent(result.cacheKey)}`;
    const coverageRatio = result.joinExecution?.diagnostics?.coverageRatio;
    return {
      kind: "terminate",
      response: {
        ready: true,
        resolvedPrompt,
        dataUrl,
        dataProfile: result.profile,
        resolutionStatus: "map_ready",
        confidence: result.confidence,
        ...(coverageRatio != null ? { coverageRatio } : {}),
      },
    };
  }

  // ── tabular_only: stash for potential later use ────────────
  if (result.status === "tabular_only") {
    if (!result.cacheKey) {
      return { kind: "continue" };
    }
    // Extract table label from normalized result for suggestion generation
    const tableLabel = result.normalized?.sourceMetadata?.tableLabel;
    return {
      kind: "stash_tabular",
      stash: {
        dataUrl: `/api/geo/cached/${encodeURIComponent(result.cacheKey)}`,
        profile: result.profile,
        tableLabel: typeof tableLabel === "string" ? tableLabel : undefined,
        reasons: result.reasons,
        confidence: result.confidence,
      },
    };
  }

  // ── candidate_mode and unsupported: continue ──────────────
  return { kind: "continue" };
}

// ═══════════════════════════════════════════════════════════════
// Tabular fallback response builder
// ═══════════════════════════════════════════════════════════════

/**
 * Build a ClarifyResponse from a stashed tabular result.
 *
 * Called after ALL map-capable fast paths have been exhausted.
 * Sets `resolutionStatus: "tabular_only"` so the frontend knows
 * this is NOT a map-ready result and should not auto-generate.
 */
export function buildTabularFallbackResponse(
  stash: TabularStash,
  resolvedPrompt: string,
  suggestions?: string[],
): ClarifyResponse {
  return {
    ready: true,
    resolvedPrompt,
    dataUrl: stash.dataUrl,
    dataProfile: stash.profile,
    resolutionStatus: "tabular_only",
    confidence: stash.confidence,
    ...(suggestions && suggestions.length > 0 ? { suggestions } : {}),
  };
}
