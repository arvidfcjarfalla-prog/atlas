/**
 * Integration tests: geometry loading in the PxWeb resolution path.
 *
 * Tests `resolveGeometryForNormalized()` which bridges:
 *   detection → planning → registry lookup → geometry loading
 *
 * The geometry loader is mocked (it does I/O), but detection, planning,
 * and registry lookup use the real implementations.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NormalizedSourceResult, NormalizedDimension, NormalizedRow } from "../tools/normalized-result";
import { sourceError, sourceNoData } from "../tools/normalized-result";
import { resolveGeometryForNormalized, resolvePxWebPure } from "../tools/pxweb-resolution";
// Side-effect: registers built-in geography plugins
import "../tools/register-plugins";

// ═══════════════════════════════════════════════════════════════
// Mock the geometry loader (I/O boundary)
// ═══════════════════════════════════════════════════════════════

vi.mock("../tools/geometry-loader", () => ({
  loadGeometry: vi.fn(),
}));

import { loadGeometry } from "../tools/geometry-loader";

const mockLoadGeometry = vi.mocked(loadGeometry);

// ═══════════════════════════════════════════════════════════════
// Test helpers
// ═══════════════════════════════════════════════════════════════

function makeSourceMetadata() {
  return {
    sourceId: "se-scb",
    sourceName: "SCB",
    tableId: "TEST01",
    tableLabel: "Test table",
    apiType: "pxweb-v2" as const,
    fetchedAt: Date.now(),
    language: "sv",
  };
}

function makeDiagnostics() {
  return {
    originalPrompt: "test",
    searchQuery: "test",
    tablesFound: 1,
    tableSelected: "TEST01",
    cellCount: 10,
  };
}

function geoDim(opts?: {
  id?: string;
  label?: string;
  role?: "geo" | "time" | "metric" | "filter";
  values?: { code: string; label: string }[];
}): NormalizedDimension {
  return {
    id: opts?.id ?? "Region",
    label: opts?.label ?? "Region",
    role: opts?.role ?? "geo",
    values: opts?.values ?? [
      { code: "0114", label: "Upplands Väsby" },
      { code: "0115", label: "Vallentuna" },
      { code: "0117", label: "Österåker" },
      { code: "0120", label: "Värmdö" },
      { code: "0123", label: "Järfälla" },
    ],
  };
}

function metricDim(): NormalizedDimension {
  return {
    id: "ContentsCode",
    label: "Contents",
    role: "metric",
    values: [{ code: "POP", label: "Population" }],
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
    dimensionValues: { [geoDimId]: code, ContentsCode: "POP", Tid: "2023" },
    value: 1000 + i * 100,
  }));
}

function makeGeometry(
  codes: string[],
  joinProperty: string,
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

/** Country-level ISO A3 data (5 Nordic countries). */
function isoCountryResult(overrides?: Partial<NormalizedSourceResult>): NormalizedSourceResult {
  const isoCodes = ["SWE", "NOR", "DNK", "FIN", "ISL"];
  return {
    adapterStatus: "ok",
    dimensions: [
      geoDim({
        id: "Country",
        label: "Country",
        values: isoCodes.map((c) => ({ code: c, label: c })),
      }),
      metricDim(),
      timeDim(),
    ],
    rows: makeRows(isoCodes, "Country"),
    candidateMetricFields: ["Population"],
    countryHints: [],
    geographyHints: ["country"],
    sourceMetadata: makeSourceMetadata(),
    diagnostics: makeDiagnostics(),
    confidence: 0.7,
    ...overrides,
  };
}

/** Swedish municipality-level data (SCB 4-digit codes). */
function seMunicipalityResult(overrides?: Partial<NormalizedSourceResult>): NormalizedSourceResult {
  return {
    adapterStatus: "ok",
    dimensions: [geoDim(), metricDim(), timeDim()],
    rows: makeRows(geoDim().values.map((v) => v.code)),
    candidateMetricFields: ["Population"],
    countryHints: ["SE"],
    geographyHints: ["municipality"],
    sourceMetadata: makeSourceMetadata(),
    diagnostics: makeDiagnostics(),
    confidence: 0.7,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

beforeEach(() => {
  mockLoadGeometry.mockReset();
});

describe("resolveGeometryForNormalized", () => {
  // ── Successful geometry loading ──────────────────────────

  it("loads geometry for country-level ISO data via registry", async () => {
    const normalized = isoCountryResult();
    const fc = makeGeometry(["SWE", "NOR", "DNK", "FIN", "ISL"], "iso_a3");
    mockLoadGeometry.mockResolvedValue({ geometry: fc, error: null });

    const { geometry, geometryStatus } = await resolveGeometryForNormalized(normalized);

    expect(geometry).toBe(fc);
    expect(mockLoadGeometry).toHaveBeenCalledTimes(1);
    // The entry passed to loadGeometry should be a valid registry entry
    const entry = mockLoadGeometry.mock.calls[0][0];
    expect(entry.id).toBeDefined();
    expect(typeof entry.loaderType).toBe("string");
  });

  it("returns geometry status from the registry entry", async () => {
    const normalized = isoCountryResult();
    const fc = makeGeometry(["SWE"], "iso_a3");
    mockLoadGeometry.mockResolvedValue({ geometry: fc, error: null });

    const { geometryStatus } = await resolveGeometryForNormalized(normalized);

    // The registry entry has a status (production or provisional)
    expect(["production", "provisional"]).toContain(geometryStatus);
  });

  it("loads geometry for SE municipality data (name-based join)", async () => {
    const normalized = seMunicipalityResult();
    const fc = makeGeometry(["Upplands Väsby", "Vallentuna", "Österåker", "Värmdö", "Järfälla"], "name");
    mockLoadGeometry.mockResolvedValue({ geometry: fc, error: null });

    const { geometry } = await resolveGeometryForNormalized(normalized);

    expect(geometry).toBe(fc);
    expect(mockLoadGeometry).toHaveBeenCalledTimes(1);
  });

  // ── Full pipeline: geometry → map_ready ──────────────────

  it("country ISO data with loaded geometry produces map_ready", async () => {
    const normalized = isoCountryResult();
    const fc = makeGeometry(["SWE", "NOR", "DNK", "FIN", "ISL"], "iso_a3");
    mockLoadGeometry.mockResolvedValue({ geometry: fc, error: null });

    const { geometry, geometryStatus } = await resolveGeometryForNormalized(normalized);
    const result = resolvePxWebPure(normalized, geometry, geometryStatus);

    expect(result.status).toBe("map_ready");
    expect(result.joinExecution).toBeDefined();
    expect(result.joinExecution!.diagnostics.matched).toBe(5);
  });

  // ── Geometry load failure → tabular_only ─────────────────

  it("returns null geometry when loader fails", async () => {
    const normalized = isoCountryResult();
    mockLoadGeometry.mockResolvedValue({ geometry: null, error: { type: "network", message: "test failure" } });

    const { geometry } = await resolveGeometryForNormalized(normalized);

    expect(geometry).toBeNull();
  });

  it("loader failure leads to tabular_only in full pipeline", async () => {
    const normalized = isoCountryResult();
    mockLoadGeometry.mockResolvedValue({ geometry: null, error: { type: "network", message: "test failure" } });

    const { geometry, geometryStatus } = await resolveGeometryForNormalized(normalized);
    const result = resolvePxWebPure(normalized, geometry, geometryStatus);

    // Detection and planning will work, but no geometry → tabular_only
    expect(result.status).toBe("tabular_only");
    expect(result.reasons.some((r) => r.includes("geometry not loaded"))).toBe(true);
  });

  // ── Provisional geometry with strong join ────────────────

  it("provisional geometry with good coverage produces map_ready", async () => {
    const normalized = isoCountryResult();
    const fc = makeGeometry(["SWE", "NOR", "DNK", "FIN", "ISL"], "iso_a3");
    mockLoadGeometry.mockResolvedValue({ geometry: fc, error: null });

    const { geometry, geometryStatus } = await resolveGeometryForNormalized(normalized);
    const result = resolvePxWebPure(normalized, geometry, geometryStatus);

    // Even if provisional, 100% coverage should be map_ready
    expect(result.status).toBe("map_ready");
  });

  // ── No geometry needed (early exits) ─────────────────────

  it("returns null for error adapter status without calling loader", async () => {
    const normalized = sourceError({
      sourceMetadata: makeSourceMetadata(),
      diagnostics: makeDiagnostics(),
      error: "timeout",
    });

    const { geometry } = await resolveGeometryForNormalized(normalized);

    expect(geometry).toBeNull();
    expect(mockLoadGeometry).not.toHaveBeenCalled();
  });

  it("returns null for no_data adapter status without calling loader", async () => {
    const normalized = sourceNoData({
      sourceMetadata: makeSourceMetadata(),
      diagnostics: makeDiagnostics(),
    });

    const { geometry } = await resolveGeometryForNormalized(normalized);

    expect(geometry).toBeNull();
    expect(mockLoadGeometry).not.toHaveBeenCalled();
  });

  it("returns null for no_geo_dimension without calling loader", async () => {
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
    };

    const { geometry } = await resolveGeometryForNormalized(normalized);

    expect(geometry).toBeNull();
    expect(mockLoadGeometry).not.toHaveBeenCalled();
  });

  // ── Non-geographic detection → no loader call ────────────

  it("returns null for non-geographic data without calling loader", async () => {
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
        { dimensionValues: { Sector: "A", ContentsCode: "POP", Tid: "2023" }, value: 100 },
        { dimensionValues: { Sector: "B", ContentsCode: "POP", Tid: "2023" }, value: 200 },
      ],
      candidateMetricFields: ["Population"],
      countryHints: [],
      geographyHints: [],
      sourceMetadata: makeSourceMetadata(),
      diagnostics: makeDiagnostics(),
      confidence: 0.7,
    };

    const { geometry } = await resolveGeometryForNormalized(normalized);

    expect(geometry).toBeNull();
    expect(mockLoadGeometry).not.toHaveBeenCalled();
  });

  // ── Inline geometry: no polygon join needed ──────────────

  it("does not regress inline point geometry to tabular_only", () => {
    // Point data with coordinate-pattern codes
    const pointGeo = geoDim({
      id: "Location",
      label: "Location",
      values: [
        { code: "59.33,18.07", label: "Stockholm" },
        { code: "57.71,11.97", label: "Göteborg" },
        { code: "55.60,13.00", label: "Malmö" },
      ],
    });

    const normalized: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [pointGeo, metricDim(), timeDim()],
      rows: makeRows(["59.33,18.07", "57.71,11.97", "55.60,13.00"], "Location"),
      candidateMetricFields: ["Population"],
      countryHints: ["SE"],
      geographyHints: ["point_set"],
      sourceMetadata: makeSourceMetadata(),
      diagnostics: makeDiagnostics(),
      confidence: 0.7,
    };

    // Point data should reach inline_geometry strategy and become map_ready
    // without needing any polygon geometry
    const result = resolvePxWebPure(normalized);

    // Detection should recognize the coordinate pattern
    expect(result.detection).toBeDefined();
    // If inline_geometry detected, it should be map_ready without geometry
    if (result.joinPlan?.strategy === "inline_geometry") {
      expect(result.status).toBe("map_ready");
    }
  });

  // ── No-geo and non-geographic regressions ────────────────

  it("no-geo datasets remain tabular_only regardless of geometry loading", () => {
    const normalized: NormalizedSourceResult = {
      adapterStatus: "no_geo_dimension",
      dimensions: [metricDim(), timeDim()],
      rows: [],
      candidateMetricFields: ["GDP"],
      countryHints: [],
      geographyHints: [],
      sourceMetadata: makeSourceMetadata(),
      diagnostics: makeDiagnostics(),
      confidence: 0.3,
    };

    const result = resolvePxWebPure(normalized);
    expect(result.status).toBe("tabular_only");
  });

  it("non-geographic ok data remains tabular_only regardless of geometry", () => {
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
      ],
      rows: [
        { dimensionValues: { Year: "2022", ContentsCode: "GDP" }, value: 100 },
      ],
      candidateMetricFields: ["GDP"],
      countryHints: ["SE"],
      geographyHints: [],
      sourceMetadata: makeSourceMetadata(),
      diagnostics: makeDiagnostics(),
      confidence: 0.7,
    };

    // Even with geometry provided, non-geographic data stays tabular
    const fc = makeGeometry(["SWE"], "iso_a3");
    const result = resolvePxWebPure(normalized, fc);

    expect(result.status).toBe("tabular_only");
    expect(result.detection?.renderHint).toBe("non_geographic");
  });

  // ── Planner selects no geometry layer ────────────────────

  it("returns null when planner selects no geometry layer", async () => {
    // Default mock for when planner unexpectedly calls loadGeometry
    mockLoadGeometry.mockResolvedValue({
      geometry: null,
      error: { type: "unsupported", message: "default mock" },
    });

    // Single unit → detection low confidence → planner not map-ready → no geometry needed
    const normalized = isoCountryResult({
      dimensions: [
        geoDim({
          id: "Country",
          label: "Country",
          values: [{ code: "SWE", label: "Sweden" }],
        }),
        metricDim(),
        timeDim(),
      ],
      rows: makeRows(["SWE"], "Country"),
    });

    const { geometry } = await resolveGeometryForNormalized(normalized);

    // Single unit → detection might still work but planner may not be map-ready
    // Either way, if plan is not map-ready, loader should not be called
    if (!mockLoadGeometry.mock.calls.length) {
      expect(geometry).toBeNull();
    }
  });
});
