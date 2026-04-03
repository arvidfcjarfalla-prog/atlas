import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { readFileMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: readFileMock,
}));

vi.mock("../../../lib/supabase/service", () => ({
  getServiceClient: vi.fn(() => null),
}));

vi.mock("../profiler", () => ({
  profileDataset: vi.fn((fc: GeoJSON.FeatureCollection) => ({
    geometryType: "Polygon",
    featureCount: fc.features.length,
    attributes: [{ name: "value", type: "number", nullCount: 0 }],
    bounds: [[0, 0], [1, 1]],
    crs: null,
  })),
}));

vi.mock("../ai-client", () => ({
  MODELS: {
    utility: vi.fn(() => "mock-model"),
  },
}));

import { searchWorldBank } from "../tools/data-search";
import { worldBankAdapter } from "../tools/worldbank-client";

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function getCodeFromUrl(url: string, marker: string): string | null {
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const rest = url.slice(idx + marker.length);
  const code = rest.split("?")[0] ?? "";
  if (!code) return null;
  return decodeURIComponent(code);
}

describe("World Bank path parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    readFileMock.mockResolvedValue(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
            },
            properties: { ISO_A3: "SWE" },
          },
        ],
      } satisfies GeoJSON.FeatureCollection),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

        const directIndicatorCode = getCodeFromUrl(url, "/v2/indicator/");
        if (directIndicatorCode && !url.includes("/country/all/")) {
          return makeResponse([
            {},
            [{ id: directIndicatorCode, name: `Indicator ${directIndicatorCode}`, sourceNote: "mock" }],
          ]);
        }

        const dataIndicatorCode = getCodeFromUrl(url, "/v2/country/all/indicator/");
        if (dataIndicatorCode) {
          return makeResponse([
            {},
            [{
              country: { id: "SE", value: "Sweden" },
              countryiso3code: "SWE",
              value: 123.45,
              date: "2024",
            }],
          ]);
        }

        return makeResponse({ message: "Not found in test mock" }, 404);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves CO2 per capita to the same indicator in both paths", async () => {
    const query = "co2 emissions per capita by country";
    const expectedCode = "EN.GHG.CO2.PC.CE.AR5";

    const tables = await worldBankAdapter.searchTables(
      "https://api.worldbank.org",
      query,
      "en",
    );
    expect(tables[0]?.id).toBe(expectedCode);

    const wb = await searchWorldBank(query);
    expect(wb.found).toBe(true);
    expect(wb.cacheKey).toBe(`worldbank-${expectedCode}`);
  });

  it("resolves total CO2 emissions to the same indicator in both paths", async () => {
    const query = "co2 emissions by country";
    const expectedCode = "EN.GHG.CO2.MT.CE.AR5";

    const tables = await worldBankAdapter.searchTables(
      "https://api.worldbank.org",
      query,
      "en",
    );
    expect(tables[0]?.id).toBe(expectedCode);

    const wb = await searchWorldBank(query);
    expect(wb.found).toBe(true);
    expect(wb.cacheKey).toBe(`worldbank-${expectedCode}`);
  });

  it("handles non-JSON World Bank responses without crashing", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementationOnce(async () =>
      new Response("<error>temporary</error>", {
        status: 200,
        headers: { "content-type": "application/xml" },
      }),
    );

    const result = await searchWorldBank("population by country");

    expect(result.found).toBe(false);
    expect(result.error).toContain("non-JSON");
  });
});
