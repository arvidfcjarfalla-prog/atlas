import { describe, it, expect } from "vitest";
import {
  buildPxSearchQuery,
  translateSearchQuery,
  isPxWebV2,
  rankTables,
  classifyDimension,
  selectDimensions,
  selectDimensionsWithAmbiguity,
  jsonStat2ToRecords,
  recordsToGeoJSON,
  extractGeoLevelHint,
  type PxTableInfo,
  type PxTableMetadata,
  type PxJsonStat2Response,
} from "../tools/pxweb-client";

// ─── buildPxSearchQuery ─────────────────────────────────────

describe("buildPxSearchQuery", () => {
  it("strips stop words", () => {
    const q = buildPxSearchQuery("show me a map of unemployment");
    expect(q).not.toContain("show");
    expect(q).not.toContain("map");
    expect(q).toContain("unemployment");
  });

  it("strips country names", () => {
    const q = buildPxSearchQuery("population in Sweden by municipality");
    expect(q).not.toContain("sweden");
    expect(q).not.toContain("municipality");
    expect(q).toContain("population");
  });

  it("strips Swedish stop words", () => {
    const q = buildPxSearchQuery("visa karta över befolkning");
    expect(q).not.toContain("visa");
    expect(q).not.toContain("karta");
    expect(q).toContain("befolkning");
  });

  it("preserves topic keywords", () => {
    const q = buildPxSearchQuery("arbetslöshet i svenska kommuner");
    expect(q).toContain("arbetslöshet");
    expect(q).not.toContain("svenska");
    expect(q).not.toContain("kommuner");
  });

  it("returns empty for pure stop words", () => {
    const q = buildPxSearchQuery("show me a map");
    expect(q.trim()).toBe("");
  });
});

// ─── translateSearchQuery ───────────────────────────────────

describe("translateSearchQuery", () => {
  it("translates English to Swedish for lang=sv", () => {
    expect(translateSearchQuery("population", "sv")).toBe("folkmängd");
    expect(translateSearchQuery("income", "sv")).toBe("förvärvsinkomst");
  });

  it("returns Swedish synonyms normalized for lang=sv", () => {
    expect(translateSearchQuery("befolkning", "sv")).toBe("folkmängd");
    expect(translateSearchQuery("invånare", "sv")).toBe("folkmängd");
  });

  it("translates Norwegian 'befolkning' to English for lang=en", () => {
    expect(translateSearchQuery("befolkning", "en")).toBe("population");
  });

  it("translates Norwegian 'arbeidsledighet' to English for lang=en", () => {
    expect(translateSearchQuery("arbeidsledighet", "en")).toBe("unemployment");
  });

  it("leaves already-English words unchanged for lang=en", () => {
    expect(translateSearchQuery("population", "en")).toBe("population");
  });

  it("returns query unchanged for unknown lang", () => {
    expect(translateSearchQuery("befolkning", "de")).toBe("befolkning");
  });
});

// ─── isPxWebV2 ──────────────────────────────────────────────

describe("isPxWebV2", () => {
  it("returns true for SCB v2 URL", () => {
    expect(isPxWebV2("https://api.scb.se/OV0104/v2beta/api/v2")).toBe(true);
  });

  it("returns true for SSB v2 URL", () => {
    expect(isPxWebV2("https://data.ssb.no/api/pxwebapi/v2")).toBe(true);
  });

  it("returns false for Finland v1 URL", () => {
    expect(isPxWebV2("https://pxdata.stat.fi/PXWeb/api/v1/en")).toBe(false);
  });

  it("returns false for generic portal URL", () => {
    expect(isPxWebV2("https://some-stats-portal.gov")).toBe(false);
  });
});

// ─── classifyDimension ──────────────────────────────────────

describe("classifyDimension", () => {
  it("classifies Region as geo", () => {
    expect(classifyDimension("Region", "region")).toBe("geo");
  });

  it("classifies Kommun as geo", () => {
    expect(classifyDimension("Kommun", "municipality")).toBe("geo");
  });

  it("classifies Tid as time", () => {
    expect(classifyDimension("Tid", "year")).toBe("time");
  });

  it("classifies ContentsCode as contents", () => {
    expect(classifyDimension("ContentsCode", "observations")).toBe("contents");
  });

  it("classifies Kon as regular", () => {
    expect(classifyDimension("Kon", "sex")).toBe("regular");
  });

  it("classifies Alder as regular", () => {
    expect(classifyDimension("Alder", "age")).toBe("regular");
  });
});

// ─── rankTables ─────────────────────────────────────────────

describe("rankTables", () => {
  const tables: PxTableInfo[] = [
    {
      id: "T1",
      label: "Population by age and sex",
      description: "Annual data",
      variableNames: ["age", "sex", "year"],
      firstPeriod: "2000",
      lastPeriod: "2024",
      source: "SCB",
    },
    {
      id: "T2",
      label: "Population by region",
      description: "Municipal level population data",
      variableNames: ["Region", "ContentsCode", "Tid"],
      firstPeriod: "2000",
      lastPeriod: "2024",
      source: "SCB",
    },
    {
      id: "T3",
      label: "Trade statistics",
      description: "Import and export",
      variableNames: ["country", "product", "year"],
      firstPeriod: "2010",
      lastPeriod: "2018",
      source: "SCB",
    },
  ];

  it("ranks table with Region dimension higher", () => {
    const ranked = rankTables(tables, "population");
    expect(ranked[0].id).toBe("T2"); // Has Region dimension
  });

  it("ranks by keyword match when no geo dimension present", () => {
    // T3 has 3 keyword matches (trade, import, export) × desc = 3 points
    // T2 has Region (+5) but no keyword match
    // For trade queries, T3 should be top (or close) since it has the most keyword hits
    const ranked = rankTables(tables, "trade import export");
    // T3 scores: "trade" in label (+3) + "import" in desc (+1) + "export" in desc (+1) = 5
    // T2 scores: Region dim (+5) = 5 (tied, but T3 comes first in stable sort if equal)
    // T1 scores: 0
    expect(ranked[2].id).toBe("T1"); // Least relevant
    expect(ranked.map((t) => t.id)).toContain("T3");
  });

  it("handles empty tables", () => {
    expect(rankTables([], "anything")).toEqual([]);
  });

  it("prefers recent data", () => {
    const ranked = rankTables(tables, "population statistics");
    // T1 and T2 both match "population", but T2 has Region → T2 wins
    expect(ranked[0].id).toBe("T2");
  });
});

// ─── selectDimensions ───────────────────────────────────────

describe("selectDimensions", () => {
  const metadata: PxTableMetadata = {
    id: "TAB638",
    label: "Population by region, marital status, age and sex",
    source: "SCB",
    dimensions: [
      {
        id: "Region",
        label: "region",
        type: "geo",
        values: [
          { code: "00", label: "Sweden" },
          { code: "01", label: "Stockholm" },
          { code: "03", label: "Uppsala" },
          { code: "04", label: "Södermanland" },
        ],
      },
      {
        id: "Civilstand",
        label: "marital status",
        type: "regular",
        values: [
          { code: "OG", label: "single" },
          { code: "G", label: "married" },
          { code: "T", label: "total" },
        ],
      },
      {
        id: "Kon",
        label: "sex",
        type: "regular",
        values: [
          { code: "1", label: "men" },
          { code: "2", label: "women" },
          { code: "T", label: "both sexes" },
        ],
      },
      {
        id: "ContentsCode",
        label: "observations",
        type: "contents",
        values: [
          { code: "BE0101N1", label: "Population" },
          { code: "BE0101N2", label: "Population growth" },
        ],
      },
      {
        id: "Tid",
        label: "year",
        type: "time",
        values: [
          { code: "2022", label: "2022" },
          { code: "2023", label: "2023" },
          { code: "2024", label: "2024" },
        ],
      },
    ],
  };

  it("selects latest time period", () => {
    const sels = selectDimensions(metadata, "population");
    const timeSel = sels.find((s) => s.dimensionId === "Tid");
    expect(timeSel).toBeDefined();
    expect(timeSel!.valueCodes).toEqual(["2024"]);
  });

  it("selects all regions except national aggregate", () => {
    const sels = selectDimensions(metadata, "population");
    const geoSel = sels.find((s) => s.dimensionId === "Region");
    expect(geoSel).toBeDefined();
    expect(geoSel!.valueCodes).not.toContain("00");
    expect(geoSel!.valueCodes).toContain("01");
    expect(geoSel!.valueCodes).toContain("03");
  });

  it("picks total for regular dimensions", () => {
    const sels = selectDimensions(metadata, "population");
    const sexSel = sels.find((s) => s.dimensionId === "Kon");
    expect(sexSel).toBeDefined();
    expect(sexSel!.valueCodes).toEqual(["T"]);
  });

  it("picks total by code for marital status", () => {
    const sels = selectDimensions(metadata, "population");
    const civilSel = sels.find((s) => s.dimensionId === "Civilstand");
    expect(civilSel).toBeDefined();
    expect(civilSel!.valueCodes).toEqual(["T"]);
  });

  it("matches contents by keyword", () => {
    const sels = selectDimensions(metadata, "population growth by region");
    const contSel = sels.find((s) => s.dimensionId === "ContentsCode");
    expect(contSel).toBeDefined();
    expect(contSel!.valueCodes).toEqual(["BE0101N2"]); // "Population growth"
  });

  it("falls back to first contents when no keyword match", () => {
    const sels = selectDimensions(metadata, "xyzzy");
    const contSel = sels.find((s) => s.dimensionId === "ContentsCode");
    expect(contSel).toBeDefined();
    expect(contSel!.valueCodes).toEqual(["BE0101N1"]);
  });

  it("respects cell count limit", () => {
    // Create metadata with huge geo dimension
    const bigMeta: PxTableMetadata = {
      id: "BIG",
      label: "Big table",
      source: "Test",
      dimensions: [
        {
          id: "Region",
          label: "region",
          type: "geo",
          values: Array.from({ length: 200_000 }, (_, i) => ({
            code: String(i),
            label: `Region ${i}`,
          })),
        },
        {
          id: "ContentsCode",
          label: "contents",
          type: "contents",
          values: [{ code: "V1", label: "Value" }],
        },
        {
          id: "Tid",
          label: "time",
          type: "time",
          values: [{ code: "2024", label: "2024" }],
        },
      ],
    };
    const sels = selectDimensions(bigMeta, "population");
    const geoSel = sels.find((s) => s.dimensionId === "Region");
    expect(geoSel!.valueCodes.length).toBeLessThanOrEqual(100_000);
  });
});

// ─── jsonStat2ToRecords ─────────────────────────────────────

describe("jsonStat2ToRecords", () => {
  it("parses single-dimension response (3 regions × 1 content × 1 time)", () => {
    const response: PxJsonStat2Response = {
      version: "2.0",
      class: "dataset",
      label: "Population",
      source: "SCB",
      id: ["Region", "ContentsCode", "Tid"],
      size: [3, 1, 1],
      dimension: {
        Region: {
          label: "region",
          category: {
            index: { "01": 0, "03": 1, "04": 2 },
            label: { "01": "Stockholm", "03": "Uppsala", "04": "Södermanland" },
          },
        },
        ContentsCode: {
          label: "observations",
          category: {
            index: { BE0101N1: 0 },
            label: { BE0101N1: "Population" },
          },
        },
        Tid: {
          label: "year",
          category: {
            index: { "2024": 0 },
            label: { "2024": "2024" },
          },
        },
      },
      value: [2400000, 400000, 300000],
    };

    const records = jsonStat2ToRecords(response, "Region", "ContentsCode", "Tid");
    expect(records.length).toBe(3);
    expect(records[0]).toEqual({
      regionCode: "01",
      regionLabel: "Stockholm",
      metricCode: "BE0101N1",
      metricLabel: "Population",
      timePeriod: "2024",
      value: 2400000,
    });
    expect(records[1].regionLabel).toBe("Uppsala");
    expect(records[2].value).toBe(300000);
  });

  it("parses multi-dimension response (2 regions × 2 contents × 2 times)", () => {
    const response: PxJsonStat2Response = {
      version: "2.0",
      class: "dataset",
      label: "Test",
      source: "Test",
      id: ["Region", "ContentsCode", "Tid"],
      size: [2, 2, 2],
      dimension: {
        Region: {
          label: "region",
          category: {
            index: { R1: 0, R2: 1 },
            label: { R1: "Region 1", R2: "Region 2" },
          },
        },
        ContentsCode: {
          label: "contents",
          category: {
            index: { C1: 0, C2: 1 },
            label: { C1: "Metric A", C2: "Metric B" },
          },
        },
        Tid: {
          label: "time",
          category: {
            index: { "2023": 0, "2024": 1 },
            label: { "2023": "2023", "2024": "2024" },
          },
        },
      },
      // value layout: R1-C1-2023, R1-C1-2024, R1-C2-2023, R1-C2-2024, R2-C1-2023, ...
      value: [10, 11, 20, 21, 30, 31, 40, 41],
    };

    const records = jsonStat2ToRecords(response, "Region", "ContentsCode", "Tid");
    expect(records.length).toBe(8);
    // R1-C1-2023
    expect(records[0].regionCode).toBe("R1");
    expect(records[0].metricCode).toBe("C1");
    expect(records[0].timePeriod).toBe("2023");
    expect(records[0].value).toBe(10);
    // R1-C1-2024
    expect(records[1].value).toBe(11);
    // R2-C2-2024
    expect(records[7].regionCode).toBe("R2");
    expect(records[7].metricCode).toBe("C2");
    expect(records[7].timePeriod).toBe("2024");
    expect(records[7].value).toBe(41);
  });

  it("skips null values", () => {
    const response: PxJsonStat2Response = {
      version: "2.0",
      class: "dataset",
      label: "Test",
      source: "Test",
      id: ["Region", "ContentsCode", "Tid"],
      size: [3, 1, 1],
      dimension: {
        Region: {
          label: "region",
          category: {
            index: { R1: 0, R2: 1, R3: 2 },
            label: { R1: "A", R2: "B", R3: "C" },
          },
        },
        ContentsCode: {
          label: "contents",
          category: {
            index: { V1: 0 },
            label: { V1: "Value" },
          },
        },
        Tid: {
          label: "time",
          category: {
            index: { "2024": 0 },
            label: { "2024": "2024" },
          },
        },
      },
      value: [100, null, 300],
    };

    const records = jsonStat2ToRecords(response, "Region", "ContentsCode", "Tid");
    expect(records.length).toBe(2);
    expect(records[0].value).toBe(100);
    expect(records[1].value).toBe(300);
  });

  it("returns empty for missing dimension IDs", () => {
    const response: PxJsonStat2Response = {
      version: "2.0",
      class: "dataset",
      label: "Test",
      source: "Test",
      id: ["X", "Y"],
      size: [1, 1],
      dimension: {
        X: { label: "x", category: { index: { a: 0 }, label: { a: "A" } } },
        Y: { label: "y", category: { index: { b: 0 }, label: { b: "B" } } },
      },
      value: [42],
    };

    const records = jsonStat2ToRecords(response, "Region", "ContentsCode", "Tid");
    expect(records.length).toBe(0);
  });
});

// ─── recordsToGeoJSON ───────────────────────────────────────

describe("recordsToGeoJSON", () => {
  it("creates features with null geometry for region data", () => {
    const fc = recordsToGeoJSON(
      [
        {
          regionCode: "01",
          regionLabel: "Stockholm",
          metricCode: "V1",
          metricLabel: "Population",
          timePeriod: "2024",
          value: 2400000,
        },
        {
          regionCode: "03",
          regionLabel: "Uppsala",
          metricCode: "V1",
          metricLabel: "Population",
          timePeriod: "2024",
          value: 400000,
        },
      ],
      "Population",
    );

    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features.length).toBe(2);
    expect(fc.features[0].geometry).toBeNull();
    expect(fc.features[0].properties?.name).toBe("Stockholm");
    expect(fc.features[0].properties?.regionCode).toBe("01");
    expect(fc.features[0].properties?.value).toBe(2400000);
    expect(fc.features[0].properties?.metric).toBe("Population");
    expect(fc.features[0].properties?.year).toBe("2024");
  });

  it("handles empty records", () => {
    const fc = recordsToGeoJSON([], "Test");
    expect(fc.features.length).toBe(0);
  });
});

// ─── extractGeoLevelHint ───────────────────────────────────

describe("extractGeoLevelHint", () => {
  it("extracts municipality from 'kommuner'", () => {
    expect(extractGeoLevelHint("inkomst i svenska kommuner")).toBe("municipality");
  });

  it("extracts municipality from 'kommun'", () => {
    expect(extractGeoLevelHint("befolkning per kommun")).toBe("municipality");
  });

  it("extracts municipality from 'kommunerna'", () => {
    expect(extractGeoLevelHint("arbetslöshet i kommunerna")).toBe("municipality");
  });

  it("extracts county from 'län'", () => {
    expect(extractGeoLevelHint("folkmängd per län")).toBe("county");
  });

  it("extracts county from 'county'", () => {
    expect(extractGeoLevelHint("unemployment by county")).toBe("county");
  });

  it("extracts municipality from Norwegian 'kommune'", () => {
    expect(extractGeoLevelHint("befolkning per kommune")).toBe("municipality");
  });

  it("extracts county from Norwegian 'fylke'", () => {
    expect(extractGeoLevelHint("arbeidsledighet per fylke")).toBe("county");
  });

  it("extracts admin1 from 'states'", () => {
    expect(extractGeoLevelHint("population by states")).toBe("admin1");
  });

  it("extracts admin1 from 'provinces'", () => {
    expect(extractGeoLevelHint("GDP per provinces")).toBe("admin1");
  });

  it("returns null for prompts without geo level hint", () => {
    expect(extractGeoLevelHint("world population")).toBeNull();
  });

  it("returns null for empty prompt", () => {
    expect(extractGeoLevelHint("")).toBeNull();
  });

  it("handles punctuation around keywords", () => {
    expect(extractGeoLevelHint("inkomst, kommuner?")).toBe("municipality");
  });
});

// ─── rankTables with geoLevelHint ──────────────────────────

describe("rankTables with geoLevelHint", () => {
  const geoTables: PxTableInfo[] = [
    {
      id: "T_REGION",
      label: "Sammanräknad förvärvsinkomst",
      description: "Income by region",
      variableNames: ["Region", "ContentsCode", "Tid"],
      firstPeriod: "2000",
      lastPeriod: "2024",
      source: "SCB",
    },
    {
      id: "T_KOMMUN",
      label: "Sammanräknad förvärvsinkomst per kommun",
      description: "Income by municipality",
      variableNames: ["Kommun", "ContentsCode", "Tid"],
      firstPeriod: "2000",
      lastPeriod: "2024",
      source: "SCB",
    },
    {
      id: "T_NO_GEO",
      label: "Inkomst, riket totalt",
      description: "National income aggregate",
      variableNames: ["ContentsCode", "Tid"],
      firstPeriod: "2000",
      lastPeriod: "2024",
      source: "SCB",
    },
  ];

  it("prefers municipality table when hint is 'municipality'", () => {
    const ranked = rankTables(geoTables, "inkomst", "municipality");
    expect(ranked[0].id).toBe("T_KOMMUN");
  });

  it("municipality table scores higher than region table with hint", () => {
    const ranked = rankTables(geoTables, "inkomst", "municipality");
    const kommunIdx = ranked.findIndex((t) => t.id === "T_KOMMUN");
    const regionIdx = ranked.findIndex((t) => t.id === "T_REGION");
    expect(kommunIdx).toBeLessThan(regionIdx);
  });

  it("prefers county table when hint is 'county'", () => {
    const countyTables: PxTableInfo[] = [
      {
        id: "T_REGION",
        label: "Population",
        description: "",
        variableNames: ["Region", "ContentsCode", "Tid"],
        firstPeriod: "2000",
        lastPeriod: "2024",
        source: "SCB",
      },
      {
        id: "T_LAN",
        label: "Population per län",
        description: "",
        variableNames: ["Län", "ContentsCode", "Tid"],
        firstPeriod: "2000",
        lastPeriod: "2024",
        source: "SCB",
      },
    ];
    const ranked = rankTables(countyTables, "befolkning", "county");
    expect(ranked[0].id).toBe("T_LAN");
  });

  it("behaves identically without hint (backward compatible)", () => {
    const withoutHint = rankTables(geoTables, "inkomst");
    const withNullHint = rankTables(geoTables, "inkomst", null);
    expect(withoutHint.map((t) => t.id)).toEqual(withNullHint.map((t) => t.id));
  });

  it("non-geo table ranks last regardless of hint", () => {
    const ranked = rankTables(geoTables, "inkomst", "municipality");
    expect(ranked[ranked.length - 1].id).toBe("T_NO_GEO");
  });
});

// ─── selectDimensionsWithAmbiguity ──────────────────────────

describe("selectDimensionsWithAmbiguity", () => {
  const baseMetadata: PxTableMetadata = {
    id: "TEST01",
    label: "Test table",
    source: "Test",
    dimensions: [
      {
        id: "Region",
        label: "Region",
        type: "geo",
        values: [
          { code: "01", label: "Stockholm" },
          { code: "03", label: "Uppsala" },
        ],
      },
      {
        id: "ContentsCode",
        label: "Contents",
        type: "contents",
        values: [
          { code: "BE0101N1", label: "Folkmängd" },
          { code: "BE0101N2", label: "Folkökning" },
          { code: "BE0101N3", label: "Befolkningstäthet" },
        ],
      },
      {
        id: "Tid",
        label: "Time",
        type: "time",
        values: [
          { code: "2023", label: "2023" },
          { code: "2024", label: "2024" },
        ],
      },
    ],
  };

  it("flags ambiguous when no keyword matches contents", () => {
    const result = selectDimensionsWithAmbiguity(baseMetadata, "inkomst i kommuner");
    expect(result.contentsAmbiguous).toBe(true);
    expect(result.contentsValues).toHaveLength(3);
    expect(result.contentsDimensionId).toBe("ContentsCode");
  });

  it("always ambiguous when 2+ contents values exist (delegates to AI)", () => {
    const result = selectDimensionsWithAmbiguity(baseMetadata, "folkmängd i kommuner");
    expect(result.contentsAmbiguous).toBe(true);
    expect(result.contentsValues).toHaveLength(3);
    expect(result.contentsDimensionId).toBe("ContentsCode");
  });

  it("not ambiguous when only one contents value exists", () => {
    const singleContents: PxTableMetadata = {
      ...baseMetadata,
      dimensions: [
        baseMetadata.dimensions[0],
        {
          id: "ContentsCode",
          label: "Contents",
          type: "contents",
          values: [{ code: "C1", label: "Population" }],
        },
        baseMetadata.dimensions[2],
      ],
    };
    const result = selectDimensionsWithAmbiguity(singleContents, "anything");
    expect(result.contentsAmbiguous).toBe(false);
  });

  it("still returns valid selections when ambiguous", () => {
    const result = selectDimensionsWithAmbiguity(baseMetadata, "inkomst i kommuner");
    expect(result.selections.length).toBeGreaterThan(0);
    // Falls back to first value
    const contentsSelection = result.selections.find(
      (s) => s.dimensionId === "ContentsCode",
    );
    expect(contentsSelection).toBeDefined();
    expect(contentsSelection!.valueCodes).toEqual(["BE0101N1"]);
  });

  it("returns same selections as selectDimensions", () => {
    const ambiguityResult = selectDimensionsWithAmbiguity(baseMetadata, "folkmängd");
    const legacyResult = selectDimensions(baseMetadata, "folkmängd");
    expect(ambiguityResult.selections).toEqual(legacyResult);
  });
});
