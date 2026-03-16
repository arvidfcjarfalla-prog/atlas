/**
 * Tests for universal source adapter contract + PxWeb normalization.
 */
import { describe, it, expect } from "vitest";
import type {
  NormalizedSourceResult,
  NormalizedDimension,
  NormalizedRow,
} from "../tools/normalized-result";
import { sourceOk, sourceNoData, sourceError } from "../tools/normalized-result";
import type { PxDimension, PxTableMetadata, PxDataRecord, PxTableInfo, PxDimensionSelection } from "../tools/pxweb-client";
import {
  pxDimTypeToRole,
  normalizePxDimensions,
  normalizePxRecords,
  inferPxGeographyHints,
  identifyPxMetricFields,
  buildPxCandidates,
  normalizePxWebResult,
  normalizePxNoGeoDimension,
  validateAdapterOutput,
} from "../tools/source-adapter";

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function makePxDimension(overrides: Partial<PxDimension> & { id: string }): PxDimension {
  return {
    label: overrides.label ?? overrides.id,
    type: overrides.type ?? "regular",
    values: overrides.values ?? [],
    ...overrides,
  };
}

function makeMetadata(dims: PxDimension[]): PxTableMetadata {
  return {
    id: "T001",
    label: "Test table",
    source: "Test agency",
    dimensions: dims,
  };
}

function makeRecords(count: number): PxDataRecord[] {
  const records: PxDataRecord[] = [];
  for (let i = 0; i < count; i++) {
    records.push({
      regionCode: `R${String(i).padStart(2, "0")}`,
      regionLabel: `Region ${i}`,
      metricCode: "POP",
      metricLabel: "Population",
      timePeriod: "2023",
      value: (i + 1) * 1000,
    });
  }
  return records;
}

function makeTableInfos(count: number): PxTableInfo[] {
  const tables: PxTableInfo[] = [];
  for (let i = 0; i < count; i++) {
    tables.push({
      id: `TAB${String(i).padStart(3, "0")}`,
      label: `Table ${i}`,
      description: `Description ${i}`,
      variableNames: ["Region", "Tid"],
      firstPeriod: "2010",
      lastPeriod: "2023",
      source: "Test",
    });
  }
  return tables;
}

function fullPxOpts(overrides?: Record<string, unknown>) {
  const geoDim = makePxDimension({
    id: "Region",
    label: "Region",
    type: "geo",
    values: [
      { code: "0180", label: "Stockholm" },
      { code: "1280", label: "Malmö" },
      { code: "1480", label: "Göteborg" },
    ],
  });
  const contentsDim = makePxDimension({
    id: "ContentsCode",
    label: "Contents",
    type: "contents",
    values: [{ code: "POP", label: "Population" }],
  });
  const timeDim = makePxDimension({
    id: "Tid",
    label: "Year",
    type: "time",
    values: [{ code: "2023", label: "2023" }],
  });

  const metadata = makeMetadata([geoDim, contentsDim, timeDim]);
  const records = makeRecords(3);
  const selections: PxDimensionSelection[] = [
    { dimensionId: "Region", valueCodes: ["0180", "1280", "1480"] },
    { dimensionId: "ContentsCode", valueCodes: ["POP"] },
    { dimensionId: "Tid", valueCodes: ["2023"] },
  ];

  return {
    metadata,
    records,
    selections,
    geoDimId: "Region",
    contentsDimId: "ContentsCode",
    timeDimId: "Tid",
    sourceId: "se-scb",
    sourceName: "SCB",
    countryCode: "SE" as string | null,
    prompt: "population by municipality in Sweden",
    searchQuery: "population",
    tables: makeTableInfos(3),
    language: "sv",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Adapter contract validation
// ═══════════════════════════════════════════════════════════════

describe("validateAdapterOutput", () => {
  it("accepts a valid ok result", () => {
    const result = normalizePxWebResult(fullPxOpts());
    expect(validateAdapterOutput(result)).toEqual([]);
  });

  it("accepts a valid no_data result", () => {
    const result = sourceNoData({
      sourceMetadata: {
        sourceId: "test",
        sourceName: "Test",
        fetchedAt: Date.now(),
      },
      diagnostics: { originalPrompt: "test query" },
    });
    expect(validateAdapterOutput(result)).toEqual([]);
  });

  it("accepts a valid error result", () => {
    const result = sourceError({
      sourceMetadata: {
        sourceId: "test",
        sourceName: "Test",
        fetchedAt: Date.now(),
      },
      diagnostics: { originalPrompt: "test query" },
      error: "Connection refused",
    });
    expect(validateAdapterOutput(result)).toEqual([]);
  });

  it("rejects error status without error message", () => {
    const result: NormalizedSourceResult = {
      adapterStatus: "error",
      dimensions: [],
      rows: [],
      candidateMetricFields: [],
      countryHints: [],
      geographyHints: [],
      sourceMetadata: {
        sourceId: "x",
        sourceName: "X",
        fetchedAt: Date.now(),
      },
      diagnostics: { originalPrompt: "test" },
      confidence: 0,
    };
    const errors = validateAdapterOutput(result);
    expect(errors.some((e) => e.field === "error")).toBe(true);
  });

  it("rejects confidence out of range", () => {
    const result: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [],
      rows: [{ dimensionValues: { x: "1" }, value: 42 }],
      candidateMetricFields: [],
      countryHints: [],
      geographyHints: [],
      sourceMetadata: {
        sourceId: "x",
        sourceName: "X",
        fetchedAt: Date.now(),
      },
      diagnostics: { originalPrompt: "test" },
      confidence: 1.5,
    };
    const errors = validateAdapterOutput(result);
    expect(errors.some((e) => e.field === "confidence")).toBe(true);
  });

  it("rejects ok status with no rows and no candidates", () => {
    const result: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [],
      rows: [],
      candidateMetricFields: [],
      countryHints: [],
      geographyHints: [],
      sourceMetadata: {
        sourceId: "x",
        sourceName: "X",
        fetchedAt: Date.now(),
      },
      diagnostics: { originalPrompt: "test" },
      confidence: 0.5,
    };
    const errors = validateAdapterOutput(result);
    expect(errors.some((e) => e.field === "rows")).toBe(true);
  });

  it("validates dimension structure", () => {
    const result: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [
        { id: "", label: "Bad", role: "geo", values: [] },
        { id: "ok", label: "Ok", role: "invalid" as NormalizedDimension["role"], values: [] },
      ],
      rows: [{ dimensionValues: { x: "1" }, value: 1 }],
      candidateMetricFields: [],
      countryHints: [],
      geographyHints: [],
      sourceMetadata: {
        sourceId: "x",
        sourceName: "X",
        fetchedAt: Date.now(),
      },
      diagnostics: { originalPrompt: "test" },
      confidence: 0.5,
    };
    const errors = validateAdapterOutput(result);
    expect(errors.some((e) => e.field === "dimensions[0].id")).toBe(true);
    expect(errors.some((e) => e.field === "dimensions[1].role")).toBe(true);
  });

  it("validates row structure", () => {
    const result: NormalizedSourceResult = {
      adapterStatus: "ok",
      dimensions: [],
      rows: [
        { dimensionValues: {}, value: "not a number" as unknown as number },
      ],
      candidateMetricFields: [],
      countryHints: [],
      geographyHints: [],
      sourceMetadata: {
        sourceId: "x",
        sourceName: "X",
        fetchedAt: Date.now(),
      },
      diagnostics: { originalPrompt: "test" },
      confidence: 0.5,
    };
    const errors = validateAdapterOutput(result);
    expect(errors.some((e) => e.field === "rows[0].value")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// PxWeb dimension normalization
// ═══════════════════════════════════════════════════════════════

describe("pxDimTypeToRole", () => {
  it("maps geo → geo", () => expect(pxDimTypeToRole("geo")).toBe("geo"));
  it("maps time → time", () => expect(pxDimTypeToRole("time")).toBe("time"));
  it("maps contents → metric", () => expect(pxDimTypeToRole("contents")).toBe("metric"));
  it("maps regular → filter", () => expect(pxDimTypeToRole("regular")).toBe("filter"));
});

describe("normalizePxDimensions", () => {
  it("converts PxDimension[] to NormalizedDimension[]", () => {
    const dims: PxDimension[] = [
      makePxDimension({
        id: "Region",
        label: "Region",
        type: "geo",
        values: [{ code: "01", label: "Stockholm" }],
      }),
      makePxDimension({
        id: "Tid",
        label: "Year",
        type: "time",
        values: [{ code: "2023", label: "2023" }],
      }),
    ];

    const result = normalizePxDimensions(dims);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("Region");
    expect(result[0].role).toBe("geo");
    expect(result[0].values).toEqual([{ code: "01", label: "Stockholm" }]);
    expect(result[1].role).toBe("time");
  });

  it("preserves all values", () => {
    const dim = makePxDimension({
      id: "ContentsCode",
      type: "contents",
      values: [
        { code: "POP", label: "Population" },
        { code: "INC", label: "Income" },
      ],
    });
    const result = normalizePxDimensions([dim]);
    expect(result[0].values).toHaveLength(2);
    expect(result[0].role).toBe("metric");
  });
});

// ═══════════════════════════════════════════════════════════════
// PxWeb record normalization
// ═══════════════════════════════════════════════════════════════

describe("normalizePxRecords", () => {
  it("maps PxDataRecord[] to NormalizedRow[]", () => {
    const records: PxDataRecord[] = [
      {
        regionCode: "0180",
        regionLabel: "Stockholm",
        metricCode: "POP",
        metricLabel: "Population",
        timePeriod: "2023",
        value: 975000,
      },
    ];

    const rows = normalizePxRecords(records, "Region", "ContentsCode", "Tid");

    expect(rows).toHaveLength(1);
    expect(rows[0].dimensionValues["Region"]).toBe("0180");
    expect(rows[0].dimensionValues["ContentsCode"]).toBe("POP");
    expect(rows[0].dimensionValues["Tid"]).toBe("2023");
    expect(rows[0].value).toBe(975000);
  });

  it("preserves null values", () => {
    const records: PxDataRecord[] = [
      {
        regionCode: "01",
        regionLabel: "Test",
        metricCode: "X",
        metricLabel: "X",
        timePeriod: "2023",
        value: null,
      },
    ];

    const rows = normalizePxRecords(records, "Reg", "Cont", "Time");
    expect(rows[0].value).toBeNull();
  });

  it("includes fixed regular dimension values from selections", () => {
    const records: PxDataRecord[] = [
      {
        regionCode: "0180",
        regionLabel: "Stockholm",
        metricCode: "POP",
        metricLabel: "Population",
        timePeriod: "2023",
        value: 100,
      },
    ];

    const selections: PxDimensionSelection[] = [
      { dimensionId: "Region", valueCodes: ["0180"] },
      { dimensionId: "ContentsCode", valueCodes: ["POP"] },
      { dimensionId: "Tid", valueCodes: ["2023"] },
      { dimensionId: "Kon", valueCodes: ["T"] }, // "both sexes" regular dim
    ];

    const rows = normalizePxRecords(records, "Region", "ContentsCode", "Tid", selections);
    expect(rows[0].dimensionValues["Kon"]).toBe("T");
  });

  it("does not include multi-value regular dimensions", () => {
    const records = makeRecords(1);
    const selections: PxDimensionSelection[] = [
      { dimensionId: "Region", valueCodes: ["R00"] },
      { dimensionId: "ContentsCode", valueCodes: ["POP"] },
      { dimensionId: "Tid", valueCodes: ["2023"] },
      { dimensionId: "Age", valueCodes: ["0-17", "18-64", "65+"] },
    ];

    const rows = normalizePxRecords(records, "Region", "ContentsCode", "Tid", selections);
    expect(rows[0].dimensionValues["Age"]).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Geography hint inference
// ═══════════════════════════════════════════════════════════════

describe("inferPxGeographyHints", () => {
  it("infers municipality from kommun in dimension id", () => {
    const dim = makePxDimension({ id: "Kommun", type: "geo", values: [{ code: "0180", label: "Stockholm" }] });
    expect(inferPxGeographyHints(dim, "SE")).toContain("municipality");
  });

  it("infers county from län in label", () => {
    const dim = makePxDimension({ id: "Region", label: "Län", type: "geo", values: [{ code: "01", label: "Stockholm" }] });
    expect(inferPxGeographyHints(dim, "SE")).toContain("county");
  });

  it("infers municipality from kommune (NO)", () => {
    const dim = makePxDimension({ id: "Kommune", type: "geo", values: [{ code: "0301", label: "Oslo" }] });
    expect(inferPxGeographyHints(dim, "NO")).toContain("municipality");
  });

  it("infers county from fylke (NO)", () => {
    const dim = makePxDimension({ id: "Fylke", type: "geo", values: [{ code: "03", label: "Oslo" }] });
    expect(inferPxGeographyHints(dim, "NO")).toContain("county");
  });

  it("infers municipality from 4-digit codes for SE", () => {
    const dim = makePxDimension({
      id: "Region",
      type: "geo",
      values: [
        { code: "0180", label: "Stockholm" },
        { code: "1280", label: "Malmö" },
      ],
    });
    expect(inferPxGeographyHints(dim, "SE")).toContain("municipality");
  });

  it("infers county from 2-digit codes for SE", () => {
    const dim = makePxDimension({
      id: "Region",
      type: "geo",
      values: [
        { code: "01", label: "Stockholm" },
        { code: "03", label: "Uppsala" },
      ],
    });
    expect(inferPxGeographyHints(dim, "SE")).toContain("county");
  });

  it("returns unknown for unrecognized patterns with multiple values", () => {
    const dim = makePxDimension({
      id: "Area",
      type: "geo",
      values: [
        { code: "ABC", label: "Place A" },
        { code: "DEF", label: "Place B" },
      ],
    });
    expect(inferPxGeographyHints(dim, "FI")).toContain("unknown");
  });

  it("returns empty for single-value geo dimension", () => {
    const dim = makePxDimension({
      id: "Area",
      type: "geo",
      values: [{ code: "00", label: "Whole country" }],
    });
    // Single value after filtering "00" → no non-aggregate codes → no hints from length
    // Only 1 value total → not > 1 → no fallback
    expect(inferPxGeographyHints(dim, null)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Metric field identification
// ═══════════════════════════════════════════════════════════════

describe("identifyPxMetricFields", () => {
  it("returns contents dimension value labels", () => {
    const meta = makeMetadata([
      makePxDimension({
        id: "ContentsCode",
        type: "contents",
        values: [
          { code: "POP", label: "Population" },
          { code: "INC", label: "Median income" },
        ],
      }),
    ]);
    expect(identifyPxMetricFields(meta)).toEqual(["Population", "Median income"]);
  });

  it("returns empty when no contents dimension", () => {
    const meta = makeMetadata([
      makePxDimension({ id: "Region", type: "geo" }),
    ]);
    expect(identifyPxMetricFields(meta)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Candidate building
// ═══════════════════════════════════════════════════════════════

describe("buildPxCandidates", () => {
  it("skips the first table and returns up to 5", () => {
    const tables = makeTableInfos(8);
    const candidates = buildPxCandidates(tables, "SCB");
    expect(candidates).toHaveLength(5);
    expect(candidates[0].id).toBe("TAB001"); // skipped TAB000
  });

  it("handles fewer tables than skip", () => {
    const tables = makeTableInfos(1);
    const candidates = buildPxCandidates(tables, "SCB");
    expect(candidates).toHaveLength(0);
  });

  it("includes time coverage when available", () => {
    const tables = makeTableInfos(3);
    const candidates = buildPxCandidates(tables, "SCB");
    expect(candidates[0].timeCoverage).toBe("2010–2023");
  });

  it("omits time coverage when periods missing", () => {
    const tables: PxTableInfo[] = [
      { id: "A", label: "A", description: "", variableNames: [], firstPeriod: "", lastPeriod: "", source: "" },
      { id: "B", label: "B", description: "", variableNames: [], firstPeriod: "", lastPeriod: "", source: "" },
    ];
    const candidates = buildPxCandidates(tables, "X");
    expect(candidates[0].timeCoverage).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Full PxWeb normalization
// ═══════════════════════════════════════════════════════════════

describe("normalizePxWebResult", () => {
  it("produces a valid ok result for typical Swedish municipality data", () => {
    const result = normalizePxWebResult(fullPxOpts());

    expect(result.adapterStatus).toBe("ok");
    expect(validateAdapterOutput(result)).toEqual([]);

    // Dimensions
    expect(result.dimensions).toHaveLength(3);
    expect(result.dimensions.find((d) => d.role === "geo")?.id).toBe("Region");
    expect(result.dimensions.find((d) => d.role === "metric")?.id).toBe("ContentsCode");
    expect(result.dimensions.find((d) => d.role === "time")?.id).toBe("Tid");

    // Rows
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0].dimensionValues["Region"]).toBe("R00");
    expect(result.rows[0].value).toBe(1000);

    // Hints
    expect(result.countryHints).toEqual(["SE"]);
    expect(result.geographyHints.length).toBeGreaterThan(0);

    // Metadata
    expect(result.sourceMetadata.sourceId).toBe("se-scb");
    expect(result.sourceMetadata.apiType).toBe("pxweb-v2");
    expect(result.sourceMetadata.tableId).toBe("T001");

    // Diagnostics
    expect(result.diagnostics.searchQuery).toBe("population");
    expect(result.diagnostics.tablesFound).toBe(3);
    expect(result.diagnostics.cellCount).toBe(3);
  });

  it("returns no_data when records are empty", () => {
    const result = normalizePxWebResult(fullPxOpts({ records: [] }));
    expect(result.adapterStatus).toBe("no_data");
    expect(result.error).toContain("No records");
  });

  it("returns error when geo dimension is missing from metadata", () => {
    const badMeta = makeMetadata([
      makePxDimension({ id: "ContentsCode", type: "contents", values: [{ code: "POP", label: "Pop" }] }),
      makePxDimension({ id: "Tid", type: "time", values: [{ code: "2023", label: "2023" }] }),
    ]);
    const result = normalizePxWebResult(fullPxOpts({
      metadata: badMeta,
      geoDimId: "Region",
    }));
    expect(result.adapterStatus).toBe("error");
    expect(result.error).toContain("Geo dimension");
  });

  it("includes candidates from additional tables", () => {
    const result = normalizePxWebResult(fullPxOpts());
    expect(result.candidates).toBeDefined();
    expect(result.candidates!.length).toBeGreaterThan(0);
  });

  it("sets confidence lower for few records", () => {
    const fewRecords = normalizePxWebResult(fullPxOpts({ records: makeRecords(2) }));
    const manyRecords = normalizePxWebResult(fullPxOpts({ records: makeRecords(20) }));
    expect(fewRecords.confidence).toBeLessThan(manyRecords.confidence);
  });

  it("sets empty countryHints when countryCode is null", () => {
    const result = normalizePxWebResult(fullPxOpts({ countryCode: null }));
    expect(result.countryHints).toEqual([]);
  });

  it("records dimension selections in diagnostics", () => {
    const result = normalizePxWebResult(fullPxOpts());
    expect(result.diagnostics.dimensionSelections).toBeDefined();
    expect(result.diagnostics.dimensionSelections!["Tid"]).toEqual(["2023"]);
  });
});

// ═══════════════════════════════════════════════════════════════
// No-geo-dimension normalization
// ═══════════════════════════════════════════════════════════════

describe("normalizePxNoGeoDimension", () => {
  it("returns no_geo_dimension status", () => {
    const meta = makeMetadata([
      makePxDimension({
        id: "ContentsCode",
        type: "contents",
        values: [{ code: "GDP", label: "GDP" }],
      }),
      makePxDimension({
        id: "Tid",
        type: "time",
        values: [{ code: "2023", label: "2023" }],
      }),
    ]);

    const result = normalizePxNoGeoDimension({
      metadata: meta,
      sourceId: "se-scb",
      sourceName: "SCB",
      prompt: "GDP Sweden",
      searchQuery: "gdp",
      tables: makeTableInfos(2),
      language: "en",
    });

    expect(result.adapterStatus).toBe("no_geo_dimension");
    expect(result.rows).toEqual([]);
    expect(result.confidence).toBe(0.3);
    expect(result.diagnostics.warnings).toBeDefined();
    expect(result.diagnostics.warnings![0]).toContain("no geographic dimension");
  });

  it("still identifies metric fields", () => {
    const meta = makeMetadata([
      makePxDimension({
        id: "ContentsCode",
        type: "contents",
        values: [
          { code: "GDP", label: "Gross Domestic Product" },
          { code: "CPI", label: "Consumer Price Index" },
        ],
      }),
    ]);

    const result = normalizePxNoGeoDimension({
      metadata: meta,
      sourceId: "test",
      sourceName: "Test",
      prompt: "test",
      searchQuery: "test",
      tables: [],
      language: "en",
    });

    expect(result.candidateMetricFields).toEqual([
      "Gross Domestic Product",
      "Consumer Price Index",
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Adapter does NOT set map readiness
// ═══════════════════════════════════════════════════════════════

describe("adapter boundary rules", () => {
  it("result never contains map_ready or tabular_only status", () => {
    const result = normalizePxWebResult(fullPxOpts());
    // NormalizedSourceResult uses adapterStatus, not ResultStatus
    expect(result.adapterStatus).toBe("ok");
    // Ensure no ResultStatus leaks through
    const raw = result as unknown as Record<string, unknown>;
    expect(raw["status"]).toBeUndefined();
  });

  it("result never contains geometry layer info", () => {
    const raw = normalizePxWebResult(fullPxOpts()) as unknown as Record<string, unknown>;
    expect(raw["geometry"]).toBeUndefined();
    expect(raw["geometryLayerId"]).toBeUndefined();
  });

  it("result never contains join plan", () => {
    const raw = normalizePxWebResult(fullPxOpts()) as unknown as Record<string, unknown>;
    expect(raw["joinPlan"]).toBeUndefined();
    expect(raw["joinDiagnostics"]).toBeUndefined();
  });
});
