/**
 * Tests for kolada-client: Swedish municipality KPI search.
 *
 * Verifies:
 *  - prompt detection for Swedish/municipality signals
 *  - KPI keyword dedup (every alias resolves to its KPI — incl. U01803 "fattigdom")
 *  - AI fallback accepts both N-prefix and U-prefix IDs
 *  - coverage threshold (≥75 % of municipalities)
 *  - cache short-circuit skips fetch
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Hoisted mocks ──────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  generateText: vi.fn(),
  profileDataset: vi.fn(() => ({
    geometryType: "Polygon",
    featureCount: 290,
    attributes: [{ name: "scb_code" }, { name: "unemployment_rate" }],
    numericAttributes: [],
  })),
  getCachedData: vi.fn(),
  setCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:fs/promises", () => ({
  readFile: mocks.readFile,
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
}));

vi.mock("../../ai-client", () => ({
  MODELS: { utility: () => ({ modelId: "mock-utility" }) },
}));

vi.mock("../../profiler", () => ({
  profileDataset: mocks.profileDataset,
}));

vi.mock("../data-search", () => ({
  getCachedData: mocks.getCachedData,
  setCache: mocks.setCache,
}));

import {
  isSwedishMunicipalPrompt,
  searchKolada,
} from "../kolada-client";

// ─── Helpers ────────────────────────────────────────────────

/** Build a geometry FeatureCollection with N municipalities (scb_code "0001"…"NNNN"). */
function buildGeometry(count: number): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: Array.from({ length: count }, (_, i) => ({
      type: "Feature" as const,
      geometry: {
        type: "Polygon" as const,
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
      },
      properties: {
        scb_code: String(i + 1).padStart(4, "0"),
        name: `Kommun ${i + 1}`,
      },
    })),
  };
}

/** Build a Kolada API response with N observations. */
function buildKoladaResponse(count: number) {
  return {
    count,
    values: Array.from({ length: count }, (_, i) => ({
      kpi: "NXX",
      municipality: String(i + 1).padStart(4, "0"),
      period: 2025,
      values: [
        { gender: "T", status: "", value: 10 + i, count: 1 },
      ],
    })),
  };
}

function mockApiFetch(
  response:
    | { ok: true; json: () => Promise<unknown> }
    | { ok: false; status?: number },
) {
  return vi.fn().mockResolvedValue(response);
}

// ─── Tests ──────────────────────────────────────────────────

describe("isSwedishMunicipalPrompt", () => {
  it("true for prompts mentioning Sweden AND kommuner", () => {
    expect(isSwedishMunicipalPrompt("arbetslöshet i svenska kommuner")).toBe(
      true,
    );
  });

  it("true for Swedish-only signal", () => {
    expect(isSwedishMunicipalPrompt("sverige karta")).toBe(true);
  });

  it("true for kommun-only signal (OR logic)", () => {
    expect(isSwedishMunicipalPrompt("visa kommuner")).toBe(true);
  });

  it("true for English swedish municipalities phrase", () => {
    expect(
      isSwedishMunicipalPrompt("unemployment swedish municipalities"),
    ).toBe(true);
  });

  it("false for unrelated prompts", () => {
    expect(isSwedishMunicipalPrompt("population of Tokyo")).toBe(false);
    expect(isSwedishMunicipalPrompt("gdp by country")).toBe(false);
  });
});

describe("searchKolada", () => {
  beforeEach(() => {
    mocks.readFile.mockReset();
    mocks.generateText.mockReset();
    mocks.getCachedData.mockReset();
    mocks.setCache.mockClear();
    mocks.setCache.mockResolvedValue(undefined);
    mocks.profileDataset.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns found:false for non-Swedish prompts without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await searchKolada("population of Tokyo");
    expect(result.found).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("happy path: fetch + join + coverage → found:true", async () => {
    mocks.getCachedData.mockResolvedValue(null);
    mocks.readFile.mockResolvedValue(JSON.stringify(buildGeometry(290)));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => buildKoladaResponse(290),
      }),
    );
    const result = await searchKolada(
      "arbetslöshet i svenska kommuner",
    );
    expect(result.found).toBe(true);
    expect(result.source).toBe("Kolada");
    expect(result.featureCount).toBe(290);
    expect(result.geometryType).toBe("Polygon");
    expect(mocks.setCache).toHaveBeenCalledTimes(1);
  });

  it("keyword 'arbetslöshet' maps to N02280", async () => {
    mocks.getCachedData.mockResolvedValue(null);
    mocks.readFile.mockResolvedValue(JSON.stringify(buildGeometry(290)));
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => buildKoladaResponse(290),
    });
    vi.stubGlobal("fetch", fetchSpy);
    await searchKolada("arbetslöshet i svenska kommuner");
    const urls = fetchSpy.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes("/kpi/N02280/"))).toBe(true);
  });

  it("keyword 'fattigdom' resolves to U01803 (U-prefix bug guard)", async () => {
    mocks.getCachedData.mockResolvedValue(null);
    mocks.readFile.mockResolvedValue(JSON.stringify(buildGeometry(290)));
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => buildKoladaResponse(290),
    });
    vi.stubGlobal("fetch", fetchSpy);
    await searchKolada("fattigdom i svenska kommuner");
    const urls = fetchSpy.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes("/kpi/U01803/"))).toBe(true);
    // And generateText should NOT have been called (keyword match succeeded first).
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("AI fallback returning U-prefix ID is accepted", async () => {
    mocks.getCachedData.mockResolvedValue(null);
    mocks.readFile.mockResolvedValue(JSON.stringify(buildGeometry(290)));
    // Prompt has only signal words + a non-alias term → triggers AI fallback.
    mocks.generateText.mockResolvedValue({ text: "U01803" });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => buildKoladaResponse(290),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const result = await searchKolada(
      "kriminalitet svenska kommuner",
    );
    expect(result.found).toBe(true);
    expect(mocks.generateText).toHaveBeenCalled();
    const urls = fetchSpy.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes("/kpi/U01803/"))).toBe(true);
  });

  it("AI fallback returning NONE → found:false", async () => {
    mocks.getCachedData.mockResolvedValue(null);
    mocks.generateText.mockResolvedValue({ text: "NONE" });
    vi.stubGlobal("fetch", vi.fn());
    const result = await searchKolada(
      "obskyr fråga om svenska kommuner",
    );
    expect(result.found).toBe(false);
    expect(result.error).toMatch(/No matching Kolada KPI/);
  });

  it("AI fallback returning unknown ID → found:false (not crash)", async () => {
    mocks.getCachedData.mockResolvedValue(null);
    mocks.generateText.mockResolvedValue({ text: "X99999" });
    vi.stubGlobal("fetch", vi.fn());
    const result = await searchKolada(
      "obskyr fråga om svenska kommuner",
    );
    expect(result.found).toBe(false);
  });

  it("low coverage (<75 %) is rejected", async () => {
    mocks.getCachedData.mockResolvedValue(null);
    mocks.readFile.mockResolvedValue(JSON.stringify(buildGeometry(290)));
    // Only 100 observations joined → 100/290 = 34 % < 75 %.
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => buildKoladaResponse(100),
    });
    // The client retries with thisYear-2 if first year returns <100 — we
    // return 100 both times, so the retry still fails the coverage check.
    vi.stubGlobal("fetch", fetchSpy);
    const result = await searchKolada(
      "arbetslöshet i svenska kommuner",
    );
    expect(result.found).toBe(false);
    expect(result.error).toMatch(/Low coverage/);
  });

  it("cache-hit short-circuits: no fetch, no geometry read", async () => {
    const cachedProfile = {
      geometryType: "Polygon",
      featureCount: 290,
      attributes: [{ name: "unemployment_rate" }],
      numericAttributes: [],
    };
    mocks.getCachedData.mockResolvedValue({
      data: { type: "FeatureCollection", features: [] },
      profile: cachedProfile,
      source: "Kolada",
      description: "cached",
      timestamp: Date.now(),
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await searchKolada(
      "arbetslöshet i svenska kommuner",
    );
    expect(result.found).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("returns error when Kolada API returns empty data", async () => {
    mocks.getCachedData.mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ count: 0, values: [] }),
      }),
    );
    const result = await searchKolada(
      "arbetslöshet i svenska kommuner",
    );
    expect(result.found).toBe(false);
    expect(result.error).toMatch(/No Kolada data/);
  });

  it("returns error when geometry file cannot be read", async () => {
    // The kolada-client module caches geometry at module scope; previous
    // happy-path tests will have populated it. Reset modules so the
    // cache starts empty and readFile is consulted again.
    vi.resetModules();
    mocks.getCachedData.mockResolvedValue(null);
    mocks.readFile.mockRejectedValue(new Error("ENOENT"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => buildKoladaResponse(290),
      }),
    );
    const fresh = await import("../kolada-client");
    const result = await fresh.searchKolada(
      "arbetslöshet i svenska kommuner",
    );
    expect(result.found).toBe(false);
    expect(result.error).toMatch(/Geometry not found/);
  });

  it("skips observations missing gender=T or status=M", async () => {
    mocks.getCachedData.mockResolvedValue(null);
    mocks.readFile.mockResolvedValue(JSON.stringify(buildGeometry(290)));
    // Build a response where every observation is marked missing.
    const badResponse = {
      count: 290,
      values: Array.from({ length: 290 }, (_, i) => ({
        kpi: "N02280",
        municipality: String(i + 1).padStart(4, "0"),
        period: 2025,
        values: [
          { gender: "T", status: "M", value: 0, count: 0 }, // missing
          { gender: "F", status: "", value: 5, count: 1 }, // wrong gender
        ],
      })),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => badResponse,
      }),
    );
    const result = await searchKolada(
      "arbetslöshet i svenska kommuner",
    );
    expect(result.found).toBe(false);
    expect(result.error).toMatch(/Low coverage/);
  });

  it("every curated alias resolves to a KPI (no silent drops)", async () => {
    // Enumerate every alias listed in kolada-client.ts and verify that each
    // one — when used as the only meaningful word in a Swedish municipality
    // prompt — resolves via the keyword path (no AI call needed).
    const aliasKpiPairs: Array<[string, string]> = [
      ["befolkning", "N01951"],
      ["invånare", "N01951"],
      ["population", "N01951"],
      ["folkmängd", "N01951"],
      ["arbetslöshet", "N02280"],
      ["unemployment", "N02280"],
      ["arbetslösa", "N03920"],
      ["ungdomsarbetslöshet", "N03935"],
      ["inkomst", "N00906"],
      ["medianinkomst", "N00906"],
      ["medelinkomst", "N00906"],
      ["income", "N00906"],
      ["nettoinkomst", "N00905"],
      ["gini", "N00956"],
      ["utbildning", "N00218"],
      ["utbildningsnivå", "N00218"],
      ["education", "N00218"],
      ["äldre", "N01938"],
      ["barn", "N01919"],
      ["befolkningsförändring", "N01963"],
      ["bistånd", "N31825"],
      ["fattigdom", "U01803"],
    ];

    for (const [alias, expectedKpi] of aliasKpiPairs) {
      mocks.getCachedData.mockReset();
      mocks.getCachedData.mockResolvedValue(null);
      mocks.readFile.mockResolvedValue(JSON.stringify(buildGeometry(290)));
      mocks.generateText.mockReset();
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => buildKoladaResponse(290),
      });
      vi.stubGlobal("fetch", fetchSpy);

      await searchKolada(`${alias} svenska kommuner`);
      const urls = fetchSpy.mock.calls.map((c) => c[0] as string);
      expect(
        urls.some((u) => u.includes(`/kpi/${expectedKpi}/`)),
        `alias "${alias}" should resolve to ${expectedKpi}`,
      ).toBe(true);
      expect(
        mocks.generateText,
        `alias "${alias}" should match via keyword, not AI`,
      ).not.toHaveBeenCalled();
    }
  });
});
