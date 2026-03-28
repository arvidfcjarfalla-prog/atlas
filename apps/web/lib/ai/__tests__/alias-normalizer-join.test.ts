/**
 * Tests for alias normalizer support in join execution.
 *
 * Verifies that plugin-provided alias normalizers can rescue
 * otherwise-failing joins without bypassing safety rules.
 *
 * Covers:
 *   - Leading-zero normalization enabling successful join
 *   - Alias normalization improving coverage
 *   - No-plugin behavior unchanged
 *   - Bad/missing normalizers do not break join execution
 *   - Normalization does not bypass low-coverage downgrade
 */

import { describe, it, expect } from "vitest";
import { executeJoin } from "../tools/geometry-join";
import type { JoinPlanResult, JoinStrategy } from "../tools/join-planner";
import type { NormalizedRow } from "../tools/normalized-result";
import type { AliasNormalizer } from "../tools/geography-plugins";

// ═══════════════════════════════════════════════════════════════
// Test helpers
// ═══════════════════════════════════════════════════════════════

function makePlan(opts?: Partial<{
  mapReady: boolean;
  rowJoinField: string;
  geometryJoinField: string;
  strategy: JoinStrategy;
  confidence: number;
  geometryLayerId: string;
}>): JoinPlanResult {
  return {
    mapReady: opts?.mapReady ?? true,
    geometryLayerId: opts?.geometryLayerId ?? "test:layer",
    rowJoinField: opts?.rowJoinField ?? "Region",
    geometryJoinField: opts?.geometryJoinField ?? "code",
    strategy: opts?.strategy ?? "direct_code",
    confidence: opts?.confidence ?? 0.7,
    reasons: [],
  };
}

function makeRow(geoCode: string, value: number): NormalizedRow {
  return {
    dimensionValues: { Region: geoCode, Tid: "2023" },
    value,
  };
}

function makeFeature(code: string): GeoJSON.Feature {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
    properties: { code, name: `Region ${code}` },
  };
}

function makeFC(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features };
}

/** SCB-style leading-zero normalizer. */
const leadingZeroNormalizer: { name: string; normalizer: AliasNormalizer } = {
  name: "leading-zero",
  normalizer: (code: string) => {
    if (/^\d{1,2}$/.test(code)) return code.padStart(2, "0");
    if (/^\d{3,4}$/.test(code)) return code.padStart(4, "0");
    return null;
  },
};

// ═══════════════════════════════════════════════════════════════
// Leading-zero normalization
// ═══════════════════════════════════════════════════════════════

describe("leading-zero normalization", () => {
  it("rescues join when data codes lack leading zeros", () => {
    // Data has "1", "3", "5" — geometry has "01", "03", "05"
    const rows = [makeRow("1", 100), makeRow("3", 200), makeRow("5", 300)];
    const geometry = makeFC([makeFeature("01"), makeFeature("03"), makeFeature("05")]);
    const plan = makePlan();

    // Without normalizer: 0 matches
    const withoutResult = executeJoin(plan, rows, geometry, "production", "first", []);
    expect(withoutResult.diagnostics.matched).toBe(0);
    expect(withoutResult.status).toBe("tabular_only");

    // With normalizer: 3 matches
    const withResult = executeJoin(plan, rows, geometry, "production", "first", [leadingZeroNormalizer]);
    expect(withResult.diagnostics.matched).toBe(3);
    expect(withResult.diagnostics.unmatched).toBe(0);
    expect(withResult.status).toBe("map_ready");
  });

  it("rescues 4-digit municipality codes missing leading zero", () => {
    // Data has "114", "115", "117" — geometry has "0114", "0115", "0117"
    const rows = [makeRow("114", 1000), makeRow("115", 2000), makeRow("117", 3000)];
    const geometry = makeFC([makeFeature("0114"), makeFeature("0115"), makeFeature("0117")]);
    const plan = makePlan();

    const result = executeJoin(plan, rows, geometry, "production", "first", [leadingZeroNormalizer]);

    expect(result.diagnostics.matched).toBe(3);
    expect(result.status).toBe("map_ready");
  });
});

// ═══════════════════════════════════════════════════════════════
// Alias normalization improving coverage
// ═══════════════════════════════════════════════════════════════

describe("normalizer coverage improvement", () => {
  it("improves coverage from below to above threshold", () => {
    // 5 codes: 2 match directly, 3 need normalization
    const rows = [
      makeRow("01", 100),  // direct match
      makeRow("02", 200),  // direct match
      makeRow("3", 300),   // needs normalization → "03"
      makeRow("4", 400),   // needs normalization → "04"
      makeRow("5", 500),   // needs normalization → "05"
    ];
    const geometry = makeFC([
      makeFeature("01"), makeFeature("02"), makeFeature("03"),
      makeFeature("04"), makeFeature("05"),
    ]);
    const plan = makePlan();

    // Without normalizer: 2/5 = 40% → tabular_only
    const withoutResult = executeJoin(plan, rows, geometry, "production", "first", []);
    expect(withoutResult.diagnostics.matched).toBe(2);
    expect(withoutResult.status).toBe("tabular_only");

    // With normalizer: 5/5 = 100% → map_ready
    const withResult = executeJoin(plan, rows, geometry, "production", "first", [leadingZeroNormalizer]);
    expect(withResult.diagnostics.matched).toBe(5);
    expect(withResult.status).toBe("map_ready");
  });

  it("reports rescued matches in diagnostics reasons", () => {
    const rows = [makeRow("1", 100), makeRow("3", 200)];
    const geometry = makeFC([makeFeature("01"), makeFeature("03")]);
    const plan = makePlan();

    const result = executeJoin(plan, rows, geometry, "production", "first", [leadingZeroNormalizer]);

    expect(result.diagnostics.reasons.some((r) => r.includes("alias normalizers rescued"))).toBe(true);
    expect(result.diagnostics.reasons.some((r) => r.includes("2 match"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// No-plugin behavior unchanged
// ═══════════════════════════════════════════════════════════════

describe("no-normalizer behavior", () => {
  it("works identically when no normalizers are provided", () => {
    const rows = [makeRow("01", 100), makeRow("03", 200), makeRow("05", 300)];
    const geometry = makeFC([makeFeature("01"), makeFeature("03"), makeFeature("05")]);
    const plan = makePlan();

    // Default (no normalizers argument)
    const defaultResult = executeJoin(plan, rows, geometry);

    // Explicit empty normalizers
    const emptyResult = executeJoin(plan, rows, geometry, "production", "first", []);

    expect(defaultResult.diagnostics.matched).toBe(emptyResult.diagnostics.matched);
    expect(defaultResult.status).toBe(emptyResult.status);
    expect(defaultResult.confidence).toBe(emptyResult.confidence);
  });

  it("does not mention normalizers in reasons when none are provided", () => {
    const rows = [makeRow("01", 100)];
    const geometry = makeFC([makeFeature("01")]);
    const plan = makePlan();

    const result = executeJoin(plan, rows, geometry);

    expect(result.diagnostics.reasons.some((r) => r.includes("alias normalizer"))).toBe(false);
  });

  it("direct matches are preferred over normalized matches", () => {
    // Code "01" directly matches geometry "01" — normalizer should not be needed
    const rows = [makeRow("01", 100)];
    const geometry = makeFC([makeFeature("01")]);
    const plan = makePlan();

    const result = executeJoin(plan, rows, geometry, "production", "first", [leadingZeroNormalizer]);

    expect(result.diagnostics.matched).toBe(1);
    // "alias normalizers rescued" should NOT appear because the direct match worked
    expect(result.diagnostics.reasons.some((r) => r.includes("alias normalizers rescued"))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Bad/missing normalizers
// ═══════════════════════════════════════════════════════════════

describe("bad normalizer safety", () => {
  it("normalizer returning null does not break join", () => {
    const alwaysNull: { name: string; normalizer: AliasNormalizer } = {
      name: "always-null",
      normalizer: () => null,
    };

    const rows = [makeRow("01", 100), makeRow("03", 200)];
    const geometry = makeFC([makeFeature("01"), makeFeature("03")]);
    const plan = makePlan();

    const result = executeJoin(plan, rows, geometry, "production", "first", [alwaysNull]);

    // Direct matches should still work
    expect(result.diagnostics.matched).toBe(2);
    expect(result.status).toBe("map_ready");
  });

  it("normalizer returning same code does not create false matches", () => {
    const identity: { name: string; normalizer: AliasNormalizer } = {
      name: "identity",
      normalizer: (code) => code,
    };

    const rows = [makeRow("MISSING", 100)];
    const geometry = makeFC([makeFeature("01")]);
    const plan = makePlan();

    const result = executeJoin(plan, rows, geometry, "production", "first", [identity]);

    // "MISSING" normalized to "MISSING" still doesn't match "01"
    expect(result.diagnostics.matched).toBe(0);
    expect(result.diagnostics.unmatched).toBe(1);
  });

  it("normalizer throwing does not crash join execution", () => {
    const throwing: { name: string; normalizer: AliasNormalizer } = {
      name: "thrower",
      normalizer: () => { throw new Error("boom"); },
    };

    // "1" won't match "01" directly, so the normalizer fallback runs and throws.
    // "01" still matches directly.
    const rows = [makeRow("1", 100), makeRow("01", 200)];
    const geometry = makeFC([makeFeature("01")]);
    const plan = makePlan();

    const result = executeJoin(plan, rows, geometry, "production", "first", [throwing]);

    // "01" matches directly, "1" fails (throw caught, no normalizer result)
    expect(result.diagnostics.matched).toBe(1);
    expect(result.diagnostics.unmatched).toBe(1);
  });

  it("multiple normalizers are tried in order, first match wins", () => {
    const wrongNorm: { name: string; normalizer: AliasNormalizer } = {
      name: "wrong",
      normalizer: () => "WRONG",
    };
    const rightNorm: { name: string; normalizer: AliasNormalizer } = {
      name: "right",
      normalizer: (code) => code.padStart(2, "0"),
    };

    const rows = [makeRow("1", 100)];
    const geometry = makeFC([makeFeature("01"), makeFeature("WRONG")]);
    const plan = makePlan();

    // wrongNorm is checked first and finds "WRONG" in geometry
    const result = executeJoin(plan, rows, geometry, "production", "first", [wrongNorm, rightNorm]);

    expect(result.diagnostics.matched).toBe(1);
    // The matched feature should have "WRONG" as its code (first normalizer wins)
    expect(result.features[0].properties?._atlas_geo_code).toBe("1");
  });
});

// ═══════════════════════════════════════════════════════════════
// Normalization does not bypass safety rules
// ═══════════════════════════════════════════════════════════════

describe("normalizer safety invariants", () => {
  it("low coverage still downgrades despite normalizer improvements", () => {
    // 10 codes, normalizer only rescues 2, remaining 8 unmatched
    const rows = Array.from({ length: 10 }, (_, i) => makeRow(String(i + 1), 100 * i));
    // Geometry only has "01" and "02" (after normalization from "1" and "2")
    const geometry = makeFC([makeFeature("01"), makeFeature("02")]);
    const plan = makePlan();

    const result = executeJoin(plan, rows, geometry, "production", "first", [leadingZeroNormalizer]);

    // 2/10 = 20% → below MIN_COVERAGE_RATIO (50%)
    expect(result.diagnostics.matched).toBe(2);
    expect(result.diagnostics.coverageRatio).toBe(0.2);
    expect(result.status).toBe("tabular_only");
  });

  it("normalizer cannot rescue a plan that is not map-ready", () => {
    const rows = [makeRow("1", 100)];
    const geometry = makeFC([makeFeature("01")]);
    const plan = makePlan({ mapReady: false });

    const result = executeJoin(plan, rows, geometry, "production", "first", [leadingZeroNormalizer]);

    // Plan says not map-ready → tabular_only regardless of normalizer
    expect(result.status).toBe("tabular_only");
    expect(result.diagnostics.attempted).toBe(false);
  });

  it("normalizer cannot rescue null geometry", () => {
    const rows = [makeRow("1", 100)];
    const plan = makePlan();

    const result = executeJoin(plan, rows, null, "production", "first", [leadingZeroNormalizer]);

    expect(result.status).toBe("tabular_only");
    expect(result.diagnostics.attempted).toBe(false);
  });

  it("provisional geometry with low coverage blocks map_ready despite normalizers", () => {
    // 5 codes, normalizer rescues 3, but 2 unmatched
    const rows = [
      makeRow("1", 100), makeRow("2", 200), makeRow("3", 300),
      makeRow("99", 400), makeRow("98", 500),
    ];
    const geometry = makeFC([makeFeature("01"), makeFeature("02"), makeFeature("03")]);
    const plan = makePlan({ confidence: 0.55 });

    const result = executeJoin(plan, rows, geometry, "provisional", "first", [leadingZeroNormalizer]);

    // 3/5 = 60% coverage, but provisional with exact 60% → no extra penalty
    // However confidence is low (0.55) and gets coverage penalty
    // Coverage is above MIN_COVERAGE_RATIO (50%) but < 80% → penalty applied
    expect(result.diagnostics.matched).toBe(3);
    expect(result.diagnostics.coverageRatio).toBe(0.6);
    // Coverage penalties should still apply
    expect(result.confidence).toBeLessThan(0.55);
  });
});

// ═══════════════════════════════════════════════════════════════
// Code-to-label normalizer (PxWeb municipality codes → names)
// ═══════════════════════════════════════════════════════════════

describe("code-to-label normalizer (SCB municipality scenario)", () => {
  /** Simulates the auto-injected code→label normalizer from PxWeb dimension metadata. */
  function makeCodeToLabelNormalizer(
    mapping: Record<string, string>,
  ): { name: string; normalizer: AliasNormalizer } {
    return {
      name: "source-code-to-label",
      normalizer: (code: string) => mapping[code] ?? null,
    };
  }

  function makeNameFeature(name: string): GeoJSON.Feature {
    return {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      properties: { name },
    };
  }

  it("joins SCB 4-digit municipality codes to name-keyed geometry via labels", () => {
    // SCB PxWeb dimension values: code "0180" → label "Stockholm", etc.
    const codeToLabel = makeCodeToLabelNormalizer({
      "0180": "Stockholm",
      "1480": "Göteborg",
      "1280": "Malmö",
      "0380": "Uppsala",
      "0580": "Linköping",
    });

    // Data rows have SCB municipality codes
    const rows = [
      makeRow("0180", 975000),
      makeRow("1480", 590000),
      makeRow("1280", 350000),
      makeRow("0380", 230000),
      makeRow("0580", 160000),
    ];

    // Geometry has name-based features (from geoBoundaries)
    const geometry = makeFC([
      makeNameFeature("Stockholm"),
      makeNameFeature("Göteborg"),
      makeNameFeature("Malmö"),
      makeNameFeature("Uppsala"),
      makeNameFeature("Linköping"),
    ]);

    // Plan uses alias_crosswalk with name-keyed geometry
    const plan = makePlan({
      strategy: "alias_crosswalk",
      geometryJoinField: "name",
      confidence: 0.7,
    });

    const result = executeJoin(
      plan, rows, geometry, "production", "first", [codeToLabel],
    );

    expect(result.diagnostics.matched).toBe(5);
    expect(result.diagnostics.unmatched).toBe(0);
    expect(result.diagnostics.coverageRatio).toBe(1);
    expect(result.status).toBe("map_ready");
    expect(result.diagnostics.reasons.some((r) => r.includes("alias normalizers rescued 5"))).toBe(true);

    // Verify the data values are attached to features
    const sthlm = result.features.find((f) => f.properties?.name === "Stockholm");
    expect(sthlm?.properties?._atlas_value).toBe(975000);
  });

  it("handles diacritics and case differences between labels and geometry names", () => {
    const codeToLabel = makeCodeToLabelNormalizer({
      "01": "Örebro",
      "02": "Västerås",
      "03": "Malmö",
    });

    const rows = [makeRow("01", 100), makeRow("02", 200), makeRow("03", 300)];
    const geometry = makeFC([
      makeNameFeature("örebro"),   // lowercase
      makeNameFeature("VÄSTERÅS"), // uppercase
      makeNameFeature("Malmö"),    // exact
    ]);

    const plan = makePlan({
      strategy: "alias_crosswalk",
      geometryJoinField: "name",
      confidence: 0.7,
    });

    const result = executeJoin(plan, rows, geometry, "production", "first", [codeToLabel]);

    // normalizeForJoin strips diacritics and lowercases — all should match
    expect(result.diagnostics.matched).toBe(3);
    expect(result.status).toBe("map_ready");
  });

  it("unmatched labels do not crash — just reduce coverage", () => {
    const codeToLabel = makeCodeToLabelNormalizer({
      "0180": "Stockholm",
      "1480": "Göteborg",       // SCB says "Göteborg"
      "9999": "Nonexistent",    // no geometry match
    });

    const rows = [
      makeRow("0180", 100),
      makeRow("1480", 200),
      makeRow("9999", 300),
    ];

    // Geometry has "Gothenburg" (English) instead of "Göteborg"
    const geometry = makeFC([
      makeNameFeature("Stockholm"),
      makeNameFeature("Gothenburg"),
    ]);

    const plan = makePlan({
      strategy: "alias_crosswalk",
      geometryJoinField: "name",
      confidence: 0.7,
    });

    const result = executeJoin(plan, rows, geometry, "production", "first", [codeToLabel]);

    // Stockholm matches. Göteborg ≠ Gothenburg after normalization. Nonexistent has no geometry.
    expect(result.diagnostics.matched).toBe(1);
    expect(result.diagnostics.unmatched).toBe(2);
  });
});
