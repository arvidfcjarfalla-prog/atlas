import { describe, it, expect } from "vitest";
import {
  toCanonicalLevel,
  fromDataSearchResult,
  sourceOk,
  sourceNoData,
  sourceError,
  sourceCandidates,
  GEOGRAPHY_LEVELS,
  RESULT_STATUSES,
  ADAPTER_STATUSES,
  isValidGeographyLevel,
  isAdapterOk,
  isAdapterNoGeo,
  hasGeoDimension,
  isMapReady,
  isTabularOnly,
  isCandidateMode,
  isUnsupported,
  type NormalizedDimension,
  type NormalizedRow,
  type NormalizedSourceResult,
  type FinalMapResolutionResult,
  type SourceMetadata,
  type QueryDiagnostics,
} from "../tools/normalized-result";
import type { DataSearchResult } from "../tools/data-search";
import type { DatasetProfile } from "../types";

// ─── Helpers ────────────────────────────────────────────────

const makeMetadata = (overrides?: Partial<SourceMetadata>): SourceMetadata => ({
  sourceId: "test-source",
  sourceName: "Test Source",
  fetchedAt: 1700000000000,
  ...overrides,
});

const makeDiagnostics = (
  overrides?: Partial<QueryDiagnostics>,
): QueryDiagnostics => ({
  originalPrompt: "test prompt",
  ...overrides,
});

const sampleProfile: DatasetProfile = {
  featureCount: 10,
  geometryType: "Polygon",
  bounds: [
    [55, 11],
    [69, 24],
  ],
  crs: null,
  attributes: [
    { name: "value", type: "number", uniqueValues: 10, nullCount: 0 },
  ],
};

// ─── toCanonicalLevel ───────────────────────────────────────

describe("toCanonicalLevel", () => {
  it("maps unambiguous admin strings", () => {
    expect(toCanonicalLevel("state")).toBe("admin1");
    expect(toCanonicalLevel("province")).toBe("admin1");
    expect(toCanonicalLevel("district")).toBe("admin2");
    expect(toCanonicalLevel("municipality")).toBe("municipality");
    expect(toCanonicalLevel("commune")).toBe("municipality");
    expect(toCanonicalLevel("gmina")).toBe("municipality");
    expect(toCanonicalLevel("county")).toBe("county");
    expect(toCanonicalLevel("region")).toBe("region");
    expect(toCanonicalLevel("country")).toBe("country");
    expect(toCanonicalLevel("global")).toBe("global");
    expect(toCanonicalLevel("regional")).toBe("regional");
  });

  it("maps NUTS levels", () => {
    expect(toCanonicalLevel("nuts0")).toBe("nuts0");
    expect(toCanonicalLevel("nuts1")).toBe("nuts1");
    expect(toCanonicalLevel("nuts2")).toBe("nuts2");
    expect(toCanonicalLevel("nuts3")).toBe("nuts3");
  });

  it("maps special levels", () => {
    expect(toCanonicalLevel("grid")).toBe("grid");
    expect(toCanonicalLevel("postal_code")).toBe("postal_code");
    expect(toCanonicalLevel("metro_area")).toBe("metro_area");
    expect(toCanonicalLevel("point_set")).toBe("point_set");
    expect(toCanonicalLevel("custom_polygon")).toBe("custom_polygon");
  });

  it("returns 'unknown' for ambiguous country-specific strings", () => {
    expect(toCanonicalLevel("city")).toBe("unknown");
    expect(toCanonicalLevel("locality")).toBe("unknown");
    expect(toCanonicalLevel("place")).toBe("unknown");
    expect(toCanonicalLevel("canton")).toBe("unknown");
    expect(toCanonicalLevel("sa2")).toBe("unknown");
    expect(toCanonicalLevel("sa3")).toBe("unknown");
    expect(toCanonicalLevel("sa4")).toBe("unknown");
    expect(toCanonicalLevel("lga")).toBe("unknown");
    expect(toCanonicalLevel("planning_area")).toBe("unknown");
    expect(toCanonicalLevel("territorial_authority")).toBe("unknown");
    expect(toCanonicalLevel("community")).toBe("unknown");
    expect(toCanonicalLevel("voivodeship")).toBe("unknown");
    expect(toCanonicalLevel("prefecture")).toBe("unknown");
    expect(toCanonicalLevel("governorate")).toBe("unknown");
    expect(toCanonicalLevel("department")).toBe("unknown");
    expect(toCanonicalLevel("powiat")).toBe("unknown");
    expect(toCanonicalLevel("regency")).toBe("unknown");
    expect(toCanonicalLevel("local_authority")).toBe("unknown");
    expect(toCanonicalLevel("tract")).toBe("unknown");
    expect(toCanonicalLevel("cma")).toBe("unknown");
  });

  it("returns 'unknown' for empty or garbage input", () => {
    expect(toCanonicalLevel("")).toBe("unknown");
    expect(toCanonicalLevel("asdfasdf")).toBe("unknown");
    expect(toCanonicalLevel("123")).toBe("unknown");
  });

  it("is case-insensitive", () => {
    expect(toCanonicalLevel("State")).toBe("admin1");
    expect(toCanonicalLevel("COUNTRY")).toBe("country");
    expect(toCanonicalLevel("Municipality")).toBe("municipality");
    expect(toCanonicalLevel("NUTS2")).toBe("nuts2");
  });

  it("trims whitespace", () => {
    expect(toCanonicalLevel("  state  ")).toBe("admin1");
    expect(toCanonicalLevel(" country ")).toBe("country");
  });
});

// ─── fromDataSearchResult ───────────────────────────────────

describe("fromDataSearchResult", () => {
  it("converts found=true to adapterStatus 'ok'", () => {
    const legacy: DataSearchResult = {
      found: true,
      source: "World Bank",
      description: "Population",
      cacheKey: "wb-population",
      profile: sampleProfile,
      attributes: ["population", "year"],
    };

    const result = fromDataSearchResult(legacy, "show population");
    expect(result.adapterStatus).toBe("ok");
    expect(result.cacheKey).toBe("wb-population");
    expect(result.profile).toBe(sampleProfile);
    expect(result.candidateMetricFields).toEqual(["population", "year"]);
    expect(result.sourceMetadata.sourceName).toBe("World Bank");
  });

  it("converts found=false to adapterStatus 'no_data'", () => {
    const legacy: DataSearchResult = { found: false };

    const result = fromDataSearchResult(legacy, "something obscure");
    expect(result.adapterStatus).toBe("no_data");
    expect(result.rows).toEqual([]);
    expect(result.dimensions).toEqual([]);
    expect(result.confidence).toBe(0);
  });

  it("converts found=false with error to adapterStatus 'error'", () => {
    const legacy: DataSearchResult = {
      found: false,
      error: "Timeout fetching data",
    };

    const result = fromDataSearchResult(legacy, "broken query");
    expect(result.adapterStatus).toBe("error");
    expect(result.error).toBe("Timeout fetching data");
    expect(result.confidence).toBe(0);
  });

  it("uses low default confidence for bridge results", () => {
    const legacy: DataSearchResult = {
      found: true,
      source: "Web Search",
      cacheKey: "ws-123",
    };

    const result = fromDataSearchResult(legacy, "some query");
    expect(result.confidence).toBe(0.3);
  });

  it("applies overrides", () => {
    const legacy: DataSearchResult = {
      found: true,
      source: "SCB",
      cacheKey: "pxweb-se-TAB638",
    };

    const result = fromDataSearchResult(legacy, "befolkning", {
      geographyHints: ["municipality"],
      countryHints: ["SE"],
      confidence: 0.7,
      sourceId: "se-scb",
      apiType: "pxweb",
    });

    expect(result.geographyHints).toEqual(["municipality"]);
    expect(result.countryHints).toEqual(["SE"]);
    expect(result.confidence).toBe(0.7);
    expect(result.sourceMetadata.sourceId).toBe("se-scb");
    expect(result.sourceMetadata.apiType).toBe("pxweb");
  });

  it("never sets map_ready — that is layer-2 only", () => {
    const legacy: DataSearchResult = {
      found: true,
      source: "Perfect Source",
      cacheKey: "perfect-key",
      profile: sampleProfile,
    };

    const result = fromDataSearchResult(legacy, "perfect query");
    // NormalizedSourceResult has adapterStatus, not ResultStatus
    expect(result.adapterStatus).toBe("ok");
    expect("status" in result).toBe(false);
  });

  it("leaves dimensions and rows empty (legacy has no structured data)", () => {
    const legacy: DataSearchResult = {
      found: true,
      source: "World Bank",
      cacheKey: "wb-pop",
    };

    const result = fromDataSearchResult(legacy, "population");
    expect(result.dimensions).toEqual([]);
    expect(result.rows).toEqual([]);
  });
});

// ─── Convenience constructors ───────────────────────────────

describe("sourceOk", () => {
  it("produces correct shape with rows and dimensions", () => {
    const dims: NormalizedDimension[] = [
      {
        id: "Region",
        label: "Region",
        role: "geo",
        values: [
          { code: "0180", label: "Stockholm" },
          { code: "1280", label: "Malmö" },
        ],
      },
      {
        id: "Tid",
        label: "Year",
        role: "time",
        values: [{ code: "2023", label: "2023" }],
      },
    ];

    const rows: NormalizedRow[] = [
      { dimensionValues: { Region: "0180", Tid: "2023" }, value: 984748 },
      { dimensionValues: { Region: "1280", Tid: "2023" }, value: 357377 },
    ];

    const result = sourceOk({
      dimensions: dims,
      rows,
      candidateMetricFields: ["Folkmängd"],
      countryHints: ["SE"],
      geographyHints: ["municipality"],
      sourceMetadata: makeMetadata({ sourceId: "se-scb", apiType: "pxweb" }),
      diagnostics: makeDiagnostics({
        searchQuery: "befolkning",
        tablesFound: 5,
        tableSelected: "TAB638",
      }),
      confidence: 0.85,
      cacheKey: "pxweb-se-TAB638",
    });

    expect(result.adapterStatus).toBe("ok");
    expect(result.dimensions).toHaveLength(2);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].value).toBe(984748);
    expect(result.confidence).toBe(0.85);
    expect(result.countryHints).toEqual(["SE"]);
    expect(result.geographyHints).toEqual(["municipality"]);
    expect(result.sourceMetadata.sourceId).toBe("se-scb");
    expect(result.diagnostics.tableSelected).toBe("TAB638");
  });
});

describe("sourceNoData", () => {
  it("produces empty rows with correct status", () => {
    const result = sourceNoData({
      sourceMetadata: makeMetadata(),
      diagnostics: makeDiagnostics({ searchQuery: "something weird" }),
      error: "No tables found",
    });

    expect(result.adapterStatus).toBe("no_data");
    expect(result.rows).toEqual([]);
    expect(result.dimensions).toEqual([]);
    expect(result.confidence).toBe(0);
    expect(result.error).toBe("No tables found");
  });
});

describe("sourceError", () => {
  it("includes error message with correct status", () => {
    const result = sourceError({
      sourceMetadata: makeMetadata(),
      diagnostics: makeDiagnostics(),
      error: "Connection timeout after 8000ms",
    });

    expect(result.adapterStatus).toBe("error");
    expect(result.error).toBe("Connection timeout after 8000ms");
    expect(result.confidence).toBe(0);
    expect(result.rows).toEqual([]);
  });
});

describe("sourceCandidates", () => {
  it("produces result with candidates and low confidence", () => {
    const result = sourceCandidates({
      candidates: [
        { id: "TAB1", label: "Population by municipality", source: "SCB" },
        { id: "TAB2", label: "Population by county", source: "SCB" },
      ],
      sourceMetadata: makeMetadata({ sourceId: "se-scb" }),
      diagnostics: makeDiagnostics({ tablesFound: 2 }),
      countryHints: ["SE"],
    });

    expect(result.adapterStatus).toBe("ok");
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates![0].id).toBe("TAB1");
    expect(result.confidence).toBe(0.2);
    expect(result.rows).toEqual([]);
    expect(result.dimensions).toEqual([]);
    expect(result.countryHints).toEqual(["SE"]);
  });

  it("defaults countryHints and geographyHints to empty", () => {
    const result = sourceCandidates({
      candidates: [{ id: "T1", label: "Test", source: "test" }],
      sourceMetadata: makeMetadata(),
      diagnostics: makeDiagnostics(),
    });

    expect(result.countryHints).toEqual([]);
    expect(result.geographyHints).toEqual([]);
  });
});

// ─── Runtime enum arrays ────────────────────────────────────

describe("GEOGRAPHY_LEVELS", () => {
  it("contains all required canonical levels", () => {
    const required = [
      "country",
      "admin1",
      "admin2",
      "municipality",
      "county",
      "region",
      "postal_code",
      "metro_area",
      "nuts0",
      "nuts1",
      "nuts2",
      "nuts3",
      "point_set",
      "custom_polygon",
      "grid",
      "unknown",
    ];
    for (const level of required) {
      expect(GEOGRAPHY_LEVELS).toContain(level);
    }
  });

  it("also includes supra-national levels", () => {
    expect(GEOGRAPHY_LEVELS).toContain("global");
    expect(GEOGRAPHY_LEVELS).toContain("regional");
  });

  it("has no duplicates", () => {
    const unique = new Set(GEOGRAPHY_LEVELS);
    expect(unique.size).toBe(GEOGRAPHY_LEVELS.length);
  });
});

describe("RESULT_STATUSES", () => {
  it("contains exactly the 4 pipeline states", () => {
    expect(RESULT_STATUSES).toEqual([
      "map_ready",
      "tabular_only",
      "candidate_mode",
      "unsupported",
    ]);
  });
});

describe("ADAPTER_STATUSES", () => {
  it("contains exactly the 4 adapter states", () => {
    expect(ADAPTER_STATUSES).toEqual([
      "ok",
      "no_data",
      "no_geo_dimension",
      "error",
    ]);
  });
});

// ─── isValidGeographyLevel ──────────────────────────────────

describe("isValidGeographyLevel", () => {
  it("returns true for all canonical levels", () => {
    for (const level of GEOGRAPHY_LEVELS) {
      expect(isValidGeographyLevel(level)).toBe(true);
    }
  });

  it("returns false for invalid strings", () => {
    expect(isValidGeographyLevel("city")).toBe(false);
    expect(isValidGeographyLevel("")).toBe(false);
    expect(isValidGeographyLevel("canton")).toBe(false);
    expect(isValidGeographyLevel("State")).toBe(false); // case-sensitive
  });
});

// ─── Layer 1 type guards ────────────────────────────────────

describe("isAdapterOk", () => {
  it("returns true for ok status", () => {
    const r = sourceOk({
      dimensions: [],
      rows: [],
      candidateMetricFields: [],
      countryHints: [],
      geographyHints: [],
      sourceMetadata: makeMetadata(),
      diagnostics: makeDiagnostics(),
      confidence: 0.5,
    });
    expect(isAdapterOk(r)).toBe(true);
  });

  it("returns false for non-ok statuses", () => {
    expect(isAdapterOk(sourceNoData({ sourceMetadata: makeMetadata(), diagnostics: makeDiagnostics() }))).toBe(false);
    expect(isAdapterOk(sourceError({ sourceMetadata: makeMetadata(), diagnostics: makeDiagnostics(), error: "fail" }))).toBe(false);
  });
});

describe("isAdapterNoGeo", () => {
  it("returns true for no_geo_dimension status", () => {
    const r: NormalizedSourceResult = {
      adapterStatus: "no_geo_dimension",
      dimensions: [{ id: "Tid", label: "Year", role: "time", values: [] }],
      rows: [{ dimensionValues: { Tid: "2023" }, value: 42 }],
      candidateMetricFields: [],
      countryHints: [],
      geographyHints: [],
      sourceMetadata: makeMetadata(),
      diagnostics: makeDiagnostics(),
      confidence: 0.4,
    };
    expect(isAdapterNoGeo(r)).toBe(true);
  });

  it("returns false for ok status", () => {
    const r = sourceOk({
      dimensions: [],
      rows: [],
      candidateMetricFields: [],
      countryHints: [],
      geographyHints: [],
      sourceMetadata: makeMetadata(),
      diagnostics: makeDiagnostics(),
      confidence: 0.5,
    });
    expect(isAdapterNoGeo(r)).toBe(false);
  });
});

describe("hasGeoDimension", () => {
  it("returns true when a geo-role dimension exists", () => {
    const r = sourceOk({
      dimensions: [
        { id: "Region", label: "Region", role: "geo", values: [{ code: "01", label: "Stockholm" }] },
        { id: "Tid", label: "Year", role: "time", values: [{ code: "2023", label: "2023" }] },
      ],
      rows: [],
      candidateMetricFields: [],
      countryHints: [],
      geographyHints: [],
      sourceMetadata: makeMetadata(),
      diagnostics: makeDiagnostics(),
      confidence: 0.7,
    });
    expect(hasGeoDimension(r)).toBe(true);
  });

  it("returns false when no geo-role dimension exists", () => {
    const r = sourceOk({
      dimensions: [
        { id: "Tid", label: "Year", role: "time", values: [] },
        { id: "ContentsCode", label: "Metric", role: "metric", values: [] },
      ],
      rows: [],
      candidateMetricFields: [],
      countryHints: [],
      geographyHints: [],
      sourceMetadata: makeMetadata(),
      diagnostics: makeDiagnostics(),
      confidence: 0.5,
    });
    expect(hasGeoDimension(r)).toBe(false);
  });

  it("returns false when dimensions array is empty", () => {
    const r = sourceNoData({ sourceMetadata: makeMetadata(), diagnostics: makeDiagnostics() });
    expect(hasGeoDimension(r)).toBe(false);
  });
});

// ─── Layer 2 type guards ────────────────────────────────────

describe("FinalMapResolutionResult type guards", () => {
  const makeResult = (status: "map_ready" | "tabular_only" | "candidate_mode" | "unsupported"): FinalMapResolutionResult => ({
    status,
    source: "test",
  });

  it("isMapReady detects map_ready", () => {
    expect(isMapReady(makeResult("map_ready"))).toBe(true);
    expect(isMapReady(makeResult("tabular_only"))).toBe(false);
    expect(isMapReady(makeResult("candidate_mode"))).toBe(false);
    expect(isMapReady(makeResult("unsupported"))).toBe(false);
  });

  it("isTabularOnly detects tabular_only", () => {
    expect(isTabularOnly(makeResult("tabular_only"))).toBe(true);
    expect(isTabularOnly(makeResult("map_ready"))).toBe(false);
  });

  it("isCandidateMode detects candidate_mode", () => {
    expect(isCandidateMode(makeResult("candidate_mode"))).toBe(true);
    expect(isCandidateMode(makeResult("map_ready"))).toBe(false);
  });

  it("isUnsupported detects unsupported", () => {
    expect(isUnsupported(makeResult("unsupported"))).toBe(true);
    expect(isUnsupported(makeResult("map_ready"))).toBe(false);
  });

  it("exactly one guard is true for each status", () => {
    for (const status of RESULT_STATUSES) {
      const r = makeResult(status);
      const guards = [isMapReady(r), isTabularOnly(r), isCandidateMode(r), isUnsupported(r)];
      const trueCount = guards.filter(Boolean).length;
      expect(trueCount).toBe(1);
    }
  });
});
