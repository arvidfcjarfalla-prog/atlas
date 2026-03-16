import { describe, it, expect } from "vitest";
import {
  classifyCodeShape,
  inferLevelFromCodeShape,
  detectGeography,
  type DetectionResult,
} from "../tools/geography-detector";
import { sourceOk, sourceNoData } from "../tools/normalized-result";
import type {
  NormalizedDimension,
  NormalizedRow,
  NormalizedSourceResult,
  SourceMetadata,
  QueryDiagnostics,
  GeographyLevel,
} from "../tools/normalized-result";
import type { DatasetProfile } from "../types";

// ─── Helpers ────────────────────────────────────────────────

const meta = (overrides?: Partial<SourceMetadata>): SourceMetadata => ({
  sourceId: "test",
  sourceName: "Test Source",
  fetchedAt: 1700000000000,
  ...overrides,
});

const diag = (overrides?: Partial<QueryDiagnostics>): QueryDiagnostics => ({
  originalPrompt: "test",
  ...overrides,
});

function makeSource(opts: {
  dimensions?: NormalizedDimension[];
  rows?: NormalizedRow[];
  countryHints?: string[];
  geographyHints?: GeographyLevel[];
  sourceId?: string;
  profile?: DatasetProfile;
}): NormalizedSourceResult {
  return sourceOk({
    dimensions: opts.dimensions ?? [],
    rows: opts.rows ?? [],
    candidateMetricFields: [],
    countryHints: opts.countryHints ?? [],
    geographyHints: opts.geographyHints ?? [],
    sourceMetadata: meta({ sourceId: opts.sourceId ?? "test" }),
    diagnostics: diag(),
    confidence: 0.5,
    profile: opts.profile,
  });
}

// ─── Code dimension helpers ─────────────────────────────────

function dimGeo(
  id: string,
  values: { code: string; label: string }[],
): NormalizedDimension {
  return { id, label: id, role: "geo", values };
}

function dimTime(
  id: string,
  values: { code: string; label: string }[],
): NormalizedDimension {
  return { id, label: id, role: "time", values };
}

function dimMetric(
  id: string,
  values: { code: string; label: string }[],
): NormalizedDimension {
  return { id, label: id, role: "metric", values };
}

function dimFilter(
  id: string,
  values: { code: string; label: string }[],
): NormalizedDimension {
  return { id, label: id, role: "filter", values };
}

// ═══════════════════════════════════════════════════════════════
// classifyCodeShape
// ═══════════════════════════════════════════════════════════════

describe("classifyCodeShape", () => {
  it("detects ISO alpha-2 codes", () => {
    const result = classifyCodeShape(["SE", "NO", "DK", "FI", "IS", "DE", "FR", "GB", "US", "JP"]);
    expect(result.pattern).toBe("iso_a2");
    expect(result.matchRatio).toBeGreaterThanOrEqual(0.8);
  });

  it("detects ISO alpha-3 codes", () => {
    const result = classifyCodeShape(["SWE", "NOR", "DNK", "FIN", "ISL", "DEU", "FRA", "GBR"]);
    expect(result.pattern).toBe("iso_a3");
    expect(result.matchRatio).toBeGreaterThanOrEqual(0.8);
  });

  it("detects NUTS codes (longer than ISO)", () => {
    const result = classifyCodeShape(["SE11", "SE12", "SE21", "SE22", "SE23", "SE31", "SE32", "SE33"]);
    expect(result.pattern).toBe("nuts");
  });

  it("detects numeric admin codes", () => {
    // Swedish municipality codes
    const result = classifyCodeShape(["0180", "1280", "1480", "0380", "0580", "0680"]);
    expect(result.pattern).toBe("numeric_admin");
  });

  it("detects coordinate-like values", () => {
    const result = classifyCodeShape(["59.3293", "18.0686", "55.6049", "13.0038", "57.7089"]);
    expect(result.pattern).toBe("coordinate");
  });

  it("returns unknown for empty array", () => {
    const result = classifyCodeShape([]);
    expect(result.pattern).toBe("unknown");
    expect(result.sampleSize).toBe(0);
  });

  it("returns unknown for unrecognized codes", () => {
    const result = classifyCodeShape(["hello", "world", "foo", "bar", "baz"]);
    expect(result.pattern).toBe("unknown");
  });

  it("handles mixed content without crashing", () => {
    const result = classifyCodeShape(["SE", "0180", "Stockholm", "55.6"]);
    expect(["mixed", "unknown"]).toContain(result.pattern);
  });

  it("handles single-value arrays", () => {
    const result = classifyCodeShape(["SWE"]);
    // One value can match iso_a3
    expect(result.sampleSize).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// inferLevelFromCodeShape
// ═══════════════════════════════════════════════════════════════

describe("inferLevelFromCodeShape", () => {
  it("infers country from ISO-A3 codes", () => {
    const shape = classifyCodeShape(["SWE", "NOR", "DNK", "FIN", "ISL"]);
    const result = inferLevelFromCodeShape(shape, 5, []);
    expect(result.level).toBe("country");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("infers country from ISO-A2 codes", () => {
    const shape = classifyCodeShape(["SE", "NO", "DK", "FI", "IS"]);
    const result = inferLevelFromCodeShape(shape, 5, []);
    expect(result.level).toBe("country");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("infers NUTS from NUTS-like codes", () => {
    const shape = classifyCodeShape(["SE11", "SE12", "SE21", "SE22"]);
    const result = inferLevelFromCodeShape(shape, 4, []);
    expect(result.level).toMatch(/^nuts/);
  });

  it("uses hint for numeric admin codes when available", () => {
    const shape = classifyCodeShape(["0180", "1280", "1480"]);
    const result = inferLevelFromCodeShape(shape, 3, ["municipality"]);
    expect(result.level).toBe("municipality");
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it("falls back to cardinality heuristic for numeric codes without hint", () => {
    const codes = Array.from({ length: 290 }, (_, i) => String(i + 1).padStart(4, "0"));
    const shape = classifyCodeShape(codes);
    const result = inferLevelFromCodeShape(shape, 290, []);
    expect(result.level).toBe("municipality");
    expect(result.confidence).toBe(0.3); // weak — cardinality only
  });

  it("returns unknown with low confidence for unrecognized patterns", () => {
    const shape = classifyCodeShape(["hello", "world", "foo"]);
    const result = inferLevelFromCodeShape(shape, 3, []);
    expect(result.level).toBe("unknown");
    expect(result.confidence).toBeLessThanOrEqual(0.15);
  });

  it("uses hint for unrecognized codes when hint is available", () => {
    const shape = classifyCodeShape(["hello", "world", "foo"]);
    const result = inferLevelFromCodeShape(shape, 3, ["admin1"]);
    expect(result.level).toBe("admin1");
    expect(result.confidence).toBe(0.25);
  });

  it("returns point_set for coordinate codes", () => {
    const shape = classifyCodeShape(["59.3293", "55.6049", "57.7089"]);
    const result = inferLevelFromCodeShape(shape, 3, []);
    expect(result.level).toBe("point_set");
    expect(result.confidence).toBeGreaterThan(0.5);
  });
});

// ═══════════════════════════════════════════════════════════════
// detectGeography — full pipeline
// ═══════════════════════════════════════════════════════════════

describe("detectGeography", () => {
  // ── Swedish municipalities (PxWeb SCB) ──────────────────
  it("detects Swedish municipality data from PxWeb", () => {
    const source = makeSource({
      dimensions: [
        dimGeo("Region", [
          { code: "0180", label: "Stockholm" },
          { code: "1280", label: "Malmö" },
          { code: "1480", label: "Göteborg" },
          { code: "0380", label: "Uppsala" },
          { code: "0580", label: "Linköping" },
          { code: "0680", label: "Jönköping" },
        ]),
        dimTime("Tid", [{ code: "2023", label: "2023" }]),
        dimMetric("ContentsCode", [{ code: "BE0101N1", label: "Folkmängd" }]),
      ],
      countryHints: ["SE"],
      geographyHints: ["municipality"],
      sourceId: "se-scb",
    });

    const result = detectGeography(source);
    expect(result.geoDimensionId).toBe("Region");
    expect(result.renderHint).toBe("polygon_join");
    expect(result.level).toBe("municipality");
    expect(result.unitCount).toBe(6);
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.codeFamily.family).toBe("national");
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  // ── Norwegian counties (PxWeb SSB) ─────────────────────
  it("detects Norwegian county data from PxWeb", () => {
    const source = makeSource({
      dimensions: [
        dimGeo("Region", [
          { code: "30", label: "Viken" },
          { code: "03", label: "Oslo" },
          { code: "34", label: "Innlandet" },
          { code: "38", label: "Vestfold og Telemark" },
          { code: "42", label: "Agder" },
          { code: "11", label: "Rogaland" },
          { code: "15", label: "Møre og Romsdal" },
          { code: "50", label: "Trøndelag" },
          { code: "18", label: "Nordland" },
          { code: "54", label: "Troms og Finnmark" },
        ]),
        dimTime("Tid", [{ code: "2023", label: "2023" }]),
      ],
      countryHints: ["NO"],
      geographyHints: ["admin1"],
      sourceId: "no-ssb",
    });

    const result = detectGeography(source);
    expect(result.geoDimensionId).toBe("Region");
    expect(result.level).toBe("admin1");
    expect(result.unitCount).toBe(10);
    expect(result.confidence).toBeGreaterThan(0.4);
    expect(result.renderHint).toBe("polygon_join");
  });

  // ── World Bank country-level ISO-A3 ────────────────────
  it("detects country-level data with ISO-A3 codes", () => {
    const source = makeSource({
      dimensions: [
        dimGeo("country", [
          { code: "SWE", label: "Sweden" },
          { code: "NOR", label: "Norway" },
          { code: "DNK", label: "Denmark" },
          { code: "FIN", label: "Finland" },
          { code: "ISL", label: "Iceland" },
          { code: "DEU", label: "Germany" },
          { code: "FRA", label: "France" },
          { code: "GBR", label: "United Kingdom" },
        ]),
      ],
      sourceId: "worldbank",
    });

    const result = detectGeography(source);
    expect(result.level).toBe("country");
    expect(result.codeFamily).toEqual({ family: "iso", namespace: "alpha3" });
    expect(result.unitCount).toBe(8);
    expect(result.confidence).toBeGreaterThan(0.6);
    expect(result.renderHint).toBe("polygon_join");
  });

  // ── Eurostat NUTS2 regions ─────────────────────────────
  it("detects NUTS2 regions from Eurostat-style data", () => {
    const source = makeSource({
      dimensions: [
        dimGeo("geo", [
          { code: "SE11", label: "Stockholm" },
          { code: "SE12", label: "Östra Mellansverige" },
          { code: "SE21", label: "Småland med öarna" },
          { code: "SE22", label: "Sydsverige" },
          { code: "SE23", label: "Västsverige" },
          { code: "DE11", label: "Stuttgart" },
          { code: "DE12", label: "Karlsruhe" },
          { code: "FR10", label: "Île-de-France" },
        ]),
        dimTime("time", [{ code: "2022", label: "2022" }]),
      ],
      geographyHints: ["nuts2"],
    });

    const result = detectGeography(source);
    expect(result.level).toBe("nuts2");
    expect(result.codeFamily.family).toBe("eurostat");
    expect(result.renderHint).toBe("polygon_join");
    expect(result.unitCount).toBe(8);
  });

  // ── Point-based data (no geo dimension, inline geometry) ──
  it("detects point-based data from profile geometry", () => {
    const source = makeSource({
      dimensions: [],
      profile: {
        featureCount: 150,
        geometryType: "Point",
        bounds: [[-60, -180], [80, 180]],
        crs: null,
        attributes: [
          { name: "name", type: "string", uniqueValues: 150, nullCount: 0 },
        ],
      },
    });

    const result = detectGeography(source);
    expect(result.level).toBe("point_set");
    expect(result.renderHint).toBe("point_based");
    expect(result.unitCount).toBe(150);
    expect(result.confidence).toBeGreaterThan(0.4);
  });

  // ── No dimensions, no geometry → non-geographic ────────
  it("returns non-geographic when no dimensions and no geometry", () => {
    const source = sourceNoData({
      sourceMetadata: meta(),
      diagnostics: diag(),
    });

    const result = detectGeography(source);
    expect(result.level).toBe("unknown");
    expect(result.renderHint).toBe("non_geographic");
    expect(result.confidence).toBe(0);
    expect(result.unitCount).toBe(0);
  });

  // ── All dimensions are non-geo → non-geographic ────────
  it("returns non-geographic when all dimensions are time/metric", () => {
    const source = makeSource({
      dimensions: [
        dimTime("Tid", [{ code: "2020", label: "2020" }, { code: "2021", label: "2021" }]),
        dimMetric("ContentsCode", [{ code: "POP", label: "Population" }]),
        dimFilter("Kon", [{ code: "1", label: "Men" }, { code: "2", label: "Women" }]),
      ],
    });

    const result = detectGeography(source);
    expect(result.level).toBe("unknown");
    expect(result.renderHint).toBe("non_geographic");
    expect(result.confidence).toBe(0);
  });

  // ── US FIPS-like codes ─────────────────────────────────
  it("detects US state-level numeric codes with hint", () => {
    const source = makeSource({
      dimensions: [
        dimGeo("state", [
          { code: "01", label: "Alabama" },
          { code: "02", label: "Alaska" },
          { code: "04", label: "Arizona" },
          { code: "05", label: "Arkansas" },
          { code: "06", label: "California" },
          { code: "08", label: "Colorado" },
          { code: "09", label: "Connecticut" },
          { code: "10", label: "Delaware" },
          { code: "11", label: "District of Columbia" },
          { code: "12", label: "Florida" },
          { code: "13", label: "Georgia" },
          { code: "15", label: "Hawaii" },
        ]),
      ],
      countryHints: ["US"],
      geographyHints: ["admin1"],
      sourceId: "us-census",
    });

    const result = detectGeography(source);
    expect(result.geoDimensionId).toBe("state");
    expect(result.level).toBe("admin1");
    expect(result.renderHint).toBe("polygon_join");
    expect(result.codeFamily.family).toBe("national");
  });

  // ── ISO-A2 country codes ───────────────────────────────
  it("detects country-level from ISO-A2 codes", () => {
    const source = makeSource({
      dimensions: [
        dimGeo("country", [
          { code: "SE", label: "Sweden" },
          { code: "NO", label: "Norway" },
          { code: "DK", label: "Denmark" },
          { code: "FI", label: "Finland" },
        ]),
      ],
    });

    const result = detectGeography(source);
    expect(result.level).toBe("country");
    expect(result.codeFamily).toEqual({ family: "iso", namespace: "alpha2" });
    expect(result.renderHint).toBe("polygon_join");
  });

  // ── Polygon geometry in profile ────────────────────────
  it("detects polygon data from inline profile geometry", () => {
    const source = makeSource({
      dimensions: [],
      profile: {
        featureCount: 21,
        geometryType: "MultiPolygon",
        bounds: [[55, 11], [69, 24]],
        crs: null,
        attributes: [
          { name: "name", type: "string", uniqueValues: 21, nullCount: 0 },
        ],
      },
      geographyHints: ["admin1"],
    });

    const result = detectGeography(source);
    expect(result.renderHint).toBe("polygon_join");
    expect(result.level).toBe("admin1");
    expect(result.unitCount).toBe(21);
  });

  // ── Single-unit data → low confidence ──────────────────
  it("penalizes single-unit geographic data", () => {
    const source = makeSource({
      dimensions: [
        dimGeo("Region", [{ code: "00", label: "Hela riket" }]),
        dimTime("Tid", [{ code: "2023", label: "2023" }]),
      ],
      countryHints: ["SE"],
      geographyHints: ["country"],
    });

    const result = detectGeography(source);
    // Has geo dimension but only 1 unit — low confidence
    expect(result.unitCount).toBe(1);
    expect(result.confidence).toBeLessThan(0.5);
  });

  // ── Confidence boosts ──────────────────────────────────
  it("boosts confidence when multiple signals agree", () => {
    // All signals agree: role=geo + iso_a3 codes + country hint
    const source = makeSource({
      dimensions: [
        dimGeo("country", [
          { code: "SWE", label: "Sweden" },
          { code: "NOR", label: "Norway" },
          { code: "DNK", label: "Denmark" },
          { code: "FIN", label: "Finland" },
          { code: "ISL", label: "Iceland" },
        ]),
      ],
      countryHints: ["SE"],
      geographyHints: ["country"],
    });

    const result = detectGeography(source);
    // role=geo (+0.15) + hint agrees (+0.1) + country hint (+0.05) on top of iso_a3 base
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  // ── Filter dimension with numeric codes should not win ──
  it("does not pick filter dimensions over geo dimensions", () => {
    const source = makeSource({
      dimensions: [
        dimGeo("Region", [
          { code: "0180", label: "Stockholm" },
          { code: "1280", label: "Malmö" },
          { code: "1480", label: "Göteborg" },
        ]),
        dimFilter("Alder", [
          { code: "0", label: "0 years" },
          { code: "10", label: "10 years" },
          { code: "20", label: "20 years" },
          { code: "30", label: "30 years" },
        ]),
        dimTime("Tid", [{ code: "2023", label: "2023" }]),
      ],
    });

    const result = detectGeography(source);
    expect(result.geoDimensionId).toBe("Region");
  });

  // ── Japanese prefecture-style numeric codes ────────────
  it("handles Japanese prefecture-style data with hint", () => {
    const source = makeSource({
      dimensions: [
        dimGeo("prefecture", [
          { code: "01", label: "Hokkaido" },
          { code: "02", label: "Aomori" },
          { code: "13", label: "Tokyo" },
          { code: "27", label: "Osaka" },
          { code: "40", label: "Fukuoka" },
          { code: "47", label: "Okinawa" },
        ]),
      ],
      countryHints: ["JP"],
      geographyHints: ["admin1"],
      sourceId: "jp-estat",
    });

    const result = detectGeography(source);
    expect(result.level).toBe("admin1");
    expect(result.geoDimensionId).toBe("prefecture");
    expect(result.renderHint).toBe("polygon_join");
    expect(result.codeFamily.family).toBe("national");
    expect(result.codeFamily.namespace).toBe("jp-estat");
  });

  // ── German Länder via NUTS1 codes ──────────────────────
  it("detects German Länder via NUTS1 codes", () => {
    const source = makeSource({
      dimensions: [
        dimGeo("geo", [
          { code: "DE1", label: "Baden-Württemberg" },
          { code: "DE2", label: "Bayern" },
          { code: "DE3", label: "Berlin" },
          { code: "DE4", label: "Brandenburg" },
          { code: "DE5", label: "Bremen" },
          { code: "DE6", label: "Hamburg" },
        ]),
      ],
      geographyHints: ["nuts1"],
    });

    const result = detectGeography(source);
    expect(result.level).toBe("nuts1");
    expect(result.codeFamily.family).toBe("eurostat");
    expect(result.renderHint).toBe("polygon_join");
  });

  // ── Reasons array is populated ─────────────────────────
  it("always populates reasons array", () => {
    const source = makeSource({
      dimensions: [
        dimGeo("Region", [{ code: "0180", label: "Stockholm" }]),
      ],
    });

    const result = detectGeography(source);
    expect(result.reasons).toBeInstanceOf(Array);
    expect(result.reasons.length).toBeGreaterThan(0);
    // Reasons should be human-readable strings
    for (const reason of result.reasons) {
      expect(typeof reason).toBe("string");
      expect(reason.length).toBeGreaterThan(0);
    }
  });

  // ── Render hint classification ─────────────────────────
  it("classifies render hint correctly for each scenario", () => {
    // Polygon join
    const polygonSource = makeSource({
      dimensions: [
        dimGeo("geo", [
          { code: "SWE", label: "Sweden" },
          { code: "NOR", label: "Norway" },
          { code: "DNK", label: "Denmark" },
        ]),
      ],
    });
    expect(detectGeography(polygonSource).renderHint).toBe("polygon_join");

    // Point-based
    const pointSource = makeSource({
      dimensions: [],
      profile: {
        featureCount: 50,
        geometryType: "Point",
        bounds: [[0, 0], [1, 1]],
        crs: null,
        attributes: [],
      },
    });
    expect(detectGeography(pointSource).renderHint).toBe("point_based");

    // Non-geographic
    const noGeoSource = makeSource({
      dimensions: [
        dimTime("year", [{ code: "2023", label: "2023" }]),
        dimMetric("indicator", [{ code: "GDP", label: "GDP" }]),
      ],
    });
    expect(detectGeography(noGeoSource).renderHint).toBe("non_geographic");
  });
});
