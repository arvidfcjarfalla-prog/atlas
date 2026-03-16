/**
 * Cache correctness tests for the PxWeb resolution path.
 *
 * Ensures cached results do not overstate map readiness:
 *   - Only entries with explicit resolutionStatus:"map_ready" stay map_ready
 *   - Legacy entries (no status) and tabular_only entries downgrade
 *   - Cache hits preserve safety invariants from pipeline-decision
 */

import { describe, it, expect } from "vitest";
import { resolveFromCache } from "../tools/pxweb-resolution";
import { classifyPipelineResult } from "../pipeline-decision";
import type { CacheEntry } from "../tools/data-search";
import type { DatasetProfile } from "../types";

// ═══════════════════════════════════════════════════════════════
// Test helpers
// ═══════════════════════════════════════════════════════════════

function makeProfile(): DatasetProfile {
  return {
    featureCount: 5,
    geometryType: "Polygon",
    bounds: [[55, 11], [69, 24]],
    crs: null,
    attributes: [
      { name: "value", type: "number", min: 100, max: 900, nullCount: 0, uniqueValues: 5 },
    ],
  };
}

function makeFC(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { code: "SWE", value: 500 },
        geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      },
    ],
  };
}

function makeCacheEntry(overrides?: Partial<CacheEntry>): CacheEntry {
  return {
    data: makeFC(),
    profile: makeProfile(),
    source: "SCB",
    description: "Population by municipality (SCB)",
    timestamp: Date.now(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// resolveFromCache
// ═══════════════════════════════════════════════════════════════

describe("resolveFromCache", () => {
  it("returns map_ready for cache entry with resolutionStatus:map_ready", () => {
    const cached = makeCacheEntry({ resolutionStatus: "map_ready" });
    const result = resolveFromCache(cached, "pxweb-se-scb-BE0101A");

    expect(result.status).toBe("map_ready");
    expect(result.confidence).toBe(0.6);
    expect(result.cacheKey).toBe("pxweb-se-scb-BE0101A");
    expect(result.profile).toBe(cached.profile);
    expect(result.reasons[0]).toContain("validated map-ready");
  });

  it("returns tabular_only for cache entry with resolutionStatus:tabular_only", () => {
    const cached = makeCacheEntry({ resolutionStatus: "tabular_only" });
    const result = resolveFromCache(cached, "pxweb-se-scb-BE0101A");

    expect(result.status).toBe("tabular_only");
    expect(result.confidence).toBe(0.3);
    expect(result.reasons[0]).toContain("not validated as map-ready");
  });

  it("downgrades legacy cache entry without resolutionStatus to tabular_only", () => {
    // Simulate a pre-fix cached entry with no resolutionStatus field
    const cached = makeCacheEntry();
    delete (cached as Partial<CacheEntry>).resolutionStatus;

    const result = resolveFromCache(cached, "pxweb-se-scb-test");

    expect(result.status).toBe("tabular_only");
    expect(result.confidence).toBe(0.3);
    expect(result.reasons[0]).toContain("not validated as map-ready");
  });

  it("preserves cacheKey in the result", () => {
    const cached = makeCacheEntry({ resolutionStatus: "map_ready" });
    const result = resolveFromCache(cached, "my-key");

    expect(result.cacheKey).toBe("my-key");
  });

  it("preserves profile in the result", () => {
    const profile = makeProfile();
    const cached = makeCacheEntry({ resolutionStatus: "map_ready", profile });
    const result = resolveFromCache(cached, "key");

    expect(result.profile).toBe(profile);
  });
});

// ═══════════════════════════════════════════════════════════════
// Pipeline decision integration (cache → route safety)
// ═══════════════════════════════════════════════════════════════

describe("cache → pipeline decision safety", () => {
  it("cached map_ready with cacheKey terminates pipeline", () => {
    const cached = makeCacheEntry({ resolutionStatus: "map_ready" });
    const result = resolveFromCache(cached, "pxweb-se-scb-BE0101A");
    const decision = classifyPipelineResult(result, "population Sweden");

    expect(decision.kind).toBe("terminate");
    if (decision.kind === "terminate") {
      expect(decision.response.resolutionStatus).toBe("map_ready");
    }
  });

  it("cached tabular_only with cacheKey stashes for fallback", () => {
    const cached = makeCacheEntry({ resolutionStatus: "tabular_only" });
    const result = resolveFromCache(cached, "pxweb-se-scb-BE0101A");
    const decision = classifyPipelineResult(result, "population Sweden");

    expect(decision.kind).toBe("stash_tabular");
  });

  it("cached tabular_only does NOT terminate pipeline as map_ready", () => {
    const cached = makeCacheEntry({ resolutionStatus: "tabular_only" });
    const result = resolveFromCache(cached, "pxweb-se-scb-BE0101A");
    const decision = classifyPipelineResult(result, "population Sweden");

    expect(decision.kind).not.toBe("terminate");
  });

  it("legacy cache entry (no status) does NOT terminate pipeline as map_ready", () => {
    const cached = makeCacheEntry();
    delete (cached as Partial<CacheEntry>).resolutionStatus;
    const result = resolveFromCache(cached, "pxweb-se-scb-BE0101A");
    const decision = classifyPipelineResult(result, "test prompt");

    // Must be stash_tabular (has cacheKey) — NOT terminate
    expect(decision.kind).toBe("stash_tabular");
  });

  it("cached map_ready without cacheKey continues (safety invariant)", () => {
    // Edge case: resolveFromCache always sets cacheKey, but verify
    // that classifyPipelineResult still guards against missing cacheKey
    const cached = makeCacheEntry({ resolutionStatus: "map_ready" });
    const result = resolveFromCache(cached, "key");
    // Manually strip cacheKey to test the guard
    delete result.cacheKey;
    const decision = classifyPipelineResult(result, "test");

    // map_ready without cacheKey → continue (not terminate)
    expect(decision.kind).toBe("continue");
  });
});
