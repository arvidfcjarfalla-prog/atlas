/**
 * Tests for csv-geo-resolver: geography column detection and
 * choropleth pipeline for CSV uploads without coordinates.
 *
 * Unit tests for detectGeoColumn are pure — no mocking needed.
 * Integration tests for csvToGeoFeatures mock the geometry pipeline
 * to avoid network calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectGeoColumn, type GeoColumnDetection } from "../csv-geo-resolver";
import { parseCSV } from "../csv-parser";

// ═══════════════════════════════════════════════════════════════
// detectGeoColumn — pure unit tests
// ═══════════════════════════════════════════════════════════════

describe("detectGeoColumn", () => {
  // ── ISO3 detection ──────────────────────────────────────────

  it("detects iso3 column by header name", () => {
    const headers = ["Country", "iso3", "Value"];
    const rows = [["Sweden", "SWE", "100"], ["Norway", "NOR", "200"]];
    const result = detectGeoColumn(headers, rows);
    expect(result).toEqual({ column: "iso3", columnIndex: 1, type: "iso3" });
  });

  it("detects iso_a3 column name (Natural Earth convention)", () => {
    const headers = ["name", "iso_a3", "population"];
    const rows = [["Brazil", "BRA", "210000000"]];
    const result = detectGeoColumn(headers, rows);
    expect(result).toEqual({ column: "iso_a3", columnIndex: 1, type: "iso3" });
  });

  // ── ISO2 detection ──────────────────────────────────────────

  it("detects iso2 column by header name", () => {
    const headers = ["Region", "iso2", "GDP"];
    const rows = [["Sweden", "SE", "500"], ["Norway", "NO", "400"]];
    const result = detectGeoColumn(headers, rows);
    expect(result).toEqual({ column: "iso2", columnIndex: 1, type: "iso2" });
  });

  it("detects country_code as iso2", () => {
    const headers = ["country_code", "indicator", "value"];
    const rows = [["SE", "GDP", "500"]];
    const result = detectGeoColumn(headers, rows);
    expect(result).toEqual({ column: "country_code", columnIndex: 0, type: "iso2" });
  });

  // ── ISO 3166-2 detection ────────────────────────────────────

  it("detects iso_3166_2 column by header name", () => {
    const headers = ["iso_3166_2", "Name", "Population"];
    const rows = [["BR-SP", "São Paulo", "46000000"]];
    const result = detectGeoColumn(headers, rows);
    expect(result).toEqual({ column: "iso_3166_2", columnIndex: 0, type: "iso_3166_2" });
  });

  it("detects region_code header as ISO 3166-2", () => {
    const headers = ["region_code", "region_name", "value"];
    const rows = [["AU-WA", "Western Australia", "2800000"]];
    const result = detectGeoColumn(headers, rows);
    expect(result).toEqual({ column: "region_code", columnIndex: 0, type: "iso_3166_2" });
  });

  it("detects ISO 3166-2 by value pattern when header is generic", () => {
    const headers = ["Code", "Name", "Value"];
    const rows = [
      ["BR-SP", "São Paulo", "100"],
      ["BR-RJ", "Rio de Janeiro", "90"],
      ["BR-MG", "Minas Gerais", "80"],
      ["BR-BA", "Bahia", "70"],
      ["BR-RS", "Rio Grande do Sul", "60"],
    ];
    const result = detectGeoColumn(headers, rows);
    expect(result).toEqual({ column: "Code", columnIndex: 0, type: "iso_3166_2" });
  });

  it("detects mixed ISO 3166-2 values (2-char and 3-char suffixes)", () => {
    const headers = ["id", "name", "pop"];
    const rows = [
      ["JP-13", "Tokyo", "14000000"],
      ["JP-27", "Osaka", "8800000"],
      ["JP-1", "Hokkaido", "5200000"],
      ["JP-40", "Fukuoka", "5100000"],
      ["JP-23", "Aichi", "7500000"],
    ];
    const result = detectGeoColumn(headers, rows);
    // JP-1 doesn't match ISO_3166_2_RE (needs 1-3 chars after dash,
    // but "1" is 1 char which is valid)
    expect(result?.type).toBe("iso_3166_2");
  });

  // ── Country name detection ──────────────────────────────────

  it("detects country column by header name", () => {
    const headers = ["country", "population", "area"];
    const rows = [["Sweden", "10000000", "450000"]];
    const result = detectGeoColumn(headers, rows);
    expect(result).toEqual({ column: "country", columnIndex: 0, type: "name" });
  });

  it("detects country_name header", () => {
    const headers = ["year", "country_name", "gdp"];
    const rows = [["2023", "Brazil", "2000"]];
    const result = detectGeoColumn(headers, rows);
    expect(result).toEqual({ column: "country_name", columnIndex: 1, type: "name" });
  });

  // ── Priority order ──────────────────────────────────────────

  it("prefers iso3 over country name when both present", () => {
    const headers = ["country", "iso3", "value"];
    const rows = [["Sweden", "SWE", "100"]];
    const result = detectGeoColumn(headers, rows);
    expect(result?.type).toBe("iso3");
  });

  it("prefers iso2 over country name", () => {
    const headers = ["country", "iso2", "value"];
    const rows = [["Sweden", "SE", "100"]];
    const result = detectGeoColumn(headers, rows);
    expect(result?.type).toBe("iso2");
  });

  it("prefers ISO 3166-2 header over country name", () => {
    const headers = ["country", "subdivision", "value"];
    const rows = [["Brazil", "BR-SP", "100"]];
    const result = detectGeoColumn(headers, rows);
    expect(result?.type).toBe("iso_3166_2");
  });

  // ── Negative cases ──────────────────────────────────────────

  it("returns null when no geo column found", () => {
    const headers = ["product", "quantity", "price"];
    const rows = [["Widget", "100", "9.99"], ["Gadget", "50", "19.99"]];
    const result = detectGeoColumn(headers, rows);
    expect(result).toBeNull();
  });

  it("returns null for purely numeric data", () => {
    const headers = ["id", "temperature", "pressure"];
    const rows = [["1", "22.5", "1013"], ["2", "23.1", "1012"]];
    const result = detectGeoColumn(headers, rows);
    expect(result).toBeNull();
  });

  // ── Case insensitivity ──────────────────────────────────────

  it("matches header names case-insensitively", () => {
    const headers = ["ISO3", "Name", "Pop"];
    const rows = [["SWE", "Sweden", "10000000"]];
    const result = detectGeoColumn(headers, rows);
    expect(result?.type).toBe("iso3");
  });
});

// ═══════════════════════════════════════════════════════════════
// parseCSV BOM handling (regression)
// ═══════════════════════════════════════════════════════════════

describe("parseCSV BOM handling", () => {
  it("BOM does not corrupt first header", () => {
    const csv = "\uFEFFName,Value\nSweden,100\n";
    const rows = parseCSV(csv);
    // BOM is present in the raw parsed value
    expect(rows[0][0]).toBe("\uFEFFName");
    // But csvToGeoJSON and csvToGeoFeatures both strip it from headers
  });
});

// ═══════════════════════════════════════════════════════════════
// csvToGeoFeatures — integration tests (mocked pipeline)
// ═══════════════════════════════════════════════════════════════

// These tests verify the full flow with mocked geometry loading.
// The actual pipeline functions (detect, plan) run for real — only
// the async geometry I/O is stubbed.

vi.mock("../tools/pxweb-resolution", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../tools/pxweb-resolution")>();
  return {
    ...orig,
    resolveGeometryForNormalized: vi.fn(),
  };
});

import { csvToGeoFeatures } from "../csv-geo-resolver";
import { resolveGeometryForNormalized } from "../tools/pxweb-resolution";

const mockedResolve = vi.mocked(resolveGeometryForNormalized);

/** Build a minimal polygon FeatureCollection for testing. */
function makeGeometry(
  features: Array<{ props: Record<string, string>; coords?: number[][][] }>,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: features.map((f) => ({
      type: "Feature" as const,
      geometry: {
        type: "Polygon" as const,
        coordinates: f.coords ?? [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
      },
      properties: f.props,
    })),
  };
}

describe("csvToGeoFeatures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when CSV has no geo column", async () => {
    const csv = "product,quantity,price\nWidget,100,9.99\nGadget,50,19.99\n";
    const result = await csvToGeoFeatures(csv);
    expect(result.features).toBeNull();
    expect(result.warnings).toContain(
      "No geographic column detected (country codes, ISO 3166-2, or country names)",
    );
  });

  it("returns null when CSV has too few rows", async () => {
    const csv = "iso3,value\n";
    const result = await csvToGeoFeatures(csv);
    expect(result.features).toBeNull();
  });

  it("detects iso3 column and attempts pipeline", async () => {
    // Mock: geometry loading returns countries
    mockedResolve.mockResolvedValue({
      geometry: makeGeometry([
        { props: { iso_a3: "SWE", name: "Sweden" } },
        { props: { iso_a3: "NOR", name: "Norway" } },
      ]),
      geometryStatus: "production",
    });

    const csv = "iso3,population\nSWE,10000000\nNOR,5400000\n";
    const result = await csvToGeoFeatures(csv);

    expect(result.geoColumn).toBe("iso3");
    expect(result.geoType).toBe("iso3");
    // The pipeline should have been called
    expect(mockedResolve).toHaveBeenCalled();
  });

  it("detects ISO 3166-2 codes by value and attempts pipeline", async () => {
    // Mock: geometry loading returns admin1 regions
    mockedResolve.mockResolvedValue({
      geometry: makeGeometry([
        { props: { iso_3166_2: "BR-SP", name: "São Paulo" } },
        { props: { iso_3166_2: "BR-RJ", name: "Rio de Janeiro" } },
        { props: { iso_3166_2: "BR-MG", name: "Minas Gerais" } },
      ]),
      geometryStatus: "production",
    });

    const csv = [
      "Code,Name,Population",
      "BR-SP,São Paulo,46000000",
      "BR-RJ,Rio de Janeiro,17000000",
      "BR-MG,Minas Gerais,21000000",
    ].join("\n");

    const result = await csvToGeoFeatures(csv);

    expect(result.geoColumn).toBe("Code");
    expect(result.geoType).toBe("iso_3166_2");
    expect(mockedResolve).toHaveBeenCalled();

    // Verify the normalized source has correct country hints
    const callArg = mockedResolve.mock.calls[0][0];
    expect(callArg.countryHints).toContain("BR");
  });

  it("returns null when geometry loading fails", async () => {
    mockedResolve.mockResolvedValue({
      geometry: null,
      geometryStatus: "production",
    });

    const csv = "iso3,value\nSWE,100\nNOR,200\n";
    const result = await csvToGeoFeatures(csv);

    expect(result.features).toBeNull();
    expect(result.warnings.some((w) => w.includes("not map-ready") || w.includes("Could not load"))).toBe(true);
  });

  it("handles BOM-prefixed CSV", async () => {
    mockedResolve.mockResolvedValue({
      geometry: makeGeometry([
        { props: { iso_a3: "SWE", name: "Sweden" } },
      ]),
      geometryStatus: "production",
    });

    const csv = "\uFEFFiso3,value\nSWE,100\n";
    const result = await csvToGeoFeatures(csv);

    // BOM should not prevent detection
    expect(result.geoColumn).toBe("iso3");
    expect(result.geoType).toBe("iso3");
  });

  it("handles pipeline errors gracefully", async () => {
    mockedResolve.mockRejectedValue(new Error("Network timeout"));

    const csv = "iso3,value\nSWE,100\n";
    const result = await csvToGeoFeatures(csv);

    expect(result.features).toBeNull();
    expect(result.warnings.some((w) => w.includes("pipeline error"))).toBe(true);
  });

  it("finds metric column automatically", async () => {
    mockedResolve.mockResolvedValue({
      geometry: makeGeometry([
        { props: { iso_a3: "SWE", name: "Sweden" } },
      ]),
      geometryStatus: "production",
    });

    const csv = "iso3,name,population,area\nSWE,Sweden,10000000,450295\n";
    const result = await csvToGeoFeatures(csv);

    // Should have detected "population" as metric (first numeric column after geo)
    const callArg = mockedResolve.mock.calls[0][0];
    expect(callArg.candidateMetricFields).toEqual(["population"]);
  });
});
