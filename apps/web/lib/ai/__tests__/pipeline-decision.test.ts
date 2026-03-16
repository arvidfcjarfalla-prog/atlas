/**
 * Tests for the pipeline decision tree and plugin-aware resolution.
 *
 * Covers:
 *   - classifyPipelineResult decision tree
 *   - buildTabularFallbackResponse
 *   - Plugin-aware detection/planning via resolvePxWebPure
 *   - PxWeb map_ready vs tabular_only
 *   - Continuation to fallback sources
 *   - Candidate mode propagation
 *   - No-plugin stability
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  classifyPipelineResult,
  buildTabularFallbackResponse,
  type TabularStash,
} from "../pipeline-decision";
import type { PxWebResolutionResult } from "../tools/pxweb-resolution";
import { resolvePxWebPure } from "../tools/pxweb-resolution";
import {
  clearPlugins,
  registerPlugin,
  swedenScbPlugin,
  countryAdminPlugin,
} from "../tools/geography-plugins";
import { sourceOk, sourceError } from "../tools/normalized-result";
import type {
  NormalizedSourceResult,
  NormalizedDimension,
  NormalizedRow,
  GeographyLevel,
} from "../tools/normalized-result";
import type { DatasetProfile } from "../types";

// ═══════════════════════════════════════════════════════════════
// Test helpers
// ═══════════════════════════════════════════════════════════════

function makePipelineResult(
  overrides?: Partial<PxWebResolutionResult>,
): PxWebResolutionResult {
  return {
    status: "unsupported",
    confidence: 0,
    reasons: ["test default"],
    ...overrides,
  };
}

const testProfile: DatasetProfile = {
  featureCount: 5,
  geometryType: "Polygon",
  bounds: [[55, 10], [70, 30]],
  crs: null,
  attributes: [
    { name: "value", type: "number", min: 100, max: 500, nullCount: 0, uniqueValues: 5 },
  ],
};

function geoDim(opts?: {
  id?: string;
  values?: { code: string; label: string }[];
}): NormalizedDimension {
  return {
    id: opts?.id ?? "Region",
    label: opts?.id ?? "Region",
    role: "geo",
    values: opts?.values ?? [
      { code: "0114", label: "Upplands Väsby" },
      { code: "0115", label: "Vallentuna" },
      { code: "0117", label: "Österåker" },
      { code: "0120", label: "Värmdö" },
      { code: "0123", label: "Järfälla" },
      { code: "0125", label: "Ekerö" },
      { code: "0126", label: "Huddinge" },
      { code: "0127", label: "Botkyrka" },
      { code: "0128", label: "Salem" },
      { code: "0136", label: "Haninge" },
    ],
  };
}

function metricDim(): NormalizedDimension {
  return {
    id: "ContentsCode",
    label: "Contents",
    role: "metric",
    values: [{ code: "BE0101N1", label: "Population" }],
  };
}

function timeDim(): NormalizedDimension {
  return {
    id: "Tid",
    label: "Year",
    role: "time",
    values: [{ code: "2023", label: "2023" }],
  };
}

function makeRows(geoCodes: string[], geoDimId: string = "Region"): NormalizedRow[] {
  return geoCodes.map((code, i) => ({
    dimensionValues: { [geoDimId]: code, ContentsCode: "BE0101N1", Tid: "2023" },
    value: 1000 + i * 100,
  }));
}

function makeSourceMetadata() {
  return {
    sourceId: "se-scb",
    sourceName: "SCB",
    tableId: "BE0101A",
    tableLabel: "Population by municipality",
    apiType: "pxweb-v2" as const,
    fetchedAt: Date.now(),
    language: "sv",
  };
}

function makeDiagnostics() {
  return {
    originalPrompt: "population by municipality Sweden",
    searchQuery: "population municipality",
    tablesFound: 5,
    tableSelected: "BE0101A",
    cellCount: 10,
  };
}

function makeGeometry(
  codes: string[],
  joinProperty: string = "iso_a3",
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: codes.map((code) => ({
      type: "Feature" as const,
      properties: { [joinProperty]: code, name: `Region ${code}` },
      geometry: {
        type: "Polygon" as const,
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
      },
    })),
  };
}

function isoCountrySource(overrides?: Partial<NormalizedSourceResult>): NormalizedSourceResult {
  const iso = geoDim({
    id: "Country",
    values: [
      { code: "SWE", label: "Sweden" },
      { code: "NOR", label: "Norway" },
      { code: "DNK", label: "Denmark" },
      { code: "FIN", label: "Finland" },
      { code: "ISL", label: "Iceland" },
    ],
  });
  return {
    adapterStatus: "ok",
    dimensions: [iso, metricDim(), timeDim()],
    rows: makeRows(["SWE", "NOR", "DNK", "FIN", "ISL"], "Country"),
    candidateMetricFields: ["Population"],
    countryHints: [],
    geographyHints: ["country"],
    sourceMetadata: makeSourceMetadata(),
    diagnostics: makeDiagnostics(),
    confidence: 0.7,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Decision tree behavior
// ═══════════════════════════════════════════════════════════════

describe("classifyPipelineResult decision tree", () => {
  it("map_ready + cacheKey → terminate", () => {
    const result = makePipelineResult({
      status: "map_ready",
      cacheKey: "px-test-123",
      profile: testProfile,
    });

    const decision = classifyPipelineResult(result, "test prompt");

    expect(decision.kind).toBe("terminate");
    if (decision.kind === "terminate") {
      expect(decision.response.ready).toBe(true);
      expect(decision.response.dataUrl).toContain("px-test-123");
      expect(decision.response.dataProfile).toBe(testProfile);
    }
  });

  it("map_ready without cacheKey → continue", () => {
    const result = makePipelineResult({
      status: "map_ready",
      // no cacheKey
    });

    const decision = classifyPipelineResult(result, "test prompt");

    expect(decision.kind).toBe("continue");
  });

  it("tabular_only + cacheKey → stash_tabular", () => {
    const result = makePipelineResult({
      status: "tabular_only",
      cacheKey: "px-tabular-456",
      profile: testProfile,
    });

    const decision = classifyPipelineResult(result, "test prompt");

    expect(decision.kind).toBe("stash_tabular");
    if (decision.kind === "stash_tabular") {
      expect(decision.stash.dataUrl).toContain("px-tabular-456");
      expect(decision.stash.profile).toBe(testProfile);
    }
  });

  it("tabular_only without cacheKey → continue", () => {
    const result = makePipelineResult({
      status: "tabular_only",
      // no cacheKey
    });

    const decision = classifyPipelineResult(result, "test prompt");

    expect(decision.kind).toBe("continue");
  });

  it("candidate_mode → continue", () => {
    const result = makePipelineResult({
      status: "candidate_mode",
      cacheKey: "px-candidates",
      candidates: [
        { id: "T1", label: "Table 1", source: "SCB" },
        { id: "T2", label: "Table 2", source: "SCB" },
      ],
    });

    const decision = classifyPipelineResult(result, "test prompt");

    expect(decision.kind).toBe("continue");
  });

  it("unsupported → continue", () => {
    const result = makePipelineResult({
      status: "unsupported",
      error: "no data",
    });

    const decision = classifyPipelineResult(result, "test prompt");

    expect(decision.kind).toBe("continue");
  });

  it("terminate response has resolutionStatus: map_ready", () => {
    const result = makePipelineResult({
      status: "map_ready",
      cacheKey: "px-test",
    });

    const decision = classifyPipelineResult(result, "my prompt");

    expect(decision.kind).toBe("terminate");
    if (decision.kind === "terminate") {
      expect(decision.response.resolutionStatus).toBe("map_ready");
      expect(decision.response.resolvedPrompt).toBe("my prompt");
    }
  });

  it("stash_tabular carries correct dataUrl and profile", () => {
    const result = makePipelineResult({
      status: "tabular_only",
      cacheKey: "stash-key",
      profile: testProfile,
    });

    const decision = classifyPipelineResult(result, "test");

    expect(decision.kind).toBe("stash_tabular");
    if (decision.kind === "stash_tabular") {
      expect(decision.stash.dataUrl).toBe("/api/geo/cached/stash-key");
      expect(decision.stash.profile).toBe(testProfile);
    }
  });

  it("terminate response propagates confidence", () => {
    const result = makePipelineResult({
      status: "map_ready",
      cacheKey: "px-conf",
      confidence: 0.85,
    });

    const decision = classifyPipelineResult(result, "test");

    expect(decision.kind).toBe("terminate");
    if (decision.kind === "terminate") {
      expect(decision.response.confidence).toBe(0.85);
    }
  });

  it("terminate response propagates coverageRatio", () => {
    const result = makePipelineResult({
      status: "map_ready",
      cacheKey: "px-cov",
      joinExecution: {
        status: "map_ready",
        features: [],
        confidence: 0.9,
        diagnostics: {
          attempted: true,
          matched: 280,
          unmatched: 10,
          coverageRatio: 0.966,
          unmatchedCodes: [],
          duplicateConflicts: [],
          strategy: "direct_code",
          reasons: ["test"],
        },
      },
    });

    const decision = classifyPipelineResult(result, "test");

    expect(decision.kind).toBe("terminate");
    if (decision.kind === "terminate") {
      expect(decision.response.coverageRatio).toBeCloseTo(0.966);
    }
  });

  it("stash_tabular propagates confidence and reasons", () => {
    const result = makePipelineResult({
      status: "tabular_only",
      cacheKey: "px-tab",
      confidence: 0.3,
      reasons: ["detection: non_geographic"],
    });

    const decision = classifyPipelineResult(result, "test");

    expect(decision.kind).toBe("stash_tabular");
    if (decision.kind === "stash_tabular") {
      expect(decision.stash.confidence).toBe(0.3);
      expect(decision.stash.reasons).toContain("detection: non_geographic");
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Plugin-aware detection/planning affecting pipeline decisions
// ═══════════════════════════════════════════════════════════════

describe("plugin-aware pipeline decisions", () => {
  beforeEach(() => clearPlugins());

  it("plugin enrichment affects detection but pipeline classification still works", () => {
    registerPlugin(swedenScbPlugin);

    const normalized: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [
        geoDim({
          id: "Region",
          values: Array.from({ length: 21 }, (_, i) => ({
            code: String(i + 1).padStart(2, "0"),
            label: `County ${i + 1}`,
          })),
        }),
        metricDim(),
        timeDim(),
      ],
      rows: makeRows(
        Array.from({ length: 21 }, (_, i) => String(i + 1).padStart(2, "0")),
      ),
      candidateMetricFields: ["Population"],
      countryHints: ["SE"],
      geographyHints: ["admin1"],
      sourceMetadata: makeSourceMetadata(),
      diagnostics: makeDiagnostics(),
      confidence: 0.7,
    };

    // No geometry → tabular_only regardless of plugin enrichment
    const result = resolvePxWebPure(normalized, null);

    expect(result.detection).toBeDefined();
    expect(result.status).not.toBe("map_ready");
    // Plugin enrichment should be reflected in detection reasons
    if (result.detection) {
      const hasPluginTrace = result.detection.reasons.some((r) => r.includes("plugin"));
      // If SCB plugin applied, should have plugin trace
      expect(hasPluginTrace || result.detection.level !== "unknown").toBe(true);
    }
  });

  it("plugin boost pushing join plan over threshold → map_ready", () => {
    registerPlugin(countryAdminPlugin);

    const normalized = isoCountrySource();
    const geometry = makeGeometry(["SWE", "NOR", "DNK", "FIN", "ISL"]);

    const result = resolvePxWebPure(normalized, geometry);

    // Country codes + matching geometry → should be map_ready
    expect(result.status).toBe("map_ready");
    expect(result.joinExecution).toBeDefined();
    expect(result.joinExecution!.diagnostics.matched).toBe(5);
  });

  it("no-plugin behavior identical to generic (empty registry)", () => {
    // Empty plugin registry
    expect(clearPlugins).toBeDefined();

    const normalized = isoCountrySource();
    const geometry = makeGeometry(["SWE", "NOR", "DNK", "FIN", "ISL"]);

    // Run without plugins
    clearPlugins();
    const resultNoPlugins = resolvePxWebPure(normalized, geometry);

    // Run with plugins
    registerPlugin(countryAdminPlugin);
    const resultWithPlugins = resolvePxWebPure(normalized, geometry);

    // Both should be map_ready (country ISO codes are recognized generically)
    expect(resultNoPlugins.status).toBe("map_ready");
    expect(resultWithPlugins.status).toBe("map_ready");
  });

  it("plugin-provided confidence does NOT bypass planner threshold for non-geographic data", () => {
    registerPlugin(swedenScbPlugin);

    // Non-geographic data: only time + metric dimensions
    const normalized: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [
        {
          id: "Year",
          label: "Year",
          role: "time",
          values: [
            { code: "2020", label: "2020" },
            { code: "2021", label: "2021" },
          ],
        },
        metricDim(),
      ],
      rows: [
        { dimensionValues: { Year: "2020", ContentsCode: "GDP" }, value: 100 },
      ],
      candidateMetricFields: ["GDP"],
      countryHints: ["SE"],
      geographyHints: [],
      sourceMetadata: makeSourceMetadata(),
      diagnostics: makeDiagnostics(),
      confidence: 0.7,
    };

    const result = resolvePxWebPure(normalized, null);

    // Even with plugin, non-geographic data stays tabular_only
    expect(result.status).toBe("tabular_only");
  });
});

// ═══════════════════════════════════════════════════════════════
// PxWeb map_ready vs tabular_only
// ═══════════════════════════════════════════════════════════════

describe("PxWeb map_ready vs tabular_only", () => {
  beforeEach(() => clearPlugins());

  it("country-level ISO data + geometry → map_ready", () => {
    const normalized = isoCountrySource();
    const geometry = makeGeometry(["SWE", "NOR", "DNK", "FIN", "ISL"]);

    const result = resolvePxWebPure(normalized, geometry);

    expect(result.status).toBe("map_ready");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("municipality data without geometry → tabular_only", () => {
    const normalized: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [geoDim(), metricDim(), timeDim()],
      rows: makeRows(geoDim().values.map((v) => v.code)),
      candidateMetricFields: ["Population"],
      countryHints: ["SE"],
      geographyHints: ["municipality"],
      sourceMetadata: makeSourceMetadata(),
      diagnostics: makeDiagnostics(),
      confidence: 0.7,
    };

    const result = resolvePxWebPure(normalized, null);

    // Without geometry, even valid data can't be map_ready
    expect(result.status).not.toBe("map_ready");
  });

  it("non-geographic data → tabular_only", () => {
    const normalized: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [
        {
          id: "Sector",
          label: "Sector",
          role: "filter",
          values: [
            { code: "A", label: "Agriculture" },
            { code: "B", label: "Industry" },
          ],
        },
        metricDim(),
        timeDim(),
      ],
      rows: [
        { dimensionValues: { Sector: "A", ContentsCode: "GDP", Tid: "2023" }, value: 100 },
        { dimensionValues: { Sector: "B", ContentsCode: "GDP", Tid: "2023" }, value: 200 },
      ],
      candidateMetricFields: ["GDP"],
      countryHints: ["SE"],
      geographyHints: [],
      sourceMetadata: makeSourceMetadata(),
      diagnostics: makeDiagnostics(),
      confidence: 0.7,
    };

    const result = resolvePxWebPure(normalized);

    expect(result.status).toBe("tabular_only");
    expect(result.detection?.renderHint).toBe("non_geographic");
  });
});

// ═══════════════════════════════════════════════════════════════
// Continuation to fallback source
// ═══════════════════════════════════════════════════════════════

describe("continuation to fallback", () => {
  it("tabular_only stash is only surfaced via buildTabularFallbackResponse", () => {
    const result = makePipelineResult({
      status: "tabular_only",
      cacheKey: "stashed-data",
      profile: testProfile,
    });

    const decision = classifyPipelineResult(result, "prompt");

    // tabular_only → stash, NOT terminate
    expect(decision.kind).toBe("stash_tabular");
    expect(decision.kind).not.toBe("terminate");

    // Only buildTabularFallbackResponse creates the final response
    if (decision.kind === "stash_tabular") {
      const response = buildTabularFallbackResponse(decision.stash, "prompt");
      expect(response.resolutionStatus).toBe("tabular_only");
      expect(response.ready).toBe(true);
    }
  });

  it("candidate_mode does not produce terminate", () => {
    const result = makePipelineResult({
      status: "candidate_mode",
      cacheKey: "has-key",
      candidates: [{ id: "T1", label: "Table", source: "SCB" }],
    });

    const decision = classifyPipelineResult(result, "prompt");

    expect(decision.kind).toBe("continue");
    expect(decision.kind).not.toBe("terminate");
  });

  it("unsupported does not produce terminate", () => {
    const result = makePipelineResult({
      status: "unsupported",
      cacheKey: "has-key",
      error: "failed",
    });

    const decision = classifyPipelineResult(result, "prompt");

    expect(decision.kind).toBe("continue");
    expect(decision.kind).not.toBe("terminate");
  });
});

// ═══════════════════════════════════════════════════════════════
// Candidate mode propagation
// ═══════════════════════════════════════════════════════════════

describe("candidate mode propagation", () => {
  beforeEach(() => clearPlugins());

  it("candidate_mode passes through candidates list", () => {
    const candidates = [
      { id: "T1", label: "Population by county", source: "SCB" },
      { id: "T2", label: "Income by municipality", source: "SCB" },
    ];

    const normalized: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [geoDim(), metricDim(), timeDim()],
      rows: makeRows(geoDim().values.map((v) => v.code)),
      candidateMetricFields: ["Population"],
      countryHints: ["SE"],
      geographyHints: ["municipality"],
      sourceMetadata: makeSourceMetadata(),
      diagnostics: makeDiagnostics(),
      confidence: 0.3, // low → triggers candidate_mode
      candidates,
    };

    const result = resolvePxWebPure(normalized);

    expect(result.status).toBe("candidate_mode");
    expect(result.candidates).toEqual(candidates);
  });

  it("candidate_mode does not set ready:true in classify", () => {
    const result = makePipelineResult({
      status: "candidate_mode",
      cacheKey: "key",
      candidates: [{ id: "T1", label: "Table", source: "SCB" }],
    });

    const decision = classifyPipelineResult(result, "prompt");

    // candidate_mode → continue, never terminate with ready:true
    expect(decision.kind).toBe("continue");
  });
});

// ═══════════════════════════════════════════════════════════════
// Tabular fallback response builder
// ═══════════════════════════════════════════════════════════════

describe("buildTabularFallbackResponse", () => {
  it("sets resolutionStatus to tabular_only", () => {
    const stash: TabularStash = {
      dataUrl: "/api/geo/cached/test-key",
      profile: testProfile,
    };

    const response = buildTabularFallbackResponse(stash, "my prompt");

    expect(response.resolutionStatus).toBe("tabular_only");
  });

  it("sets ready to true", () => {
    const stash: TabularStash = {
      dataUrl: "/api/geo/cached/test-key",
    };

    const response = buildTabularFallbackResponse(stash, "my prompt");

    expect(response.ready).toBe(true);
  });

  it("preserves profile", () => {
    const stash: TabularStash = {
      dataUrl: "/api/geo/cached/test-key",
      profile: testProfile,
    };

    const response = buildTabularFallbackResponse(stash, "prompt");

    expect(response.dataProfile).toBe(testProfile);
    expect(response.dataUrl).toBe("/api/geo/cached/test-key");
    expect(response.resolvedPrompt).toBe("prompt");
  });

  it("includes suggestions when provided", () => {
    const stash: TabularStash = {
      dataUrl: "/api/geo/cached/test-key",
    };
    const suggestions = ["Try county level", "GDP in Europe"];

    const response = buildTabularFallbackResponse(stash, "prompt", suggestions);

    expect(response.suggestions).toEqual(suggestions);
  });

  it("omits suggestions when empty", () => {
    const stash: TabularStash = {
      dataUrl: "/api/geo/cached/test-key",
    };

    const response = buildTabularFallbackResponse(stash, "prompt", []);

    expect(response.suggestions).toBeUndefined();
  });

  it("propagates confidence from stash", () => {
    const stash: TabularStash = {
      dataUrl: "/api/geo/cached/test-key",
      confidence: 0.35,
    };

    const response = buildTabularFallbackResponse(stash, "prompt");

    expect(response.confidence).toBe(0.35);
  });
});

// ═══════════════════════════════════════════════════════════════
// No-plugin stability
// ═══════════════════════════════════════════════════════════════

describe("no-plugin stability", () => {
  beforeEach(() => clearPlugins());

  it("resolvePxWebPure with empty plugin registry returns correct classification", () => {
    clearPlugins();

    const normalized = isoCountrySource();
    const geometry = makeGeometry(["SWE", "NOR", "DNK", "FIN", "ISL"]);

    const result = resolvePxWebPure(normalized, geometry);

    // Generic detection recognizes ISO A3, joins correctly → map_ready
    expect(result.status).toBe("map_ready");
    expect(result.joinExecution).toBeDefined();
    expect(result.joinExecution!.diagnostics.matched).toBe(5);
  });

  it("classifyPipelineResult behaves identically with or without plugins", () => {
    const mapReadyResult = makePipelineResult({
      status: "map_ready",
      cacheKey: "key1",
    });

    const tabularResult = makePipelineResult({
      status: "tabular_only",
      cacheKey: "key2",
    });

    // Without plugins
    clearPlugins();
    const d1 = classifyPipelineResult(mapReadyResult, "p");
    const d2 = classifyPipelineResult(tabularResult, "p");

    // With plugins
    registerPlugin(swedenScbPlugin);
    const d3 = classifyPipelineResult(mapReadyResult, "p");
    const d4 = classifyPipelineResult(tabularResult, "p");

    // classifyPipelineResult is plugin-agnostic — it only reads status + cacheKey
    expect(d1.kind).toBe(d3.kind);
    expect(d2.kind).toBe(d4.kind);
    expect(d1.kind).toBe("terminate");
    expect(d2.kind).toBe("stash_tabular");
  });
});
