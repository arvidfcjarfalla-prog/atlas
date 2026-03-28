import { describe, it, expect } from "vitest";
import {
  executeJoin,
  normalizeForJoin,
  type JoinExecutionResult,
} from "../tools/geometry-join";
import type { JoinPlanResult, JoinStrategy } from "../tools/join-planner";
import type { NormalizedRow } from "../tools/normalized-result";

// ═══════════════════════════════════════════════════════════════
// Test helpers
// ═══════════════════════════════════════════════════════════════

function makePlan(opts: {
  mapReady?: boolean;
  geometryLayerId?: string;
  rowJoinField?: string | null;
  geometryJoinField?: string | null;
  strategy?: JoinStrategy;
  confidence?: number;
}): JoinPlanResult {
  return {
    mapReady: opts.mapReady ?? true,
    geometryLayerId: opts.geometryLayerId ?? "test:layer",
    rowJoinField: opts.rowJoinField === null ? undefined : (opts.rowJoinField ?? "Region"),
    geometryJoinField: opts.geometryJoinField === null ? undefined : (opts.geometryJoinField ?? "code"),
    strategy: opts.strategy ?? "direct_code",
    confidence: opts.confidence ?? 0.7,
    reasons: [],
  };
}

function makeRow(geoCode: string, value: number | null): NormalizedRow {
  return {
    dimensionValues: { Region: geoCode, Tid: "2023" },
    value,
  };
}

function makeFeature(
  code: string,
  name: string,
): GeoJSON.Feature {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
    properties: { code, name },
  };
}

function makeFC(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features };
}

// ═══════════════════════════════════════════════════════════════
// normalizeForJoin
// ═══════════════════════════════════════════════════════════════

describe("normalizeForJoin", () => {
  it("lowercases", () => {
    expect(normalizeForJoin("Stockholm")).toBe("stockholm");
  });

  it("strips diacritics", () => {
    expect(normalizeForJoin("Göteborg")).toBe("goteborg");
    expect(normalizeForJoin("Malmö")).toBe("malmo");
  });

  it("trims whitespace", () => {
    expect(normalizeForJoin("  Oslo  ")).toBe("oslo");
  });

  it("handles combined normalization", () => {
    expect(normalizeForJoin("  Île-de-France  ")).toBe("ile de france");
  });
});

// ═══════════════════════════════════════════════════════════════
// Full successful join
// ═══════════════════════════════════════════════════════════════

describe("full successful join", () => {
  const plan = makePlan({
    strategy: "direct_code",
    confidence: 0.75,
    geometryJoinField: "code",
    rowJoinField: "Region",
  });

  const rows: NormalizedRow[] = [
    makeRow("SE", 10000),
    makeRow("NO", 5000),
    makeRow("DK", 6000),
    makeRow("FI", 5500),
  ];

  const geometry = makeFC([
    makeFeature("SE", "Sweden"),
    makeFeature("NO", "Norway"),
    makeFeature("DK", "Denmark"),
    makeFeature("FI", "Finland"),
    makeFeature("IS", "Iceland"),
  ]);

  it("returns map_ready with full match", () => {
    const result = executeJoin(plan, rows, geometry);
    expect(result.status).toBe("map_ready");
    expect(result.features).toHaveLength(4);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("attaches metric values to features", () => {
    const result = executeJoin(plan, rows, geometry);
    const seFeature = result.features.find(
      (f) => f.properties?._atlas_geo_code === "SE",
    );
    expect(seFeature).toBeDefined();
    expect(seFeature!.properties!._atlas_value).toBe(10000);
    expect(seFeature!.properties!._atlas_matched).toBe(true);
  });

  it("preserves original dimension values", () => {
    const result = executeJoin(plan, rows, geometry);
    const noFeature = result.features.find(
      (f) => f.properties?._atlas_geo_code === "NO",
    );
    expect(noFeature!.properties!.Region).toBe("NO");
    expect(noFeature!.properties!.Tid).toBe("2023");
  });

  it("preserves original geometry properties", () => {
    const result = executeJoin(plan, rows, geometry);
    const dkFeature = result.features.find(
      (f) => f.properties?._atlas_geo_code === "DK",
    );
    expect(dkFeature!.properties!.name).toBe("Denmark");
    expect(dkFeature!.properties!.code).toBe("DK");
  });

  it("reports 100% coverage", () => {
    const result = executeJoin(plan, rows, geometry);
    expect(result.diagnostics.matched).toBe(4);
    expect(result.diagnostics.unmatched).toBe(0);
    expect(result.diagnostics.coverageRatio).toBe(1);
  });

  it("has non-empty reasons", () => {
    const result = executeJoin(plan, rows, geometry);
    expect(result.diagnostics.reasons.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Partial join with diagnostics
// ═══════════════════════════════════════════════════════════════

describe("partial join with diagnostics", () => {
  it("reports partial coverage and unmatched codes", () => {
    const plan = makePlan({ confidence: 0.75 });
    const rows: NormalizedRow[] = [
      makeRow("SE", 10000),
      makeRow("NO", 5000),
      makeRow("XX", 999),   // no match
      makeRow("YY", 888),   // no match
    ];
    const geometry = makeFC([
      makeFeature("SE", "Sweden"),
      makeFeature("NO", "Norway"),
      makeFeature("DK", "Denmark"),
    ]);

    const result = executeJoin(plan, rows, geometry);

    expect(result.diagnostics.matched).toBe(2);
    expect(result.diagnostics.unmatched).toBe(2);
    expect(result.diagnostics.coverageRatio).toBe(0.5);
    expect(result.diagnostics.unmatchedCodes).toContain("XX");
    expect(result.diagnostics.unmatchedCodes).toContain("YY");
  });

  it("is map_ready when coverage is exactly 50%", () => {
    const plan = makePlan({ confidence: 0.75 });
    const rows: NormalizedRow[] = [
      makeRow("SE", 10000),
      makeRow("XX", 999),
    ];
    const geometry = makeFC([makeFeature("SE", "Sweden")]);

    const result = executeJoin(plan, rows, geometry);

    expect(result.diagnostics.coverageRatio).toBe(0.5);
    // 0.75 - penalties for low coverage
    expect(result.status).toBe("map_ready");
    expect(result.features).toHaveLength(1);
  });

  it("applies coverage penalty to confidence", () => {
    const plan = makePlan({ confidence: 0.75 });
    // 6 rows, 4 matched = 67% coverage
    const rows: NormalizedRow[] = [
      makeRow("SE", 1), makeRow("NO", 2), makeRow("DK", 3),
      makeRow("FI", 4), makeRow("XX", 5), makeRow("YY", 6),
    ];
    const geometry = makeFC([
      makeFeature("SE", "S"), makeFeature("NO", "N"),
      makeFeature("DK", "D"), makeFeature("FI", "F"),
    ]);

    const result = executeJoin(plan, rows, geometry);

    // Coverage 67% → deficit from 80% is ~2 units → -0.10
    expect(result.confidence).toBeLessThan(0.75);
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.status).toBe("map_ready");
  });
});

// ═══════════════════════════════════════════════════════════════
// No matches
// ═══════════════════════════════════════════════════════════════

describe("no matches", () => {
  it("returns tabular_only with zero confidence when nothing matches", () => {
    const plan = makePlan({ confidence: 0.8 });
    const rows: NormalizedRow[] = [
      makeRow("XX", 100),
      makeRow("YY", 200),
      makeRow("ZZ", 300),
    ];
    const geometry = makeFC([
      makeFeature("SE", "Sweden"),
      makeFeature("NO", "Norway"),
    ]);

    const result = executeJoin(plan, rows, geometry);

    expect(result.status).toBe("tabular_only");
    expect(result.features).toHaveLength(0);
    expect(result.diagnostics.matched).toBe(0);
    expect(result.diagnostics.unmatched).toBe(3);
    expect(result.diagnostics.coverageRatio).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it("returns tabular_only when geometry is null", () => {
    const plan = makePlan({ confidence: 0.8 });
    const rows: NormalizedRow[] = [makeRow("SE", 100)];

    const result = executeJoin(plan, rows, null);

    expect(result.status).toBe("tabular_only");
    expect(result.features).toHaveLength(0);
    expect(result.diagnostics.attempted).toBe(false);
  });

  it("returns tabular_only when geometry has no features", () => {
    const plan = makePlan({ confidence: 0.8 });
    const rows: NormalizedRow[] = [makeRow("SE", 100)];

    const result = executeJoin(plan, rows, makeFC([]));

    expect(result.status).toBe("tabular_only");
    expect(result.diagnostics.attempted).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Duplicate key conflicts
// ═══════════════════════════════════════════════════════════════

describe("duplicate key conflicts", () => {
  const geometry = makeFC([
    makeFeature("SE", "Sweden"),
    makeFeature("NO", "Norway"),
  ]);

  it("reports duplicate conflicts and uses first-value resolution", () => {
    const plan = makePlan({ confidence: 0.75 });
    const rows: NormalizedRow[] = [
      makeRow("SE", 100),
      makeRow("SE", 200), // duplicate
      makeRow("NO", 300),
    ];

    const result = executeJoin(plan, rows, geometry, "production", "first");

    expect(result.diagnostics.duplicateConflicts).toHaveLength(1);
    expect(result.diagnostics.duplicateConflicts[0].geoCode).toBe("SE");
    expect(result.diagnostics.duplicateConflicts[0].rowCount).toBe(2);
    expect(result.diagnostics.duplicateConflicts[0].resolution).toBe("first");

    const seFeature = result.features.find(
      (f) => f.properties?._atlas_geo_code === "SE",
    );
    expect(seFeature!.properties!._atlas_value).toBe(100); // first value
  });

  it("sums duplicate values when using sum resolution", () => {
    const plan = makePlan({ confidence: 0.75 });
    const rows: NormalizedRow[] = [
      makeRow("SE", 100),
      makeRow("SE", 200),
      makeRow("NO", 300),
    ];

    const result = executeJoin(plan, rows, geometry, "production", "sum");

    const seFeature = result.features.find(
      (f) => f.properties?._atlas_geo_code === "SE",
    );
    expect(seFeature!.properties!._atlas_value).toBe(300); // 100 + 200
  });

  it("averages duplicate values when using average resolution", () => {
    const plan = makePlan({ confidence: 0.75 });
    const rows: NormalizedRow[] = [
      makeRow("SE", 100),
      makeRow("SE", 200),
      makeRow("NO", 300),
    ];

    const result = executeJoin(plan, rows, geometry, "production", "average");

    const seFeature = result.features.find(
      (f) => f.properties?._atlas_geo_code === "SE",
    );
    expect(seFeature!.properties!._atlas_value).toBe(150); // (100 + 200) / 2
  });

  it("handles null values in duplicates", () => {
    const plan = makePlan({ confidence: 0.75 });
    const rows: NormalizedRow[] = [
      makeRow("SE", null),
      makeRow("SE", 200),
      makeRow("NO", 300),
    ];

    const result = executeJoin(plan, rows, geometry, "production", "sum");

    const seFeature = result.features.find(
      (f) => f.properties?._atlas_geo_code === "SE",
    );
    // null is filtered out, only 200 remains
    expect(seFeature!.properties!._atlas_value).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════
// Low-coverage downgrade
// ═══════════════════════════════════════════════════════════════

describe("low-coverage downgrade", () => {
  it("downgrades to tabular_only when coverage below 20%", () => {
    const plan = makePlan({ confidence: 0.75 });
    // 10 rows, only 1 matches → 10% coverage
    const rows: NormalizedRow[] = [
      makeRow("SE", 1),
      ...Array.from({ length: 9 }, (_, i) => makeRow(`X${i}`, i)),
    ];
    const geometry = makeFC([makeFeature("SE", "Sweden")]);

    const result = executeJoin(plan, rows, geometry);

    expect(result.diagnostics.coverageRatio).toBe(0.1);
    expect(result.status).toBe("tabular_only");
  });

  it("downgrades to tabular_only when coverage below 50%", () => {
    const plan = makePlan({ confidence: 0.6 });
    // 5 rows, 2 match → 40% coverage
    const rows: NormalizedRow[] = [
      makeRow("SE", 1), makeRow("NO", 2),
      makeRow("X1", 3), makeRow("X2", 4), makeRow("X3", 5),
    ];
    const geometry = makeFC([
      makeFeature("SE", "S"), makeFeature("NO", "N"),
    ]);

    const result = executeJoin(plan, rows, geometry);

    expect(result.diagnostics.coverageRatio).toBe(0.4);
    expect(result.status).toBe("tabular_only");
  });

  it("remains map_ready with moderate coverage and high plan confidence", () => {
    const plan = makePlan({ confidence: 0.85 });
    // 5 rows, 3 match → 60% coverage
    const rows: NormalizedRow[] = [
      makeRow("SE", 1), makeRow("NO", 2), makeRow("DK", 3),
      makeRow("X1", 4), makeRow("X2", 5),
    ];
    const geometry = makeFC([
      makeFeature("SE", "S"), makeFeature("NO", "N"), makeFeature("DK", "D"),
    ]);

    const result = executeJoin(plan, rows, geometry);

    expect(result.diagnostics.coverageRatio).toBe(0.6);
    expect(result.status).toBe("map_ready");
    // But confidence is reduced
    expect(result.confidence).toBeLessThan(0.85);
  });
});

// ═══════════════════════════════════════════════════════════════
// Crosswalk strategy support
// ═══════════════════════════════════════════════════════════════

describe("crosswalk-required plan", () => {
  it("alias_crosswalk strategy executes join with alias normalizers", () => {
    const plan = makePlan({
      strategy: "alias_crosswalk",
      confidence: 0.7,
      mapReady: true,
    });
    const rows: NormalizedRow[] = [makeRow("SE", 100)];
    const geometry = makeFC([makeFeature("SE", "Sweden")]);

    const result = executeJoin(plan, rows, geometry);

    expect(result.status).toBe("map_ready");
    expect(result.diagnostics.attempted).toBe(true);
    expect(result.diagnostics.matched).toBe(1);
  });

  it("rejects fuzzy_name strategy as unsupported", () => {
    const plan = makePlan({
      strategy: "fuzzy_name",
      confidence: 0.35,
      mapReady: true,
    });
    const rows: NormalizedRow[] = [makeRow("SE", 100)];
    const geometry = makeFC([makeFeature("SE", "Sweden")]);

    const result = executeJoin(plan, rows, geometry);

    expect(result.status).toBe("tabular_only");
    expect(result.diagnostics.attempted).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Provisional geometry with poor coverage
// ═══════════════════════════════════════════════════════════════

describe("provisional geometry with poor coverage", () => {
  it("applies extra penalty for provisional geometry with <60% coverage", () => {
    const plan = makePlan({ confidence: 0.65 });
    // 5 rows, 2 match → 40% coverage, but we raise the base to allow it past MIN_COVERAGE
    // Actually 40% < MIN_COVERAGE → tabular_only regardless. Let's test with 55%.
    // 11 rows, 6 match → 55%
    const rows: NormalizedRow[] = [
      makeRow("SE", 1), makeRow("NO", 2), makeRow("DK", 3),
      makeRow("FI", 4), makeRow("IS", 5), makeRow("DE", 6),
      makeRow("X1", 7), makeRow("X2", 8), makeRow("X3", 9),
      makeRow("X4", 10), makeRow("X5", 11),
    ];
    const geometry = makeFC([
      makeFeature("SE", "S"), makeFeature("NO", "N"), makeFeature("DK", "D"),
      makeFeature("FI", "F"), makeFeature("IS", "I"), makeFeature("DE", "G"),
    ]);

    const result = executeJoin(plan, rows, geometry, "provisional");

    // 55% coverage: deficit from 80% = 3 units → -0.15 coverage penalty
    // + provisional <60% → -0.15 extra
    // 0.65 - 0.15 - 0.15 = 0.35 → below 0.4 threshold → tabular_only
    expect(result.status).toBe("tabular_only");
    expect(result.confidence).toBeLessThan(0.4);
  });

  it("provisional with good coverage remains map_ready", () => {
    const plan = makePlan({ confidence: 0.7 });
    const rows: NormalizedRow[] = [
      makeRow("SE", 1), makeRow("NO", 2), makeRow("DK", 3),
      makeRow("FI", 4),
    ];
    const geometry = makeFC([
      makeFeature("SE", "S"), makeFeature("NO", "N"),
      makeFeature("DK", "D"), makeFeature("FI", "F"),
    ]);

    const result = executeJoin(plan, rows, geometry, "provisional");

    // 100% coverage, no penalties
    expect(result.status).toBe("map_ready");
    expect(result.confidence).toBe(0.7);
  });
});

// ═══════════════════════════════════════════════════════════════
// Inline point geometry
// ═══════════════════════════════════════════════════════════════

describe("inline point geometry", () => {
  it("passes through without executing a polygon join", () => {
    const plan = makePlan({
      strategy: "inline_geometry",
      confidence: 0.75,
      mapReady: true,
      rowJoinField: null,
      geometryJoinField: null,
    });

    const result = executeJoin(plan, [], null);

    expect(result.status).toBe("map_ready");
    expect(result.features).toHaveLength(0);
    expect(result.diagnostics.attempted).toBe(false);
    expect(result.diagnostics.strategy).toBe("inline_geometry");
    expect(result.confidence).toBe(0.75);
  });

  it("inline geometry is distinct from polygon join", () => {
    const inlinePlan = makePlan({
      strategy: "inline_geometry",
      confidence: 0.7,
      mapReady: true,
    });
    const polygonPlan = makePlan({
      strategy: "direct_code",
      confidence: 0.7,
      mapReady: true,
    });

    const inlineResult = executeJoin(inlinePlan, [], null);
    const polygonResult = executeJoin(polygonPlan, [makeRow("SE", 1)], null);

    // Inline succeeds even without geometry
    expect(inlineResult.status).toBe("map_ready");
    // Polygon fails without geometry
    expect(polygonResult.status).toBe("tabular_only");
  });
});

// ═══════════════════════════════════════════════════════════════
// Plan not map-ready guard
// ═══════════════════════════════════════════════════════════════

describe("plan guards", () => {
  it("returns tabular_only when plan says not map-ready", () => {
    const plan = makePlan({ mapReady: false, confidence: 0 });
    const rows: NormalizedRow[] = [makeRow("SE", 100)];
    const geometry = makeFC([makeFeature("SE", "Sweden")]);

    const result = executeJoin(plan, rows, geometry);

    expect(result.status).toBe("tabular_only");
    expect(result.diagnostics.attempted).toBe(false);
  });

  it("returns tabular_only when join fields are missing", () => {
    const plan = makePlan({
      mapReady: true,
      rowJoinField: null,
      geometryJoinField: null,
    });
    const rows: NormalizedRow[] = [makeRow("SE", 100)];
    const geometry = makeFC([makeFeature("SE", "Sweden")]);

    const result = executeJoin(plan, rows, geometry);

    expect(result.status).toBe("tabular_only");
    expect(result.diagnostics.attempted).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Normalized name join
// ═══════════════════════════════════════════════════════════════

describe("normalized name join", () => {
  it("joins by normalized names ignoring case and diacritics", () => {
    const plan = makePlan({
      strategy: "normalized_name",
      confidence: 0.65,
      geometryJoinField: "name",
    });

    const rows: NormalizedRow[] = [
      { dimensionValues: { Region: "GÖTEBORG", Tid: "2023" }, value: 500 },
      { dimensionValues: { Region: "MALMÖ", Tid: "2023" }, value: 300 },
      { dimensionValues: { Region: "Stockholm", Tid: "2023" }, value: 900 },
    ];

    const geometry = makeFC([
      { type: "Feature", geometry: { type: "Polygon", coordinates: [] }, properties: { name: "Göteborg" } },
      { type: "Feature", geometry: { type: "Polygon", coordinates: [] }, properties: { name: "Malmö" } },
      { type: "Feature", geometry: { type: "Polygon", coordinates: [] }, properties: { name: "Stockholm" } },
    ]);

    const result = executeJoin(plan, rows, geometry);

    expect(result.diagnostics.matched).toBe(3);
    expect(result.diagnostics.unmatched).toBe(0);
    expect(result.status).toBe("map_ready");
  });
});

// ═══════════════════════════════════════════════════════════════
// Rows with missing geo codes
// ═══════════════════════════════════════════════════════════════

describe("edge cases", () => {
  it("skips rows with empty geo code", () => {
    const plan = makePlan({ confidence: 0.75 });
    const rows: NormalizedRow[] = [
      makeRow("SE", 100),
      makeRow("", 200),  // empty code
      { dimensionValues: { Tid: "2023" }, value: 300 },  // missing Region key
    ];
    const geometry = makeFC([makeFeature("SE", "Sweden")]);

    const result = executeJoin(plan, rows, geometry);

    // Only SE is joinable
    expect(result.diagnostics.matched).toBe(1);
    expect(result.diagnostics.unmatched).toBe(0); // empty codes are skipped, not unmatched
    expect(result.features).toHaveLength(1);
  });

  it("limits unmatched codes sample to 10", () => {
    const plan = makePlan({ confidence: 0.75 });
    const rows: NormalizedRow[] = Array.from({ length: 20 }, (_, i) =>
      makeRow(`X${i}`, i),
    );
    const geometry = makeFC([makeFeature("SE", "Sweden")]);

    const result = executeJoin(plan, rows, geometry);

    expect(result.diagnostics.unmatchedCodes.length).toBeLessThanOrEqual(10);
    expect(result.diagnostics.unmatched).toBe(20);
  });
});
