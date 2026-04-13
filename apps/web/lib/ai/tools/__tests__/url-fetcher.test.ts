/**
 * Tests for url-fetcher: SSRF validation + fetchAndParse format detection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks (must be declared before importing the SUT) ─────

const mocks = vi.hoisted(() => ({
  setCache: vi.fn().mockResolvedValue(undefined),
  csvToGeoFeatures: vi.fn(),
  profileDataset: vi.fn(() => ({
    geometryType: "Point",
    featureCount: 0,
    attributes: [],
    numericAttributes: [],
  })),
}));

vi.mock("../../profiler", () => ({
  profileDataset: mocks.profileDataset,
}));

vi.mock("../data-search", () => ({
  setCache: mocks.setCache,
}));

vi.mock("../../csv-geo-resolver", () => ({
  csvToGeoFeatures: mocks.csvToGeoFeatures,
}));

const mockSetCache = mocks.setCache;
const mockCsvToGeoFeatures = mocks.csvToGeoFeatures;
const mockProfileDataset = mocks.profileDataset;

import { validateFetchUrl, fetchAndParse } from "../url-fetcher";

// ─── Helpers ────────────────────────────────────────────────

function mockFetchResponse(opts: {
  ok?: boolean;
  status?: number;
  contentType?: string;
  body: string;
}) {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? opts.contentType ?? "" : null,
    },
    text: async () => opts.body,
  };
}

const GEOJSON_SAMPLE: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [10, 20] },
      properties: { name: "A" },
    },
  ],
};

// ─── validateFetchUrl ───────────────────────────────────────

describe("validateFetchUrl", () => {
  it("returns URL object for valid https URL", () => {
    const url = validateFetchUrl("https://example.com/data.geojson");
    expect(url.hostname).toBe("example.com");
    expect(url.protocol).toBe("https:");
  });

  it("accepts plain http", () => {
    expect(() => validateFetchUrl("http://example.com")).not.toThrow();
  });

  it("throws on malformed URL", () => {
    expect(() => validateFetchUrl("not a url")).toThrow(/Invalid URL/);
  });

  it("rejects file:// scheme", () => {
    expect(() => validateFetchUrl("file:///etc/passwd")).toThrow(
      /http and https/,
    );
  });

  it("rejects ftp:// scheme", () => {
    expect(() => validateFetchUrl("ftp://example.com/file")).toThrow(
      /http and https/,
    );
  });

  it("rejects localhost", () => {
    expect(() => validateFetchUrl("http://localhost/x")).toThrow(
      /Loopback/,
    );
  });

  it("rejects 127.0.0.1", () => {
    expect(() => validateFetchUrl("http://127.0.0.1/x")).toThrow(/Loopback/);
  });

  it("rejects any 127.x.y.z", () => {
    expect(() => validateFetchUrl("http://127.55.12.9/x")).toThrow(/Loopback/);
  });

  it("rejects IPv6 loopback [::1]", () => {
    expect(() => validateFetchUrl("http://[::1]/x")).toThrow(/Loopback/);
  });

  it("rejects 10.0.0.0/8 private range", () => {
    expect(() => validateFetchUrl("http://10.2.3.4/x")).toThrow(/Private/);
  });

  it("rejects 172.16.0.0/12 private range", () => {
    expect(() => validateFetchUrl("http://172.20.1.1/x")).toThrow(/Private/);
    expect(() => validateFetchUrl("http://172.16.0.1/x")).toThrow(/Private/);
    expect(() => validateFetchUrl("http://172.31.255.255/x")).toThrow(
      /Private/,
    );
  });

  it("does NOT reject 172.15.x.x or 172.32.x.x (outside range)", () => {
    expect(() => validateFetchUrl("http://172.15.0.1/x")).not.toThrow();
    expect(() => validateFetchUrl("http://172.32.0.1/x")).not.toThrow();
  });

  it("rejects 192.168.0.0/16 private range", () => {
    expect(() => validateFetchUrl("http://192.168.1.1/x")).toThrow(/Private/);
  });

  it("rejects 169.254.0.0/16 link-local (AWS metadata)", () => {
    expect(() => validateFetchUrl("http://169.254.169.254/latest")).toThrow(
      /Private|link-local/,
    );
  });

  it("accepts normal public IP", () => {
    expect(() => validateFetchUrl("http://8.8.8.8/x")).not.toThrow();
  });

  it("lowercases hostname before comparing", () => {
    expect(() => validateFetchUrl("http://LOCALHOST/x")).toThrow(/Loopback/);
  });

  it("rejects IPv6 unique-local fd00::/8", () => {
    expect(() => validateFetchUrl("http://[fd12:3456::1]/x")).toThrow(/Private/);
  });

  it("rejects IPv6 link-local fe80::/10", () => {
    expect(() => validateFetchUrl("http://[fe80::1]/x")).toThrow(/Private/);
  });

  it("rejects IPv6 fc00::/7 prefix", () => {
    expect(() => validateFetchUrl("http://[fc00::1]/x")).toThrow(/Private/);
  });

  it("rejects IPv4-mapped IPv6 that embeds private IPv4", () => {
    expect(() => validateFetchUrl("http://[::ffff:10.0.0.1]/x")).toThrow(/Private/);
  });
});

// ─── fetchAndParse ──────────────────────────────────────────

describe("fetchAndParse", () => {
  beforeEach(() => {
    mockSetCache.mockClear();
    mockSetCache.mockResolvedValue(undefined);
    mockCsvToGeoFeatures.mockReset();
    mockProfileDataset.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("propagates SSRF rejection (does not call fetch)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(fetchAndParse("http://127.0.0.1/x")).rejects.toThrow(
      /Loopback/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("parses GeoJSON FeatureCollection from application/json response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockFetchResponse({
          contentType: "application/json",
          body: JSON.stringify(GEOJSON_SAMPLE),
        }),
      ),
    );
    const result = await fetchAndParse("https://example.com/data.geojson");
    expect(result).not.toBeNull();
    expect(result!.fc.features).toHaveLength(1);
    expect(result!.description).toMatch(/GeoJSON/);
    expect(mockProfileDataset).toHaveBeenCalled();
  });

  it("returns null on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockFetchResponse({
          ok: false,
          status: 500,
          contentType: "application/json",
          body: "",
        }),
      ),
    );
    const result = await fetchAndParse("https://example.com/bad.geojson");
    expect(result).toBeNull();
  });

  it("truncates GeoJSON to MAX_GEOJSON_FEATURES", async () => {
    const features = Array.from({ length: 60_000 }, (_, i) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [i, i] },
      properties: {},
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockFetchResponse({
          contentType: "application/json",
          body: JSON.stringify({ type: "FeatureCollection", features }),
        }),
      ),
    );
    const result = await fetchAndParse("https://example.com/huge.geojson");
    expect(result).not.toBeNull();
    expect(result!.fc.features.length).toBe(50_000);
  });

  it("returns null for non-FeatureCollection JSON with no CSV fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockFetchResponse({
          contentType: "application/json",
          body: JSON.stringify({ some: "object" }),
        }),
      ),
    );
    const result = await fetchAndParse("https://example.com/odd.json");
    expect(result).toBeNull();
  });

  it("falls through to CSV when JSON parse fails and content-type allows", async () => {
    const csv =
      "lat,lng,name\n10,20,A\n11,21,B\n";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockFetchResponse({
          contentType: "text/plain",
          body: csv,
        }),
      ),
    );
    const result = await fetchAndParse("https://example.com/pts.csv");
    expect(result).not.toBeNull();
    expect(result!.fc.features.length).toBe(2);
    expect(result!.description).toMatch(/Points/);
  });

  it("uses csvToGeoFeatures when CSV has country column", async () => {
    const csv = "country,value\nSweden,10\nNorway,20\n";
    const resolved: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
          properties: { country: "Sweden", value: 10 },
        },
      ],
    };
    mockCsvToGeoFeatures.mockResolvedValue({
      features: resolved,
      geoType: "countries",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockFetchResponse({
          contentType: "text/csv",
          body: csv,
        }),
      ),
    );
    const result = await fetchAndParse("https://example.com/by-country.csv");
    expect(result).not.toBeNull();
    expect(result!.description).toMatch(/countries/);
    expect(mockCsvToGeoFeatures).toHaveBeenCalled();
  });

  it("returns null when CSV has neither lat/lng nor country column", async () => {
    const csv = "foo,bar\n1,2\n3,4\n";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockFetchResponse({
          contentType: "text/csv",
          body: csv,
        }),
      ),
    );
    const result = await fetchAndParse("https://example.com/noise.csv");
    expect(result).toBeNull();
  });

  it("returns null when csvToGeoFeatures rejects", async () => {
    const csv = "country,value\nSweden,10\n";
    mockCsvToGeoFeatures.mockRejectedValue(new Error("pipeline down"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockFetchResponse({
          contentType: "text/csv",
          body: csv,
        }),
      ),
    );
    const result = await fetchAndParse("https://example.com/broken.csv");
    expect(result).toBeNull();
  });

  it("calls setCache when cacheKey is provided", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockFetchResponse({
          contentType: "application/json",
          body: JSON.stringify(GEOJSON_SAMPLE),
        }),
      ),
    );
    await fetchAndParse("https://example.com/x.geojson", {
      cacheKey: "test-key",
    });
    expect(mockSetCache).toHaveBeenCalledTimes(1);
    const [key, entry] = mockSetCache.mock.calls[0];
    expect(key).toBe("test-key");
    expect(entry.source).toBe("URL fetch");
  });

  it("does not call setCache when no cacheKey is provided", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockFetchResponse({
          contentType: "application/json",
          body: JSON.stringify(GEOJSON_SAMPLE),
        }),
      ),
    );
    await fetchAndParse("https://example.com/x.geojson");
    expect(mockSetCache).not.toHaveBeenCalled();
  });

  it("returns null for empty FeatureCollection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockFetchResponse({
          contentType: "application/json",
          body: JSON.stringify({ type: "FeatureCollection", features: [] }),
        }),
      ),
    );
    const result = await fetchAndParse("https://example.com/empty.geojson");
    expect(result).toBeNull();
  });

  it("detects .geojson extension even when content-type is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockFetchResponse({
          contentType: "",
          body: JSON.stringify(GEOJSON_SAMPLE),
        }),
      ),
    );
    const result = await fetchAndParse(
      "https://example.com/path/data.geojson",
    );
    expect(result).not.toBeNull();
  });
});
