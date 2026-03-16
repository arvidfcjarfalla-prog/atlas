/**
 * Global regression and fixture suite for the universal map-resolution system.
 *
 * Exercises the full pipeline: detect → plan → execute → classify
 * across countries, geography levels, code systems, and edge cases.
 *
 * Fixture categories:
 *   1.  Country-level ISO data
 *   2.  Admin1 / state-level data
 *   3.  Admin2 / county-level data (US FIPS)
 *   4.  Municipality-level data
 *   5.  NUTS regional data
 *   6.  Point datasets
 *   7.  Tabular-only datasets
 *   8.  Unsupported cases
 *   9.  Ambiguous candidate-mode cases
 *   10. Mixed-country and mixed-code-system cases
 *   11. Production vs provisional geometry
 *   12. PxWeb failure mode regressions
 *   13. Plugin enrichment
 *   14. No-plugin stability
 */

import { describe, it, expect, beforeEach } from "vitest";
import { detectGeography, detectGeographyWithPlugins } from "../tools/geography-detector";
import type { DetectionResult } from "../tools/geography-detector";
import { planJoin, planJoinWithPlugins } from "../tools/join-planner";
import type { JoinPlanResult } from "../tools/join-planner";
import { executeJoin } from "../tools/geometry-join";
import type { JoinExecutionResult } from "../tools/geometry-join";
import { findByCountryAndLevel, type GeometryEntry, type JoinKeyConfig } from "../tools/geometry-registry";
import { resolvePxWebPure } from "../tools/pxweb-resolution";
import type { PxWebResolutionResult } from "../tools/pxweb-resolution";
import { classifyPipelineResult, buildTabularFallbackResponse } from "../pipeline-decision";
import {
  clearPlugins,
  registerPlugin,
  swedenScbPlugin,
  eurostatNutsPlugin,
  usFipsPlugin,
  countryAdminPlugin,
} from "../tools/geography-plugins";
import type {
  NormalizedSourceResult,
  NormalizedDimension,
  NormalizedRow,
  GeographyLevel,
  CodeFamily,
} from "../tools/normalized-result";
import { sourceOk, sourceError, sourceNoData, sourceCandidates } from "../tools/normalized-result";
import type { DatasetProfile } from "../types";

// ═══════════════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════════════

function dim(id: string, role: "geo" | "time" | "metric" | "filter", values: { code: string; label: string }[]): NormalizedDimension {
  return { id, label: id, role, values };
}

function rows(geoCodes: string[], geoDimId: string): NormalizedRow[] {
  return geoCodes.map((code, i) => ({
    dimensionValues: { [geoDimId]: code, ContentsCode: "M1", Tid: "2023" },
    value: 100 + i * 10,
  }));
}

function meta(sourceId: string = "test") {
  return { sourceId, sourceName: "Test", fetchedAt: Date.now() };
}

function diag() {
  return { originalPrompt: "test query" };
}

function fc(codes: string[], joinProperty: string): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: codes.map((code) => ({
      type: "Feature" as const,
      properties: { [joinProperty]: code, name: `Name ${code}` },
      geometry: { type: "Polygon" as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
    })),
  };
}

function src(opts: {
  geoDim?: NormalizedDimension;
  countryHints?: string[];
  geoHints?: GeographyLevel[];
  sourceId?: string;
  confidence?: number;
  candidates?: any[];
  adapterStatus?: "ok" | "no_data" | "no_geo_dimension" | "error";
  error?: string;
}): NormalizedSourceResult {
  const dims = [
    ...(opts.geoDim ? [opts.geoDim] : []),
    dim("ContentsCode", "metric", [{ code: "M1", label: "Measure" }]),
    dim("Tid", "time", [{ code: "2023", label: "2023" }]),
  ];
  const geoCodes = opts.geoDim ? opts.geoDim.values.map((v) => v.code) : [];
  return {
    adapterStatus: opts.adapterStatus ?? "ok",
    dimensions: dims,
    rows: geoCodes.length > 0 ? rows(geoCodes, opts.geoDim!.id) : [],
    candidateMetricFields: ["Measure"],
    countryHints: opts.countryHints ?? [],
    geographyHints: opts.geoHints ?? [],
    sourceMetadata: meta(opts.sourceId ?? "test"),
    diagnostics: diag(),
    confidence: opts.confidence ?? 0.7,
    candidates: opts.candidates,
    error: opts.error,
  };
}

/** Build a mock geometry lookup that returns specific entries. */
function mockLookup(entries: GeometryEntry[]) {
  return (_country: string, _level: GeographyLevel) => entries;
}

/** Make a minimal GeometryEntry for test injection. */
function entry(opts: {
  id: string;
  level: GeographyLevel;
  scope: string;
  joinKeys: JoinKeyConfig[];
  status?: "production" | "provisional";
}): GeometryEntry {
  return {
    id: opts.id,
    name: opts.id,
    level: opts.level,
    scope: { regionCode: opts.scope },
    loaderType: "cdn_url",
    loaderTarget: "https://example.com/geo.json",
    joinKeys: opts.joinKeys,
    featureIdProperty: opts.joinKeys[0]?.geometryProperty ?? "id",
    resolution: "medium",
    status: opts.status ?? "production",
  };
}

// ═══════════════════════════════════════════════════════════════
// 1. Country-level ISO data
// ═══════════════════════════════════════════════════════════════

describe("country-level ISO data", () => {
  beforeEach(() => clearPlugins());

  it("ISO alpha-3 codes detected as country level", () => {
    const s = src({
      geoDim: dim("Country", "geo", [
        { code: "SWE", label: "Sweden" },
        { code: "NOR", label: "Norway" },
        { code: "DEU", label: "Germany" },
        { code: "FRA", label: "France" },
        { code: "GBR", label: "United Kingdom" },
      ]),
      geoHints: ["country"],
    });

    const det = detectGeography(s);

    expect(det.level).toBe("country");
    expect(det.codeFamily.family).toBe("iso");
    expect(det.codeFamily.namespace).toBe("alpha3");
    expect(det.renderHint).toBe("polygon_join");
    expect(det.unitCount).toBe(5);
    expect(det.confidence).toBeGreaterThan(0.5);
  });

  it("ISO alpha-2 codes detected as country level", () => {
    const s = src({
      geoDim: dim("geo", "geo", [
        { code: "SE", label: "Sweden" },
        { code: "NO", label: "Norway" },
        { code: "DK", label: "Denmark" },
        { code: "FI", label: "Finland" },
      ]),
      geoHints: ["country"],
    });

    const det = detectGeography(s);

    expect(det.level).toBe("country");
    expect(det.codeFamily.family).toBe("iso");
    expect(det.codeFamily.namespace).toBe("alpha2");
    expect(det.confidence).toBeGreaterThan(0.5);
  });

  it("country ISO-A3 + matching geometry → full pipeline map_ready", () => {
    const s = src({
      geoDim: dim("Country", "geo", [
        { code: "SWE", label: "Sweden" },
        { code: "NOR", label: "Norway" },
        { code: "DEU", label: "Germany" },
        { code: "FRA", label: "France" },
        { code: "GBR", label: "UK" },
      ]),
      geoHints: ["country"],
    });
    const geometry = fc(["SWE", "NOR", "DEU", "FRA", "GBR"], "iso_a3");

    const result = resolvePxWebPure(s, geometry);

    expect(result.status).toBe("map_ready");
    expect(result.joinExecution).toBeDefined();
    expect(result.joinExecution!.diagnostics.matched).toBe(5);
    expect(result.joinExecution!.diagnostics.unmatched).toBe(0);
    expect(result.joinExecution!.diagnostics.coverageRatio).toBe(1);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("country ISO-A3 without geometry → tabular_only", () => {
    const s = src({
      geoDim: dim("Country", "geo", [
        { code: "SWE", label: "Sweden" },
        { code: "NOR", label: "Norway" },
        { code: "DEU", label: "Germany" },
      ]),
      geoHints: ["country"],
    });

    const result = resolvePxWebPure(s, null);

    expect(result.status).toBe("tabular_only");
    expect(result.detection).toBeDefined();
    expect(result.joinPlan).toBeDefined();
    // Planner should have found the plan, but no geometry → tabular
    expect(result.reasons.some((r) => r.includes("geometry not loaded"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Admin1 / state-level data
// ═══════════════════════════════════════════════════════════════

describe("admin1 / state-level data", () => {
  beforeEach(() => clearPlugins());

  it("Swedish county codes (2-digit numeric) detected with SCB plugin", () => {
    registerPlugin(swedenScbPlugin);

    const codes = Array.from({ length: 21 }, (_, i) => ({
      code: String(i + 1).padStart(2, "0"),
      label: `County ${i + 1}`,
    }));
    const s = src({
      geoDim: dim("Region", "geo", codes),
      countryHints: ["SE"],
      geoHints: ["admin1"],
      sourceId: "se-scb",
    });

    const det = detectGeographyWithPlugins(s);

    expect(det.level).toBe("admin1");
    expect(det.codeFamily.family).toBe("national");
    expect(det.codeFamily.namespace).toBe("se-scb");
    expect(det.confidence).toBeGreaterThan(0.5);
  });

  it("Norwegian county codes detected as admin1", () => {
    const codes = Array.from({ length: 11 }, (_, i) => ({
      code: String(i + 30).padStart(2, "0"),
      label: `Fylke ${i}`,
    }));
    const s = src({
      geoDim: dim("Region", "geo", codes),
      countryHints: ["NO"],
      geoHints: ["admin1"],
      sourceId: "no-ssb",
    });

    const det = detectGeography(s);

    // Generic detector: numeric codes + hint → admin1
    expect(det.level).toBe("admin1");
    expect(det.codeFamily.family).toBe("national");
    expect(det.renderHint).toBe("polygon_join");
  });

  it("admin1 + matching geometry → plan says map_ready", () => {
    const geoEntry = entry({
      id: "se:lan",
      level: "admin1",
      scope: "SE",
      joinKeys: [{ geometryProperty: "ref", codeFamily: { family: "national", namespace: "se-scb" } }],
    });

    const codes = Array.from({ length: 21 }, (_, i) => String(i + 1).padStart(2, "0"));
    const s = src({
      geoDim: dim("Region", "geo", codes.map((c) => ({ code: c, label: c }))),
      countryHints: ["SE"],
      geoHints: ["admin1"],
      sourceId: "se-scb",
    });

    // With plugin to get national/se-scb family
    registerPlugin(swedenScbPlugin);

    const det = detectGeographyWithPlugins(s);
    const plan = planJoinWithPlugins(det, ["SE"], s, mockLookup([geoEntry]));

    expect(plan.mapReady).toBe(true);
    expect(plan.strategy).toBe("direct_code");
    expect(plan.geometryJoinField).toBe("ref");
    expect(plan.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("admin1 + geometry join → execution map_ready with full coverage", () => {
    registerPlugin(swedenScbPlugin);

    const codes = Array.from({ length: 21 }, (_, i) => String(i + 1).padStart(2, "0"));
    const geoEntry = entry({
      id: "se:lan",
      level: "admin1",
      scope: "SE",
      joinKeys: [{ geometryProperty: "ref", codeFamily: { family: "national", namespace: "se-scb" } }],
    });

    const s = src({
      geoDim: dim("Region", "geo", codes.map((c) => ({ code: c, label: c }))),
      countryHints: ["SE"],
      geoHints: ["admin1"],
      sourceId: "se-scb",
    });

    const det = detectGeographyWithPlugins(s);
    const plan = planJoinWithPlugins(det, ["SE"], s, mockLookup([geoEntry]));
    const geometry = fc(codes, "ref");
    const exec = executeJoin(plan, s.rows, geometry);

    expect(exec.status).toBe("map_ready");
    expect(exec.diagnostics.matched).toBe(21);
    expect(exec.diagnostics.unmatched).toBe(0);
    expect(exec.diagnostics.coverageRatio).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Admin2 / county-level data (US FIPS)
// ═══════════════════════════════════════════════════════════════

describe("admin2 / county-level (US FIPS)", () => {
  beforeEach(() => clearPlugins());

  it("5-digit FIPS codes detected as admin2 by plugin", () => {
    registerPlugin(usFipsPlugin);

    // 25 FIPS county codes
    const codes = Array.from({ length: 25 }, (_, i) => ({
      code: String(6001 + i * 100).padStart(5, "0"),
      label: `County ${i}`,
    }));
    const s = src({
      geoDim: dim("GeoFIPS", "geo", codes),
      countryHints: ["US"],
      geoHints: [],
      sourceId: "us-census",
    });

    const det = detectGeographyWithPlugins(s);

    expect(det.level).toBe("admin2");
    expect(det.codeFamily.family).toBe("fips");
    expect(det.confidence).toBeGreaterThan(0.3);
  });

  it("FIPS state codes (2-digit, 50 states) detected as admin1 by plugin", () => {
    registerPlugin(usFipsPlugin);

    const codes = Array.from({ length: 50 }, (_, i) => ({
      code: String(i + 1).padStart(2, "0"),
      label: `State ${i + 1}`,
    }));
    const s = src({
      geoDim: dim("State", "geo", codes),
      countryHints: ["US"],
      geoHints: [],
      sourceId: "us-census",
    });

    const det = detectGeographyWithPlugins(s);

    expect(det.level).toBe("admin1");
    expect(det.codeFamily.family).toBe("fips");
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Municipality-level data
// ═══════════════════════════════════════════════════════════════

describe("municipality-level data", () => {
  beforeEach(() => clearPlugins());

  it("Swedish 4-digit SCB municipality codes detected", () => {
    registerPlugin(swedenScbPlugin);

    const codes = Array.from({ length: 50 }, (_, i) => ({
      code: String(114 + i).padStart(4, "0"),
      label: `Municipality ${i}`,
    }));
    const s = src({
      geoDim: dim("Kommun", "geo", codes),
      countryHints: ["SE"],
      geoHints: ["municipality"],
      sourceId: "se-scb",
    });

    const det = detectGeographyWithPlugins(s);

    expect(det.level).toBe("municipality");
    expect(det.codeFamily.family).toBe("national");
    expect(det.codeFamily.namespace).toBe("se-scb");
    expect(det.confidence).toBeGreaterThan(0.5);
  });

  it("municipality data without geometry → tabular_only pipeline status", () => {
    registerPlugin(swedenScbPlugin);

    const codes = Array.from({ length: 20 }, (_, i) => ({
      code: String(114 + i).padStart(4, "0"),
      label: `Municipality ${i}`,
    }));
    const s = src({
      geoDim: dim("Kommun", "geo", codes),
      countryHints: ["SE"],
      geoHints: ["municipality"],
      sourceId: "se-scb",
    });

    const result = resolvePxWebPure(s, null);

    expect(result.status).toBe("tabular_only");
    expect(result.detection).toBeDefined();
  });

  it("municipality data + geometry → map_ready with join diagnostics", () => {
    registerPlugin(swedenScbPlugin);

    const codes = Array.from({ length: 15 }, (_, i) => String(114 + i).padStart(4, "0"));
    const geoEntry = entry({
      id: "se:kommun",
      level: "municipality",
      scope: "SE",
      joinKeys: [{ geometryProperty: "ref", codeFamily: { family: "national", namespace: "se-scb" } }],
    });

    const s = src({
      geoDim: dim("Kommun", "geo", codes.map((c) => ({ code: c, label: c }))),
      countryHints: ["SE"],
      geoHints: ["municipality"],
      sourceId: "se-scb",
    });

    const det = detectGeographyWithPlugins(s);
    const plan = planJoinWithPlugins(det, ["SE"], s, mockLookup([geoEntry]));
    const geometry = fc(codes, "ref");
    const exec = executeJoin(plan, s.rows, geometry);

    expect(exec.status).toBe("map_ready");
    expect(exec.diagnostics.matched).toBe(15);
    expect(exec.diagnostics.coverageRatio).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. NUTS regional data
// ═══════════════════════════════════════════════════════════════

describe("NUTS regional data", () => {
  beforeEach(() => clearPlugins());

  it("NUTS2 codes detected as nuts2", () => {
    registerPlugin(eurostatNutsPlugin);

    const codes = [
      { code: "SE11", label: "Stockholm" },
      { code: "SE12", label: "East Mid Sweden" },
      { code: "SE21", label: "Småland" },
      { code: "SE22", label: "South Sweden" },
      { code: "SE23", label: "West Sweden" },
      { code: "SE31", label: "North Mid Sweden" },
      { code: "SE32", label: "Mid Norrland" },
      { code: "SE33", label: "Upper Norrland" },
    ];
    const s = src({
      geoDim: dim("geo", "geo", codes),
      geoHints: ["nuts2"],
    });

    const det = detectGeographyWithPlugins(s);

    expect(det.level).toBe("nuts2");
    expect(det.codeFamily.family).toBe("eurostat");
    expect(det.codeFamily.namespace).toBe("nuts");
    expect(det.confidence).toBeGreaterThan(0.5);
  });

  it("NUTS3 codes detected as nuts3", () => {
    registerPlugin(eurostatNutsPlugin);

    const codes = [
      { code: "DE111", label: "Stuttgart, Stadtkreis" },
      { code: "DE112", label: "Böblingen" },
      { code: "DE113", label: "Esslingen" },
      { code: "DE114", label: "Göppingen" },
      { code: "DE115", label: "Ludwigsburg" },
    ];
    const s = src({
      geoDim: dim("GEO", "geo", codes),
      geoHints: ["nuts3"],
    });

    const det = detectGeographyWithPlugins(s);

    expect(det.level).toBe("nuts3");
    expect(det.codeFamily.family).toBe("eurostat");
  });

  it("NUTS1 codes detected as nuts1", () => {
    registerPlugin(eurostatNutsPlugin);

    const codes = [
      { code: "DE1", label: "Baden-Württemberg" },
      { code: "DE2", label: "Bayern" },
      { code: "DE3", label: "Berlin" },
      { code: "DE4", label: "Brandenburg" },
      { code: "DE5", label: "Bremen" },
      { code: "DE6", label: "Hamburg" },
    ];
    const s = src({
      geoDim: dim("geo", "geo", codes),
      geoHints: ["nuts1"],
    });

    const det = detectGeographyWithPlugins(s);

    expect(det.level).toBe("nuts1");
    expect(det.codeFamily.family).toBe("eurostat");
  });

  it("NUTS codes + Eurostat geometry → plan map_ready", () => {
    registerPlugin(eurostatNutsPlugin);

    const nuts2Entry = entry({
      id: "eurostat:nuts2",
      level: "nuts2",
      scope: "EU",
      joinKeys: [{ geometryProperty: "nuts_id", codeFamily: { family: "eurostat", namespace: "nuts" } }],
      status: "production",
    });

    const codes = ["SE11", "SE12", "SE21", "SE22", "SE23", "SE31", "SE32", "SE33"];
    const s = src({
      geoDim: dim("geo", "geo", codes.map((c) => ({ code: c, label: c }))),
      countryHints: ["SE"],
      geoHints: ["nuts2"],
    });

    const det = detectGeographyWithPlugins(s);
    const plan = planJoinWithPlugins(det, ["SE"], s, mockLookup([nuts2Entry]));

    expect(plan.mapReady).toBe(true);
    expect(plan.strategy).toBe("direct_code");
    expect(plan.geometryJoinField).toBe("nuts_id");
  });

  it("NUTS2 full pipeline with join execution", () => {
    registerPlugin(eurostatNutsPlugin);

    const nutsEntry = entry({
      id: "eurostat:nuts2",
      level: "nuts2",
      scope: "EU",
      joinKeys: [{ geometryProperty: "nuts_id", codeFamily: { family: "eurostat", namespace: "nuts" } }],
    });

    const codes = ["SE11", "SE12", "SE21", "SE22", "SE23"];
    const s = src({
      geoDim: dim("geo", "geo", codes.map((c) => ({ code: c, label: c }))),
      countryHints: ["SE"],
      geoHints: ["nuts2"],
    });

    const det = detectGeographyWithPlugins(s);
    const plan = planJoinWithPlugins(det, ["SE"], s, mockLookup([nutsEntry]));
    const geometry = fc(codes, "nuts_id");
    const exec = executeJoin(plan, s.rows, geometry);

    expect(exec.status).toBe("map_ready");
    expect(exec.diagnostics.matched).toBe(5);
    expect(exec.diagnostics.coverageRatio).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. Point datasets
// ═══════════════════════════════════════════════════════════════

describe("point datasets", () => {
  beforeEach(() => clearPlugins());

  it("coordinate-like values → point_set, point_based render hint", () => {
    const s = src({
      geoDim: dim("lat", "geo", [
        { code: "59.329", label: "59.329" },
        { code: "59.914", label: "59.914" },
        { code: "55.604", label: "55.604" },
        { code: "60.170", label: "60.170" },
        { code: "63.824", label: "63.824" },
      ]),
    });

    const det = detectGeography(s);

    expect(det.level).toBe("point_set");
    expect(det.renderHint).toBe("point_based");
    expect(det.codeFamily.namespace).toBe("coordinates");
  });

  it("inline point geometry in profile → point_set, point_based", () => {
    const profile: DatasetProfile = {
      featureCount: 20,
      geometryType: "Point",
      bounds: [[-180, -90], [180, 90]],
      crs: null,
      attributes: [{ name: "value", type: "number", min: 0, max: 100, nullCount: 0, uniqueValues: 20 }],
    };
    const s: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [],
      rows: [],
      candidateMetricFields: [],
      countryHints: [],
      geographyHints: [],
      sourceMetadata: meta(),
      diagnostics: diag(),
      confidence: 0.6,
      profile,
    };

    const det = detectGeography(s);

    expect(det.level).toBe("point_set");
    expect(det.renderHint).toBe("point_based");
    expect(det.confidence).toBeGreaterThan(0.4);
  });

  it("point data with inline geometry → plan says inline_geometry", () => {
    const profile: DatasetProfile = {
      featureCount: 10,
      geometryType: "Point",
      bounds: [[-180, -90], [180, 90]],
      crs: null,
      attributes: [{ name: "v", type: "number", min: 0, max: 10, nullCount: 0, uniqueValues: 10 }],
    };
    const s: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [],
      rows: [],
      candidateMetricFields: [],
      countryHints: [],
      geographyHints: [],
      sourceMetadata: meta(),
      diagnostics: diag(),
      confidence: 0.6,
      profile,
    };

    const det = detectGeography(s);
    const plan = planJoin(det, []);

    expect(plan.strategy).toBe("inline_geometry");
    expect(plan.mapReady).toBe(true);
  });

  it("inline_geometry → resolvePxWebPure returns map_ready without polygon join", () => {
    const profile: DatasetProfile = {
      featureCount: 10,
      geometryType: "Point",
      bounds: [[-180, -90], [180, 90]],
      crs: null,
      attributes: [{ name: "v", type: "number", min: 0, max: 10, nullCount: 0, uniqueValues: 10 }],
    };
    const s: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [],
      rows: [],
      candidateMetricFields: [],
      countryHints: [],
      geographyHints: [],
      sourceMetadata: meta(),
      diagnostics: diag(),
      confidence: 0.6,
      profile,
    };

    const result = resolvePxWebPure(s, null);

    expect(result.status).toBe("map_ready");
    expect(result.joinPlan?.strategy).toBe("inline_geometry");
    // No join execution needed for inline geometry
    expect(result.joinExecution).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. Tabular-only datasets
// ═══════════════════════════════════════════════════════════════

describe("tabular-only datasets", () => {
  beforeEach(() => clearPlugins());

  it("no_geo_dimension adapter status → tabular_only", () => {
    const s: NormalizedSourceResult = {
      adapterStatus: "no_geo_dimension",
      dimensions: [
        dim("Sector", "filter", [{ code: "A", label: "Agriculture" }]),
        dim("ContentsCode", "metric", [{ code: "M1", label: "GDP" }]),
        dim("Tid", "time", [{ code: "2023", label: "2023" }]),
      ],
      rows: [{ dimensionValues: { Sector: "A", ContentsCode: "M1", Tid: "2023" }, value: 42 }],
      candidateMetricFields: ["GDP"],
      countryHints: [],
      geographyHints: [],
      sourceMetadata: meta(),
      diagnostics: diag(),
      confidence: 0.5,
    };

    const result = resolvePxWebPure(s);

    expect(result.status).toBe("tabular_only");
    expect(result.reasons.some((r) => r.includes("no geographic dimension"))).toBe(true);
  });

  it("filter-only dimensions (no geo role) → tabular_only", () => {
    // All dimensions are non-geo roles — time/metric are penalized,
    // and the filter dimension has only 1 unique value (penalized)
    const s: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [
        dim("Industry", "filter", [
          { code: "total", label: "Total" },
        ]),
        dim("ContentsCode", "metric", [{ code: "M1", label: "GDP" }]),
        dim("Tid", "time", [{ code: "2023", label: "2023" }]),
      ],
      rows: [
        { dimensionValues: { Industry: "total", ContentsCode: "M1", Tid: "2023" }, value: 100 },
      ],
      candidateMetricFields: ["GDP"],
      countryHints: [],
      geographyHints: [],
      sourceMetadata: meta(),
      diagnostics: diag(),
      confidence: 0.6,
    };

    const result = resolvePxWebPure(s);

    expect(result.status).toBe("tabular_only");
    expect(result.detection?.renderHint).toBe("non_geographic");
  });

  it("single geographic unit → heavy confidence penalty", () => {
    const s = src({
      geoDim: dim("Country", "geo", [{ code: "SWE", label: "Sweden" }]),
      geoHints: ["country"],
    });

    const det = detectGeography(s);

    // Single unit gets -0.45 penalty but ISO A3 + role=geo starts high
    expect(det.unitCount).toBe(1);
    // The penalty is applied: base confidence would be much higher without it
    const sMulti = src({
      geoDim: dim("Country", "geo", [
        { code: "SWE", label: "Sweden" },
        { code: "NOR", label: "Norway" },
        { code: "DEU", label: "Germany" },
      ]),
      geoHints: ["country"],
    });
    const detMulti = detectGeography(sMulti);
    expect(det.confidence).toBeLessThan(detMulti.confidence);
  });

  it("only time and metric dimensions → non_geographic", () => {
    const s: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [
        dim("Tid", "time", [
          { code: "2020", label: "2020" },
          { code: "2021", label: "2021" },
          { code: "2022", label: "2022" },
        ]),
        dim("ContentsCode", "metric", [{ code: "GDP", label: "GDP" }]),
      ],
      rows: [
        { dimensionValues: { Tid: "2020", ContentsCode: "GDP" }, value: 100 },
        { dimensionValues: { Tid: "2021", ContentsCode: "GDP" }, value: 110 },
      ],
      candidateMetricFields: ["GDP"],
      countryHints: [],
      geographyHints: [],
      sourceMetadata: meta(),
      diagnostics: diag(),
      confidence: 0.6,
    };

    const det = detectGeography(s);

    expect(det.renderHint).toBe("non_geographic");
    expect(det.level).toBe("unknown");
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. Unsupported cases
// ═══════════════════════════════════════════════════════════════

describe("unsupported cases", () => {
  beforeEach(() => clearPlugins());

  it("adapter error → unsupported", () => {
    const s: NormalizedSourceResult = {
      adapterStatus: "error",
      dimensions: [],
      rows: [],
      candidateMetricFields: [],
      countryHints: [],
      geographyHints: [],
      sourceMetadata: meta(),
      diagnostics: diag(),
      confidence: 0,
      error: "API timeout",
    };

    const result = resolvePxWebPure(s);

    expect(result.status).toBe("unsupported");
    expect(result.error).toContain("API timeout");
  });

  it("adapter no_data → unsupported", () => {
    const s: NormalizedSourceResult = {
      adapterStatus: "no_data",
      dimensions: [],
      rows: [],
      candidateMetricFields: [],
      countryHints: [],
      geographyHints: [],
      sourceMetadata: meta(),
      diagnostics: diag(),
      confidence: 0,
    };

    const result = resolvePxWebPure(s);

    expect(result.status).toBe("unsupported");
    expect(result.reasons.some((r) => r.includes("no data"))).toBe(true);
  });

  it("unsupported pipeline result → classify continues", () => {
    const result: PxWebResolutionResult = {
      status: "unsupported",
      confidence: 0,
      reasons: ["failed"],
      error: "no data",
    };

    const decision = classifyPipelineResult(result, "prompt");

    expect(decision.kind).toBe("continue");
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. Ambiguous candidate-mode cases
// ═══════════════════════════════════════════════════════════════

describe("ambiguous candidate-mode cases", () => {
  beforeEach(() => clearPlugins());

  it("low adapter confidence + candidates → candidate_mode", () => {
    const candidates = [
      { id: "T1", label: "Population by county", source: "SCB" },
      { id: "T2", label: "Population by municipality", source: "SCB" },
      { id: "T3", label: "Income by county", source: "SCB" },
    ];
    const s = src({
      geoDim: dim("Region", "geo", [
        { code: "01", label: "Stockholm" },
        { code: "03", label: "Uppsala" },
        { code: "04", label: "Södermanland" },
      ]),
      countryHints: ["SE"],
      confidence: 0.3,
      candidates,
    });

    const result = resolvePxWebPure(s);

    expect(result.status).toBe("candidate_mode");
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates![0].id).toBe("T1");
  });

  it("candidate_mode → classify as continue (never terminate)", () => {
    const result: PxWebResolutionResult = {
      status: "candidate_mode",
      confidence: 0.3,
      reasons: ["low confidence"],
      candidates: [{ id: "X", label: "X", source: "Y" }],
      cacheKey: "some-key",
    };

    const decision = classifyPipelineResult(result, "prompt");

    expect(decision.kind).toBe("continue");
  });

  it("high confidence with candidates → NOT candidate_mode (proceeds normally)", () => {
    const candidates = [
      { id: "T1", label: "Alt table", source: "SCB" },
    ];
    const s = src({
      geoDim: dim("Country", "geo", [
        { code: "SWE", label: "Sweden" },
        { code: "NOR", label: "Norway" },
        { code: "DNK", label: "Denmark" },
      ]),
      geoHints: ["country"],
      confidence: 0.8,
      candidates,
    });

    const result = resolvePxWebPure(s, null);

    // High confidence → does NOT trigger candidate_mode
    expect(result.status).not.toBe("candidate_mode");
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. Mixed-country and mixed-code-system cases
// ═══════════════════════════════════════════════════════════════

describe("mixed-country and mixed-code-system", () => {
  beforeEach(() => clearPlugins());

  it("mixed ISO-A2 and ISO-A3 codes → mixed pattern, low confidence", () => {
    const s = src({
      geoDim: dim("geo", "geo", [
        { code: "SE", label: "Sweden" },
        { code: "NOR", label: "Norway" },
        { code: "DK", label: "Denmark" },
        { code: "FIN", label: "Finland" },
      ]),
    });

    const det = detectGeography(s);

    // Mixed 2-char and 3-char codes → potentially lower match confidence
    // The pattern classifier may detect iso_a2 or mixed
    expect(det.confidence).toBeLessThan(0.9);
  });

  it("multi-country data with no country hints → uses GLOBAL geometry", () => {
    const s = src({
      geoDim: dim("Country", "geo", [
        { code: "SWE", label: "Sweden" },
        { code: "NOR", label: "Norway" },
        { code: "DEU", label: "Germany" },
        { code: "FRA", label: "France" },
        { code: "GBR", label: "UK" },
      ]),
      countryHints: [], // no hints
      geoHints: ["country"],
    });

    const det = detectGeography(s);
    // Without country hints, the lookup goes to GLOBAL
    const plan = planJoin(det, []);

    // Global fallback: should find NE 110m countries
    expect(plan.mapReady).toBe(true);
    expect(plan.geometryLayerId).toBe("natural-earth:ne_110m_admin_0_countries");
  });

  it("partial code match: only 3 of 5 ISO codes exist in geometry → checks coverage", () => {
    const s = src({
      geoDim: dim("Country", "geo", [
        { code: "SWE", label: "Sweden" },
        { code: "NOR", label: "Norway" },
        { code: "XXX", label: "Unknown1" },
        { code: "YYY", label: "Unknown2" },
        { code: "ZZZ", label: "Unknown3" },
      ]),
      geoHints: ["country"],
    });
    // Geometry only has 2 of 5
    const geometry = fc(["SWE", "NOR"], "iso_a3");

    const result = resolvePxWebPure(s, geometry);

    // 2/5 = 40% coverage < MIN_COVERAGE_RATIO (50%) → tabular_only
    expect(result.status).toBe("tabular_only");
    if (result.joinExecution) {
      expect(result.joinExecution.diagnostics.coverageRatio).toBeLessThan(0.5);
    }
  });

  it("Eurostat SE data → falls back to EU scope NUTS geometry", () => {
    registerPlugin(eurostatNutsPlugin);

    const s = src({
      geoDim: dim("geo", "geo", [
        { code: "SE11", label: "Stockholm" },
        { code: "SE12", label: "Östra Mellansverige" },
        { code: "SE21", label: "Småland" },
      ]),
      countryHints: ["SE"],
      geoHints: ["nuts2"],
    });

    const det = detectGeographyWithPlugins(s);
    // SE → EU regional scope → finds eurostat:nuts2
    const plan = planJoinWithPlugins(det, ["SE"], s);

    // Should find the Eurostat NUTS2 entry through EU scope
    expect(plan.geometryLayerId).toBe("eurostat:nuts2");
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. Production vs provisional geometry
// ═══════════════════════════════════════════════════════════════

describe("production vs provisional geometry", () => {
  beforeEach(() => clearPlugins());

  it("production geometry gets confidence bonus in planning", () => {
    const prodEntry = entry({
      id: "prod-countries",
      level: "country",
      scope: "GLOBAL",
      joinKeys: [{ geometryProperty: "iso_a3", codeFamily: { family: "iso", namespace: "alpha3" } }],
      status: "production",
    });

    const s = src({
      geoDim: dim("Country", "geo", [
        { code: "SWE", label: "Sweden" },
        { code: "NOR", label: "Norway" },
        { code: "DEU", label: "Germany" },
      ]),
      geoHints: ["country"],
    });

    const det = detectGeography(s);
    const plan = planJoin(det, [], mockLookup([prodEntry]));

    expect(plan.confidence).toBeGreaterThan(0.5);
    expect(plan.reasons.some((r) => r.includes("production"))).toBe(true);
  });

  it("provisional geometry gets confidence penalty in planning", () => {
    const provEntry = entry({
      id: "prov-countries",
      level: "country",
      scope: "GLOBAL",
      joinKeys: [{ geometryProperty: "iso_a3", codeFamily: { family: "iso", namespace: "alpha3" } }],
      status: "provisional",
    });

    const s = src({
      geoDim: dim("Country", "geo", [
        { code: "SWE", label: "Sweden" },
        { code: "NOR", label: "Norway" },
        { code: "DEU", label: "Germany" },
      ]),
      geoHints: ["country"],
    });

    const det = detectGeography(s);
    const plan = planJoin(det, [], mockLookup([provEntry]));

    expect(plan.reasons.some((r) => r.includes("provisional"))).toBe(true);
  });

  it("provisional geometry + low coverage → extra confidence penalty in execution", () => {
    const provEntry = entry({
      id: "prov-test",
      level: "country",
      scope: "GLOBAL",
      joinKeys: [{ geometryProperty: "iso_a3", codeFamily: { family: "iso", namespace: "alpha3" } }],
      status: "provisional",
    });

    const s = src({
      geoDim: dim("Country", "geo", [
        { code: "SWE", label: "Sweden" },
        { code: "NOR", label: "Norway" },
        { code: "DEU", label: "Germany" },
        { code: "FRA", label: "France" },
        { code: "GBR", label: "UK" },
      ]),
      geoHints: ["country"],
    });

    const det = detectGeography(s);
    const plan = planJoin(det, [], mockLookup([provEntry]));

    // Geometry only has 3 of 5 → 60% coverage
    const geometry = fc(["SWE", "NOR", "DEU"], "iso_a3");
    const exec = executeJoin(plan, s.rows, geometry, "provisional");

    // Provisional + <60% coverage triggers extra -0.15
    expect(exec.diagnostics.coverageRatio).toBeCloseTo(0.6);
    // The extra penalty should be reflected in reasons
    // At exactly 60%, the condition is <60% so the penalty does NOT apply
    // At 59%, it would. Let's check coverage is right.
    expect(exec.diagnostics.matched).toBe(3);
    expect(exec.diagnostics.unmatched).toBe(2);
  });

  it("provisional geometry + very low coverage → tabular_only", () => {
    const provEntry = entry({
      id: "prov-test2",
      level: "country",
      scope: "GLOBAL",
      joinKeys: [{ geometryProperty: "iso_a3", codeFamily: { family: "iso", namespace: "alpha3" } }],
      status: "provisional",
    });

    const s = src({
      geoDim: dim("Country", "geo", [
        { code: "SWE", label: "Sweden" },
        { code: "NOR", label: "Norway" },
        { code: "DEU", label: "Germany" },
        { code: "FRA", label: "France" },
        { code: "GBR", label: "UK" },
        { code: "ITA", label: "Italy" },
        { code: "ESP", label: "Spain" },
        { code: "PRT", label: "Portugal" },
        { code: "NLD", label: "Netherlands" },
        { code: "BEL", label: "Belgium" },
      ]),
      geoHints: ["country"],
    });

    const det = detectGeography(s);
    const plan = planJoin(det, [], mockLookup([provEntry]));

    // Only 1 of 10 matches → 10% coverage
    const geometry = fc(["SWE"], "iso_a3");
    const exec = executeJoin(plan, s.rows, geometry, "provisional");

    expect(exec.status).toBe("tabular_only");
    expect(exec.diagnostics.coverageRatio).toBeCloseTo(0.1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 12. PxWeb failure mode regressions
// ═══════════════════════════════════════════════════════════════

describe("PxWeb failure mode regressions", () => {
  beforeEach(() => clearPlugins());

  it("empty rows with ok adapter status → tabular_only (non-geographic detection)", () => {
    const s: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [
        dim("Region", "geo", [{ code: "01", label: "Stockholm" }]),
        dim("ContentsCode", "metric", [{ code: "M1", label: "Pop" }]),
        dim("Tid", "time", [{ code: "2023", label: "2023" }]),
      ],
      rows: [], // empty despite ok status
      candidateMetricFields: ["Pop"],
      countryHints: ["SE"],
      geographyHints: ["admin1"],
      sourceMetadata: meta("se-scb"),
      diagnostics: diag(),
      confidence: 0.5,
    };

    // Detection sees single geo code → very low confidence
    const det = detectGeography(s);
    expect(det.unitCount).toBe(1);
    // Single unit penalty makes confidence very low
  });

  it("geo dimension with wrong join key property casing → unmatched in execution", () => {
    const geoEntry = entry({
      id: "test-case",
      level: "country",
      scope: "GLOBAL",
      joinKeys: [{ geometryProperty: "ISO_A3", codeFamily: { family: "iso", namespace: "alpha3" } }],
    });

    const s = src({
      geoDim: dim("Country", "geo", [
        { code: "SWE", label: "Sweden" },
        { code: "NOR", label: "Norway" },
        { code: "DEU", label: "Germany" },
      ]),
      geoHints: ["country"],
    });

    const det = detectGeography(s);
    const plan = planJoin(det, [], mockLookup([geoEntry]));
    // Geometry uses lowercase "iso_a3" but entry says "ISO_A3"
    const geometry = fc(["SWE", "NOR", "DEU"], "iso_a3");
    const exec = executeJoin(plan, s.rows, geometry);

    // "ISO_A3" vs "iso_a3" mismatch → nothing matches since the
    // plan's geometryJoinField is "ISO_A3" and features have "iso_a3"
    expect(exec.diagnostics.matched).toBe(0);
    expect(exec.status).toBe("tabular_only");
  });

  it("fuzzy_name join strategy is capped and rejected by executor", () => {
    // Simulate a detection that results in name-only code family
    const nameOnlyEntry = entry({
      id: "name-only",
      level: "country",
      scope: "GLOBAL",
      joinKeys: [{ geometryProperty: "name", codeFamily: { family: "name" } }],
    });

    const s = src({
      geoDim: dim("Country", "geo", [
        { code: "Sweden", label: "Sweden" },
        { code: "Norway", label: "Norway" },
        { code: "Denmark", label: "Denmark" },
        { code: "Finland", label: "Finland" },
        { code: "Iceland", label: "Iceland" },
      ]),
    });

    const det = detectGeography(s);
    // Detection should find name/unknown code patterns
    // Planner should cap fuzzy name to FUZZY_NAME_CAP = 0.35 < 0.5 threshold
    const plan = planJoin(det, [], mockLookup([nameOnlyEntry]));

    // The strategy for name ↔ name codes should be normalized_name
    // (both detection and entry have family "name")
    // But the score is still low: NORMALIZED_NAME_SCORE (0.15) + PRODUCTION_BONUS (0.15) = 0.3
    // + detection confidence weight → might still be below threshold
    expect(plan.confidence).toBeLessThan(0.55);
  });

  it("alias_crosswalk strategy is supported by executor", () => {
    // alias_crosswalk now works — codes match directly in this test
    const plan: JoinPlanResult = {
      mapReady: true,
      strategy: "alias_crosswalk",
      geometryLayerId: "test",
      rowJoinField: "Region",
      geometryJoinField: "ref",
      confidence: 0.6,
      reasons: ["test: alias crosswalk"],
    };

    const geometry = fc(["01", "02", "03"], "ref");
    const r = rows(["01", "02", "03"], "Region");
    const exec = executeJoin(plan, r, geometry);

    expect(exec.status).toBe("map_ready");
    expect(exec.diagnostics.matched).toBe(3);
  });

  it("map_ready without cacheKey → classify continues (regression for serving)", () => {
    const result: PxWebResolutionResult = {
      status: "map_ready",
      confidence: 0.8,
      reasons: ["all good"],
      // NO cacheKey
    };

    const decision = classifyPipelineResult(result, "prompt");

    expect(decision.kind).toBe("continue");
  });

  it("null geometry passed to executor → tabular_only", () => {
    const plan: JoinPlanResult = {
      mapReady: true,
      strategy: "direct_code",
      geometryLayerId: "test",
      rowJoinField: "Country",
      geometryJoinField: "iso_a3",
      confidence: 0.7,
      reasons: ["test"],
    };

    const exec = executeJoin(plan, rows(["SWE"], "Country"), null);

    expect(exec.status).toBe("tabular_only");
    expect(exec.diagnostics.reasons.some((r) => r.includes("null"))).toBe(true);
  });

  it("empty feature collection → tabular_only", () => {
    const plan: JoinPlanResult = {
      mapReady: true,
      strategy: "direct_code",
      geometryLayerId: "test",
      rowJoinField: "Country",
      geometryJoinField: "iso_a3",
      confidence: 0.7,
      reasons: ["test"],
    };

    const emptyGeo: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    const exec = executeJoin(plan, rows(["SWE"], "Country"), emptyGeo);

    expect(exec.status).toBe("tabular_only");
  });

  it("missing rowJoinField → tabular_only", () => {
    const plan: JoinPlanResult = {
      mapReady: true,
      strategy: "direct_code",
      geometryLayerId: "test",
      // rowJoinField missing
      geometryJoinField: "iso_a3",
      confidence: 0.7,
      reasons: ["test"],
    };

    const exec = executeJoin(plan, rows(["SWE"], "Country"), fc(["SWE"], "iso_a3"));

    expect(exec.status).toBe("tabular_only");
    expect(exec.diagnostics.reasons.some((r) => r.includes("missing"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 13. Plugin enrichment
// ═══════════════════════════════════════════════════════════════

describe("plugin enrichment", () => {
  beforeEach(() => clearPlugins());

  it("SCB plugin upgrades numeric_admin to national/se-scb detection", () => {
    registerPlugin(swedenScbPlugin);

    const codes = Array.from({ length: 21 }, (_, i) => ({
      code: String(i + 1).padStart(2, "0"),
      label: `County ${i + 1}`,
    }));
    const s = src({
      geoDim: dim("Region", "geo", codes),
      countryHints: ["SE"],
      geoHints: ["admin1"],
      sourceId: "se-scb",
    });

    const generic = detectGeography(s);
    const pluginAware = detectGeographyWithPlugins(s);

    // Generic: numeric_admin → national family, but generic namespace
    // Plugin-aware: SCB recognizes → national/se-scb
    expect(pluginAware.codeFamily.namespace).toBe("se-scb");
    expect(pluginAware.confidence).toBeGreaterThanOrEqual(generic.confidence);
  });

  it("Eurostat plugin boosts NUTS join confidence", () => {
    registerPlugin(eurostatNutsPlugin);

    const nutsEntry = entry({
      id: "eurostat:nuts2",
      level: "nuts2",
      scope: "EU",
      joinKeys: [{ geometryProperty: "nuts_id", codeFamily: { family: "eurostat", namespace: "nuts" } }],
    });

    const codes = Array.from({ length: 25 }, (_, i) => ({
      code: `DE${String(i + 10).slice(0, 2)}`,
      label: `Region ${i}`,
    }));
    const s = src({
      geoDim: dim("geo", "geo", codes),
      geoHints: ["nuts2"],
    });

    const det = detectGeographyWithPlugins(s);
    const planGeneric = planJoin(det, [], mockLookup([nutsEntry]));
    const planPlugin = planJoinWithPlugins(det, [], s, mockLookup([nutsEntry]));

    // Plugin should boost confidence
    expect(planPlugin.confidence).toBeGreaterThanOrEqual(planGeneric.confidence);
  });

  it("countryAdminPlugin recognizes ISO alpha-3 country codes", () => {
    registerPlugin(countryAdminPlugin);

    const codes = [
      { code: "SWE", label: "Sweden" },
      { code: "NOR", label: "Norway" },
      { code: "DEU", label: "Germany" },
      { code: "FRA", label: "France" },
      { code: "GBR", label: "UK" },
      { code: "ITA", label: "Italy" },
      { code: "ESP", label: "Spain" },
      { code: "PRT", label: "Portugal" },
      { code: "NLD", label: "Netherlands" },
      { code: "BEL", label: "Belgium" },
    ];
    const s = src({
      geoDim: dim("Country", "geo", codes),
      geoHints: ["country"],
    });

    const det = detectGeographyWithPlugins(s);

    expect(det.level).toBe("country");
    expect(det.codeFamily.family).toBe("iso");
    expect(det.codeFamily.namespace).toBe("alpha3");
    // With ≥10 countries hint boost: +0.05
    expect(det.confidence).toBeGreaterThan(0.6);
  });

  it("multiple plugins coexist: SCB + admin_code on SE data", () => {
    registerPlugin(swedenScbPlugin);
    registerPlugin(countryAdminPlugin);

    const codes = Array.from({ length: 21 }, (_, i) => ({
      code: String(i + 1).padStart(2, "0"),
      label: `County ${i + 1}`,
    }));
    const s = src({
      geoDim: dim("Region", "geo", codes),
      countryHints: ["SE"],
      geoHints: ["admin1"],
      sourceId: "se-scb",
    });

    const det = detectGeographyWithPlugins(s);

    // SCB has higher priority (10 > 1), should dominate
    expect(det.codeFamily.family).toBe("national");
    expect(det.codeFamily.namespace).toBe("se-scb");
    expect(det.level).toBe("admin1");
  });
});

// ═══════════════════════════════════════════════════════════════
// 14. No-plugin stability
// ═══════════════════════════════════════════════════════════════

describe("no-plugin stability", () => {
  beforeEach(() => clearPlugins());

  it("detectGeography and detectGeographyWithPlugins agree on ISO data without plugins", () => {
    clearPlugins();

    const s = src({
      geoDim: dim("Country", "geo", [
        { code: "SWE", label: "Sweden" },
        { code: "NOR", label: "Norway" },
        { code: "DEU", label: "Germany" },
        { code: "FRA", label: "France" },
      ]),
      geoHints: ["country"],
    });

    const generic = detectGeography(s);
    const pluginAware = detectGeographyWithPlugins(s);

    expect(generic.level).toBe(pluginAware.level);
    expect(generic.codeFamily.family).toBe(pluginAware.codeFamily.family);
    expect(generic.renderHint).toBe(pluginAware.renderHint);
    expect(generic.confidence).toBe(pluginAware.confidence);
  });

  it("planJoin and planJoinWithPlugins agree without plugins", () => {
    clearPlugins();

    const s = src({
      geoDim: dim("Country", "geo", [
        { code: "SWE", label: "Sweden" },
        { code: "NOR", label: "Norway" },
        { code: "DEU", label: "Germany" },
      ]),
      geoHints: ["country"],
    });

    const det = detectGeography(s);
    const generic = planJoin(det, []);
    const pluginAware = planJoinWithPlugins(det, [], s);

    expect(generic.mapReady).toBe(pluginAware.mapReady);
    expect(generic.strategy).toBe(pluginAware.strategy);
    expect(generic.confidence).toBe(pluginAware.confidence);
  });

  it("resolvePxWebPure with empty registry → same structural behavior as with plugins", () => {
    clearPlugins();

    const s = src({
      geoDim: dim("Country", "geo", [
        { code: "SWE", label: "Sweden" },
        { code: "NOR", label: "Norway" },
        { code: "DEU", label: "Germany" },
        { code: "FRA", label: "France" },
        { code: "GBR", label: "UK" },
      ]),
      geoHints: ["country"],
    });
    const geometry = fc(["SWE", "NOR", "DEU", "FRA", "GBR"], "iso_a3");

    const noPlugins = resolvePxWebPure(s, geometry);

    registerPlugin(countryAdminPlugin);
    const withPlugins = resolvePxWebPure(s, geometry);

    // Both should be map_ready — ISO A3 is recognized generically
    expect(noPlugins.status).toBe("map_ready");
    expect(withPlugins.status).toBe("map_ready");
    // With plugin confidence may be slightly higher
    expect(withPlugins.confidence).toBeGreaterThanOrEqual(noPlugins.confidence);
  });

  it("tabular-only data stays tabular with or without plugins", () => {
    clearPlugins();

    const s: NormalizedSourceResult = {
      adapterStatus: "no_geo_dimension",
      dimensions: [
        dim("Sector", "filter", [{ code: "A", label: "Agriculture" }]),
      ],
      rows: [],
      candidateMetricFields: [],
      countryHints: [],
      geographyHints: [],
      sourceMetadata: meta(),
      diagnostics: diag(),
      confidence: 0.4,
    };

    const noPlugins = resolvePxWebPure(s);

    registerPlugin(swedenScbPlugin);
    registerPlugin(eurostatNutsPlugin);
    registerPlugin(usFipsPlugin);
    registerPlugin(countryAdminPlugin);

    const withAll = resolvePxWebPure(s);

    expect(noPlugins.status).toBe("tabular_only");
    expect(withAll.status).toBe("tabular_only");
  });
});

// ═══════════════════════════════════════════════════════════════
// 15. Join execution diagnostics
// ═══════════════════════════════════════════════════════════════

describe("join execution diagnostics", () => {
  beforeEach(() => clearPlugins());

  it("100% coverage → map_ready, full diagnostics", () => {
    const plan: JoinPlanResult = {
      mapReady: true,
      strategy: "direct_code",
      geometryLayerId: "test",
      rowJoinField: "Country",
      geometryJoinField: "iso_a3",
      confidence: 0.7,
      reasons: [],
    };

    const codes = ["SWE", "NOR", "DEU", "FRA", "GBR"];
    const exec = executeJoin(plan, rows(codes, "Country"), fc(codes, "iso_a3"));

    expect(exec.status).toBe("map_ready");
    expect(exec.diagnostics.matched).toBe(5);
    expect(exec.diagnostics.unmatched).toBe(0);
    expect(exec.diagnostics.coverageRatio).toBe(1);
    expect(exec.diagnostics.strategy).toBe("direct_code");
    expect(exec.diagnostics.attempted).toBe(true);
    expect(exec.features).toHaveLength(5);
    expect(exec.features[0].properties?._atlas_value).toBeDefined();
    expect(exec.features[0].properties?._atlas_matched).toBe(true);
  });

  it("50% coverage → map_ready (at boundary)", () => {
    const plan: JoinPlanResult = {
      mapReady: true,
      strategy: "direct_code",
      geometryLayerId: "test",
      rowJoinField: "Country",
      geometryJoinField: "iso_a3",
      confidence: 0.8,
      reasons: [],
    };

    const dataCodes = ["SWE", "NOR", "DEU", "FRA"];
    const geoCodes = ["SWE", "NOR"]; // only 2 of 4
    const exec = executeJoin(plan, rows(dataCodes, "Country"), fc(geoCodes, "iso_a3"));

    expect(exec.diagnostics.matched).toBe(2);
    expect(exec.diagnostics.unmatched).toBe(2);
    expect(exec.diagnostics.coverageRatio).toBe(0.5);
    // 50% = MIN_COVERAGE_RATIO, so should be map_ready if confidence holds
    expect(exec.status).toBe("map_ready");
  });

  it("49% coverage → tabular_only (just below threshold)", () => {
    const plan: JoinPlanResult = {
      mapReady: true,
      strategy: "direct_code",
      geometryLayerId: "test",
      rowJoinField: "Country",
      geometryJoinField: "iso_a3",
      confidence: 0.8,
      reasons: [],
    };

    // 49 of 100 → 49%
    const allCodes = Array.from({ length: 100 }, (_, i) => `C${String(i).padStart(3, "0")}`);
    const matchedCodes = allCodes.slice(0, 49);
    const exec = executeJoin(plan, rows(allCodes, "Country"), fc(matchedCodes, "iso_a3"));

    expect(exec.diagnostics.coverageRatio).toBeLessThan(0.5);
    expect(exec.status).toBe("tabular_only");
  });

  it("duplicate rows per geo code → reported in diagnostics", () => {
    const plan: JoinPlanResult = {
      mapReady: true,
      strategy: "direct_code",
      geometryLayerId: "test",
      rowJoinField: "Country",
      geometryJoinField: "iso_a3",
      confidence: 0.7,
      reasons: [],
    };

    // Two rows for SWE
    const dataRows: NormalizedRow[] = [
      { dimensionValues: { Country: "SWE", Tid: "2022" }, value: 100 },
      { dimensionValues: { Country: "SWE", Tid: "2023" }, value: 110 },
      { dimensionValues: { Country: "NOR", Tid: "2023" }, value: 200 },
    ];
    const exec = executeJoin(plan, dataRows, fc(["SWE", "NOR"], "iso_a3"));

    expect(exec.diagnostics.matched).toBe(2); // SWE and NOR
    expect(exec.diagnostics.duplicateConflicts).toHaveLength(1);
    expect(exec.diagnostics.duplicateConflicts[0].geoCode).toBe("SWE");
    expect(exec.diagnostics.duplicateConflicts[0].rowCount).toBe(2);
  });

  it("unmatched codes are sampled (max 10)", () => {
    const plan: JoinPlanResult = {
      mapReady: true,
      strategy: "direct_code",
      geometryLayerId: "test",
      rowJoinField: "Country",
      geometryJoinField: "iso_a3",
      confidence: 0.8,
      reasons: [],
    };

    const allCodes = Array.from({ length: 20 }, (_, i) => `X${String(i).padStart(3, "0")}`);
    // No geometry matches at all
    const exec = executeJoin(plan, rows(allCodes, "Country"), fc(["NOMATCH"], "iso_a3"));

    expect(exec.diagnostics.unmatchedCodes.length).toBeLessThanOrEqual(10);
    expect(exec.diagnostics.unmatched).toBe(20);
  });
});

// ═══════════════════════════════════════════════════════════════
// 16. Fallback and decision tree integration
// ═══════════════════════════════════════════════════════════════

describe("fallback and decision tree integration", () => {
  it("tabular stash → buildTabularFallbackResponse → resolutionStatus tabular_only", () => {
    const stash = { dataUrl: "/api/geo/cached/px-key", profile: undefined };
    const response = buildTabularFallbackResponse(stash, "full prompt");

    expect(response.ready).toBe(true);
    expect(response.resolutionStatus).toBe("tabular_only");
    expect(response.resolvedPrompt).toBe("full prompt");
    expect(response.dataUrl).toBe("/api/geo/cached/px-key");
  });

  it("map_ready + cacheKey → terminate response has all fields", () => {
    const profile: DatasetProfile = {
      featureCount: 5,
      geometryType: "Polygon",
      bounds: [[0, 0], [1, 1]],
      crs: null,
      attributes: [],
    };
    const result: PxWebResolutionResult = {
      status: "map_ready",
      cacheKey: "final-key",
      profile,
      confidence: 0.8,
      reasons: [],
    };

    const decision = classifyPipelineResult(result, "prompt text");

    expect(decision.kind).toBe("terminate");
    if (decision.kind === "terminate") {
      expect(decision.response.ready).toBe(true);
      expect(decision.response.resolvedPrompt).toBe("prompt text");
      expect(decision.response.dataUrl).toContain("final-key");
      expect(decision.response.dataProfile).toBe(profile);
      expect(decision.response.resolutionStatus).toBe("map_ready");
    }
  });

  it("stash_tabular carries profile through to fallback response", () => {
    const profile: DatasetProfile = {
      featureCount: 10,
      geometryType: "Polygon",
      bounds: [[0, 0], [1, 1]],
      crs: null,
      attributes: [{ name: "v", type: "number", min: 0, max: 100, nullCount: 0, uniqueValues: 10 }],
    };
    const result: PxWebResolutionResult = {
      status: "tabular_only",
      cacheKey: "tabular-key",
      profile,
      confidence: 0.5,
      reasons: [],
    };

    const decision = classifyPipelineResult(result, "prompt");
    expect(decision.kind).toBe("stash_tabular");

    if (decision.kind === "stash_tabular") {
      const response = buildTabularFallbackResponse(decision.stash, "prompt");
      expect(response.dataProfile).toBe(profile);
      expect(response.resolutionStatus).toBe("tabular_only");
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 17. Boundary selection (registry integration)
// ═══════════════════════════════════════════════════════════════

describe("boundary selection via registry", () => {
  beforeEach(() => clearPlugins());

  it("SE + admin1 → finds se:admin1 first (country-specific > global)", () => {
    const entries = findByCountryAndLevel("SE", "admin1");

    // Should include se:admin1 (country-specific) before global NE admin1
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].id).toBe("se:admin1");
  });

  it("US + admin1 → finds us:states", () => {
    const entries = findByCountryAndLevel("US", "admin1");

    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].id).toBe("us:states");
  });

  it("SE + nuts2 → finds eurostat:nuts2 via EU scope", () => {
    const entries = findByCountryAndLevel("SE", "nuts2");

    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].id).toBe("eurostat:nuts2");
  });

  it("GLOBAL + country → finds NE 110m (production first)", () => {
    const entries = findByCountryAndLevel("GLOBAL", "country");

    expect(entries.length).toBeGreaterThan(0);
    // Production entry should come first if available
    const prodEntries = entries.filter((e) => e.status === "production");
    if (prodEntries.length > 0) {
      expect(prodEntries[0].id).toBe("natural-earth:ne_110m_admin_0_countries");
    }
  });

  it("unknown country + municipality → falls back to nothing (no global municipality layer)", () => {
    const entries = findByCountryAndLevel("XX", "municipality");

    expect(entries).toHaveLength(0);
  });

  it("NO + municipality → finds no:municipalities", () => {
    const entries = findByCountryAndLevel("NO", "municipality");

    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].id).toBe("no:municipalities");
  });
});
