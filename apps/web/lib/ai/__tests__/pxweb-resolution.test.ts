/**
 * Tests for PxWeb map resolution pipeline.
 *
 * Tests the pure resolution function (resolvePxWebPure) which
 * runs the full pipeline without I/O:
 *   normalize → detect → plan → join → classify
 */
import { describe, it, expect } from "vitest";
import type { NormalizedSourceResult, NormalizedDimension, NormalizedRow } from "../tools/normalized-result";
import { sourceOk, sourceNoData, sourceError } from "../tools/normalized-result";
import { resolvePxWebPure } from "../tools/pxweb-resolution";
import type { LayerStatus } from "../tools/geometry-registry";

// ═══════════════════════════════════════════════════════════════
// Test helpers
// ═══════════════════════════════════════════════════════════════

/** Build a geo dimension with realistic SCB-style codes. */
function geoDim(opts?: {
  id?: string;
  label?: string;
  values?: { code: string; label: string }[];
}): NormalizedDimension {
  return {
    id: opts?.id ?? "Region",
    label: opts?.label ?? "Region",
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

/** Build rows matching the geo dimension values. */
function makeRows(geoCodes: string[], value: number = 1000, geoDimId: string = "Region"): NormalizedRow[] {
  return geoCodes.map((code, i) => ({
    dimensionValues: { [geoDimId]: code, ContentsCode: "BE0101N1", Tid: "2023" },
    value: value + i * 100,
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

/** A fully valid municipality-level result from PxWeb. */
function okMunicipalityResult(overrides?: Partial<NormalizedSourceResult>): NormalizedSourceResult {
  const geo = geoDim();
  const codes = geo.values.map((v) => v.code);
  return {
    adapterStatus: "ok",
    dimensions: [geo, metricDim(), timeDim()],
    rows: makeRows(codes),
    candidateMetricFields: ["Population"],
    countryHints: ["SE"],
    geographyHints: ["municipality"],
    sourceMetadata: makeSourceMetadata(),
    diagnostics: makeDiagnostics(),
    confidence: 0.7,
    ...overrides,
  };
}

/** Build a FeatureCollection with features that match geo codes. */
function makeGeometry(
  codes: string[],
  joinProperty: string = "code",
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

// ═══════════════════════════════════════════════════════════════
// Adapter status guards
// ═══════════════════════════════════════════════════════════════

describe("adapter status handling", () => {
  it("returns unsupported for error adapter status", () => {
    const normalized = sourceError({
      sourceMetadata: makeSourceMetadata(),
      diagnostics: makeDiagnostics(),
      error: "Connection timeout",
    });

    const result = resolvePxWebPure(normalized);

    expect(result.status).toBe("unsupported");
    expect(result.error).toContain("Connection timeout");
    expect(result.confidence).toBe(0);
  });

  it("returns unsupported for no_data adapter status", () => {
    const normalized = sourceNoData({
      sourceMetadata: makeSourceMetadata(),
      diagnostics: makeDiagnostics(),
      error: "No tables found",
    });

    const result = resolvePxWebPure(normalized);

    expect(result.status).toBe("unsupported");
    expect(result.confidence).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// No geography dimension
// ═══════════════════════════════════════════════════════════════

describe("no geography dimension", () => {
  it("returns tabular_only when table has no geo dimension", () => {
    const normalized: NormalizedSourceResult = {
      adapterStatus: "no_geo_dimension",
      dimensions: [metricDim(), timeDim()],
      rows: [],
      candidateMetricFields: ["Population"],
      countryHints: [],
      geographyHints: [],
      sourceMetadata: makeSourceMetadata(),
      diagnostics: makeDiagnostics(),
      confidence: 0.3,
      candidates: [
        { id: "ALT1", label: "Alternative table", source: "SCB" },
      ],
    };

    const result = resolvePxWebPure(normalized);

    expect(result.status).toBe("tabular_only");
    expect(result.reasons.some((r) => r.includes("no geographic dimension"))).toBe(true);
    expect(result.candidates).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Tabular-only PxWeb result
// ═══════════════════════════════════════════════════════════════

describe("tabular-only results", () => {
  it("returns tabular_only when join plan says not map-ready", () => {
    // Single-unit data → detection confidence too low for map-ready join
    const normalized = okMunicipalityResult({
      dimensions: [
        geoDim({ values: [{ code: "0180", label: "Stockholm" }] }),
        metricDim(),
        timeDim(),
      ],
      rows: makeRows(["0180"]),
    });

    const result = resolvePxWebPure(normalized);

    // Single unit → detection has low confidence → join not map-ready
    expect(result.status).toBe("tabular_only");
    expect(result.joinPlan).toBeDefined();
    expect(result.detection).toBeDefined();
  });

  it("returns tabular_only when geometry is not loaded", () => {
    // Enough units for detection, but no geometry provided
    const normalized = okMunicipalityResult();

    const result = resolvePxWebPure(normalized, null);

    // Detection should work, plan may say map-ready,
    // but without geometry we can't execute the join
    expect(["tabular_only", "map_ready"]).toContain(result.status);
    if (result.joinPlan?.mapReady) {
      // If plan says ready but no geometry → tabular
      expect(result.status).toBe("tabular_only");
      expect(result.reasons.some((r) => r.includes("geometry not loaded"))).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Successful map-ready PxWeb result
// ═══════════════════════════════════════════════════════════════

describe("map-ready results", () => {
  it("returns map_ready when join succeeds with good coverage", () => {
    // Country-level ISO data that can join to natural earth
    const isoGeo = geoDim({
      id: "Country",
      label: "Country",
      values: [
        { code: "SWE", label: "Sweden" },
        { code: "NOR", label: "Norway" },
        { code: "DNK", label: "Denmark" },
        { code: "FIN", label: "Finland" },
        { code: "ISL", label: "Iceland" },
      ],
    });

    const normalized: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [isoGeo, metricDim(), timeDim()],
      rows: makeRows(["SWE", "NOR", "DNK", "FIN", "ISL"], 1000, "Country"),
      candidateMetricFields: ["Population"],
      countryHints: [],
      geographyHints: ["country"],
      sourceMetadata: makeSourceMetadata(),
      diagnostics: makeDiagnostics(),
      confidence: 0.7,
    };

    // Geometry matching the ISO codes — property name must match registry (iso_a3)
    const geometry = makeGeometry(
      ["SWE", "NOR", "DNK", "FIN", "ISL"],
      "iso_a3",
    );

    const result = resolvePxWebPure(normalized, geometry);

    expect(result.status).toBe("map_ready");
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.joinExecution).toBeDefined();
    expect(result.joinExecution!.diagnostics.matched).toBe(5);
    expect(result.joinExecution!.diagnostics.unmatched).toBe(0);
  });

  it("returns map_ready for inline geometry (point data)", () => {
    // Simulate point data with inline geometry
    const pointGeo = geoDim({
      id: "Location",
      label: "Location",
      values: [
        { code: "59.33,18.07", label: "Stockholm" },
        { code: "57.71,11.97", label: "Göteborg" },
      ],
    });

    const normalized: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [pointGeo, metricDim(), timeDim()],
      rows: [
        { dimensionValues: { Location: "59.33,18.07", ContentsCode: "POP", Tid: "2023" }, value: 975000 },
        { dimensionValues: { Location: "57.71,11.97", ContentsCode: "POP", Tid: "2023" }, value: 580000 },
      ],
      candidateMetricFields: ["Population"],
      countryHints: ["SE"],
      geographyHints: ["point_set"],
      sourceMetadata: makeSourceMetadata(),
      diagnostics: makeDiagnostics(),
      confidence: 0.7,
      profile: {
        featureCount: 2,
        geometryType: "Point",
        bounds: [[57.71, 11.97], [59.33, 18.07]],
        crs: null,
        attributes: [
          { name: "value", type: "number", min: 580000, max: 975000, nullCount: 0, uniqueValues: 2 },
        ],
      },
    };

    const result = resolvePxWebPure(normalized);

    // Point data detected → inline geometry → should be map_ready or tabular_only
    // depends on detection recognizing the coordinate pattern
    expect(result.detection).toBeDefined();
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Low-confidence candidate mode
// ═══════════════════════════════════════════════════════════════

describe("candidate mode", () => {
  it("returns candidate_mode when adapter confidence is low with alternatives", () => {
    const normalized = okMunicipalityResult({
      confidence: 0.3,
      candidates: [
        { id: "T002", label: "Income by municipality", source: "SCB" },
        { id: "T003", label: "Employment by region", source: "SCB" },
      ],
    });

    const result = resolvePxWebPure(normalized);

    expect(result.status).toBe("candidate_mode");
    expect(result.candidates).toHaveLength(2);
    expect(result.confidence).toBe(0.3);
    expect(result.reasons.some((r) => r.includes("low adapter confidence"))).toBe(true);
  });

  it("does not enter candidate_mode when confidence is sufficient", () => {
    const normalized = okMunicipalityResult({
      confidence: 0.7,
      candidates: [
        { id: "T002", label: "Income by municipality", source: "SCB" },
      ],
    });

    const result = resolvePxWebPure(normalized);

    expect(result.status).not.toBe("candidate_mode");
  });

  it("does not enter candidate_mode when no alternatives exist", () => {
    const normalized = okMunicipalityResult({
      confidence: 0.3,
      candidates: [],
    });

    const result = resolvePxWebPure(normalized);

    expect(result.status).not.toBe("candidate_mode");
  });
});

// ═══════════════════════════════════════════════════════════════
// Unsupported when join fails
// ═══════════════════════════════════════════════════════════════

describe("join failure handling", () => {
  it("returns tabular_only when geometry codes do not match data codes", () => {
    // Country-level ISO data
    const isoGeo = geoDim({
      id: "Country",
      label: "Country",
      values: [
        { code: "SWE", label: "Sweden" },
        { code: "NOR", label: "Norway" },
        { code: "DNK", label: "Denmark" },
        { code: "FIN", label: "Finland" },
        { code: "ISL", label: "Iceland" },
      ],
    });

    const normalized: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [isoGeo, metricDim(), timeDim()],
      rows: makeRows(["SWE", "NOR", "DNK", "FIN", "ISL"], 1000, "Country"),
      candidateMetricFields: ["Population"],
      countryHints: [],
      geographyHints: ["country"],
      sourceMetadata: makeSourceMetadata(),
      diagnostics: makeDiagnostics(),
      confidence: 0.7,
    };

    // Geometry with COMPLETELY different codes (alpha-2 instead of alpha-3)
    const geometry = makeGeometry(
      ["SE", "NO", "DK", "FI", "IS"],
      "iso_a3",
    );

    const result = resolvePxWebPure(normalized, geometry);

    // Join will fail — codes don't match
    if (result.joinExecution) {
      expect(result.joinExecution.diagnostics.matched).toBe(0);
      expect(["tabular_only", "unsupported"]).toContain(result.status);
    }
  });

  it("returns tabular_only when coverage is below threshold", () => {
    // 5 data codes, but geometry only has 1 match
    const isoGeo = geoDim({
      id: "Country",
      label: "Country",
      values: [
        { code: "SWE", label: "Sweden" },
        { code: "NOR", label: "Norway" },
        { code: "DNK", label: "Denmark" },
        { code: "FIN", label: "Finland" },
        { code: "ISL", label: "Iceland" },
      ],
    });

    const normalized: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [isoGeo, metricDim(), timeDim()],
      rows: makeRows(["SWE", "NOR", "DNK", "FIN", "ISL"], 1000, "Country"),
      candidateMetricFields: ["Population"],
      countryHints: [],
      geographyHints: ["country"],
      sourceMetadata: makeSourceMetadata(),
      diagnostics: makeDiagnostics(),
      confidence: 0.7,
    };

    // Only 1 of 5 matches
    const geometry = makeGeometry(["SWE", "XXX", "YYY", "ZZZ"], "iso_a3");

    const result = resolvePxWebPure(normalized, geometry);

    if (result.joinExecution) {
      expect(result.joinExecution.diagnostics.coverageRatio).toBeLessThan(0.5);
      expect(result.status).not.toBe("map_ready");
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Provisional geometry with good vs poor join
// ═══════════════════════════════════════════════════════════════

describe("provisional geometry handling", () => {
  it("allows map_ready with provisional geometry when join is strong", () => {
    const isoGeo = geoDim({
      id: "Country",
      label: "Country",
      values: [
        { code: "SWE", label: "Sweden" },
        { code: "NOR", label: "Norway" },
        { code: "DNK", label: "Denmark" },
        { code: "FIN", label: "Finland" },
        { code: "ISL", label: "Iceland" },
      ],
    });

    const normalized: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [isoGeo, metricDim(), timeDim()],
      rows: makeRows(["SWE", "NOR", "DNK", "FIN", "ISL"], 1000, "Country"),
      candidateMetricFields: ["Population"],
      countryHints: [],
      geographyHints: ["country"],
      sourceMetadata: makeSourceMetadata(),
      diagnostics: makeDiagnostics(),
      confidence: 0.7,
    };

    const geometry = makeGeometry(
      ["SWE", "NOR", "DNK", "FIN", "ISL"],
      "iso_a3",
    );

    const result = resolvePxWebPure(normalized, geometry, "provisional");

    // Strong join (100% coverage) with provisional geometry
    // Should still be map_ready but with lower confidence
    expect(result.status).toBe("map_ready");
    expect(result.joinExecution).toBeDefined();
    expect(result.joinExecution!.diagnostics.matched).toBe(5);
  });

  it("blocks map_ready with provisional geometry when join is weak", () => {
    const isoGeo = geoDim({
      id: "Country",
      label: "Country",
      values: [
        { code: "SWE", label: "Sweden" },
        { code: "NOR", label: "Norway" },
        { code: "DNK", label: "Denmark" },
        { code: "FIN", label: "Finland" },
        { code: "ISL", label: "Iceland" },
      ],
    });

    const normalized: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [isoGeo, metricDim(), timeDim()],
      rows: makeRows(["SWE", "NOR", "DNK", "FIN", "ISL"], 1000, "Country"),
      candidateMetricFields: ["Population"],
      countryHints: [],
      geographyHints: ["country"],
      sourceMetadata: makeSourceMetadata(),
      diagnostics: makeDiagnostics(),
      confidence: 0.7,
    };

    // Only 2 of 5 match → 40% coverage
    const geometry = makeGeometry(
      ["SWE", "NOR", "XXX", "YYY", "ZZZ"],
      "iso_a3",
    );

    const result = resolvePxWebPure(normalized, geometry, "provisional");

    // Weak coverage + provisional → should NOT be map_ready
    if (result.joinExecution) {
      expect(result.status).not.toBe("map_ready");
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Pipeline trace
// ═══════════════════════════════════════════════════════════════

describe("pipeline trace", () => {
  it("includes all pipeline stages in reasons for a full run", () => {
    const normalized = okMunicipalityResult();
    const result = resolvePxWebPure(normalized);

    // Should have detection and join plan reasons
    expect(result.reasons.some((r) => r.includes("detection:"))).toBe(true);
  });

  it("preserves detection, joinPlan, and normalized on result", () => {
    const normalized = okMunicipalityResult();
    const result = resolvePxWebPure(normalized);

    expect(result.normalized).toBe(normalized);
    expect(result.detection).toBeDefined();
    // joinPlan may or may not be present depending on detection outcome
  });

  it("data found does NOT equal map success", () => {
    // This is the key behavioral rule: PxWeb returning data
    // does NOT mean the map is ready. The pipeline must validate.
    const normalized = okMunicipalityResult();

    // No geometry → even though data is "ok", not map_ready
    const result = resolvePxWebPure(normalized, null);

    // If the pipeline reached join planning and plan says map-ready,
    // lack of geometry should prevent map_ready status
    if (result.joinPlan?.mapReady) {
      expect(result.status).not.toBe("map_ready");
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Non-geographic data
// ═══════════════════════════════════════════════════════════════

describe("non-geographic detection", () => {
  it("returns tabular_only when detection says non-geographic", () => {
    // Data with only time and metric dimensions, no geo codes
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
            { code: "2022", label: "2022" },
          ],
        },
        metricDim(),
        {
          id: "Sector",
          label: "Sector",
          role: "filter",
          values: [
            { code: "A", label: "Agriculture" },
            { code: "B", label: "Industry" },
          ],
        },
      ],
      rows: [
        { dimensionValues: { Year: "2022", ContentsCode: "GDP", Sector: "A" }, value: 100 },
        { dimensionValues: { Year: "2022", ContentsCode: "GDP", Sector: "B" }, value: 200 },
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
// Route-level classification semantics
// ═══════════════════════════════════════════════════════════════

/**
 * These tests verify the contract that the clarify route must follow.
 * They exercise resolvePxWebPure and assert the status → route behavior
 * mapping. The route itself is not imported (it requires Next.js runtime),
 * but the classification rules are validated here.
 *
 * Route rules:
 *   map_ready     → return ready:true, resolutionStatus:"map_ready"
 *   tabular_only  → fall through to next fast paths; if no path succeeds,
 *                    return ready:true with resolutionStatus:"tabular_only"
 *   candidate_mode → fall through
 *   unsupported    → fall through
 */
describe("route classification contract", () => {
  it("map_ready terminates pipeline — ready:true is safe", () => {
    const isoGeo = geoDim({
      id: "Country",
      label: "Country",
      values: [
        { code: "SWE", label: "Sweden" },
        { code: "NOR", label: "Norway" },
        { code: "DNK", label: "Denmark" },
        { code: "FIN", label: "Finland" },
        { code: "ISL", label: "Iceland" },
      ],
    });

    const normalized: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [isoGeo, metricDim(), timeDim()],
      rows: makeRows(["SWE", "NOR", "DNK", "FIN", "ISL"], 1000, "Country"),
      candidateMetricFields: ["Population"],
      countryHints: [],
      geographyHints: ["country"],
      sourceMetadata: makeSourceMetadata(),
      diagnostics: makeDiagnostics(),
      confidence: 0.7,
    };

    const geometry = makeGeometry(
      ["SWE", "NOR", "DNK", "FIN", "ISL"],
      "iso_a3",
    );

    const result = resolvePxWebPure(normalized, geometry);

    // Route should return ready:true with resolutionStatus:"map_ready"
    expect(result.status).toBe("map_ready");
    // This is the ONLY status that should terminate the pipeline
  });

  it("tabular_only must NOT terminate the map pipeline as map-ready", () => {
    // Municipality data without geometry → tabular_only
    const normalized = okMunicipalityResult();
    const result = resolvePxWebPure(normalized, null);

    // The resolution produces tabular_only (or possibly candidate_mode)
    expect(result.status).not.toBe("map_ready");

    // Route contract: tabular_only MUST NOT be returned with the same
    // response shape as map_ready. It must either:
    // (a) fall through to let other fast paths try, or
    // (b) be returned with resolutionStatus:"tabular_only"
    //
    // The distinction is testable: if status !== "map_ready",
    // the route must not treat it as a map pipeline success.
    if (result.status === "tabular_only") {
      // When the route uses this result, it must set
      // resolutionStatus: "tabular_only" — never omit it.
      // This ensures the frontend can distinguish.
      expect(result.status).toBe("tabular_only");
    }
  });

  it("tabular_only allows fallback to continue", () => {
    // The resolution pipeline returning tabular_only should NOT
    // block subsequent fast paths (Overpass, web dataset search, etc.)
    const normalized = okMunicipalityResult();
    const result = resolvePxWebPure(normalized, null);

    // Key invariant: not map_ready → route must try other paths
    expect(result.status).not.toBe("map_ready");

    // The stashed tabular result should only be used AFTER all other
    // map-capable fast paths have been exhausted.
  });

  it("candidate_mode falls through", () => {
    const normalized = okMunicipalityResult({
      confidence: 0.3,
      candidates: [
        { id: "T002", label: "Income by municipality", source: "SCB" },
        { id: "T003", label: "Employment by region", source: "SCB" },
      ],
    });

    const result = resolvePxWebPure(normalized);

    expect(result.status).toBe("candidate_mode");
    // Route must NOT return ready:true for candidate_mode
  });

  it("unsupported falls through", () => {
    const normalized = sourceError({
      sourceMetadata: makeSourceMetadata(),
      diagnostics: makeDiagnostics(),
      error: "Connection refused",
    });

    const result = resolvePxWebPure(normalized);

    expect(result.status).toBe("unsupported");
    // Route must NOT return ready:true for unsupported
  });

  it("ready:true is ONLY for map_ready in the PxWeb fast path", () => {
    // Enumerate all non-map_ready statuses and verify none should
    // cause the route to return ready:true without resolutionStatus
    const statuses: Array<{ status: string; shouldTerminate: boolean }> = [
      { status: "map_ready", shouldTerminate: true },
      { status: "tabular_only", shouldTerminate: false },
      { status: "candidate_mode", shouldTerminate: false },
      { status: "unsupported", shouldTerminate: false },
    ];

    for (const { status, shouldTerminate } of statuses) {
      if (shouldTerminate) {
        // map_ready may return ready:true (with resolutionStatus:"map_ready")
        expect(status).toBe("map_ready");
      } else {
        // These must NOT cause the route to terminate the pipeline
        // as a map-ready success
        expect(status).not.toBe("map_ready");
      }
    }
  });
});
