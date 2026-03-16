/**
 * Tests for the geometry loading layer.
 *
 * Covers:
 *   - api_route loading (via fetch with resolved base URL)
 *   - cdn_url loading (via fetch)
 *   - local_file loading (via fs.readFile)
 *   - Invalid GeoJSON rejection
 *   - Caching behavior (hit, TTL expiry, clearGeometryCache)
 *   - Fetch failure → null (network error, non-200, timeout)
 *   - Generated type → null
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  loadGeometry,
  clearGeometryCache,
  geometryCacheSize,
  isValidFeatureCollection,
  type GeometryLoadResult,
} from "../tools/geometry-loader";
import type { GeometryEntry } from "../tools/geometry-registry";

// ═══════════════════════════════════════════════════════════════
// Mock fs/promises
// ═══════════════════════════════════════════════════════════════

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

import { readFile } from "node:fs/promises";
const mockReadFile = vi.mocked(readFile);

// ═══════════════════════════════════════════════════════════════
// Test fixtures
// ═══════════════════════════════════════════════════════════════

const validFC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { iso_a3: "SWE", name: "Sweden" },
      geometry: {
        type: "Polygon",
        coordinates: [[[15, 55], [25, 55], [25, 70], [15, 70], [15, 55]]],
      },
    },
    {
      type: "Feature",
      properties: { iso_a3: "NOR", name: "Norway" },
      geometry: {
        type: "Polygon",
        coordinates: [[[5, 58], [15, 58], [15, 72], [5, 72], [5, 58]]],
      },
    },
  ],
};

function makeEntry(overrides: Partial<GeometryEntry>): GeometryEntry {
  return {
    id: "test:entry",
    name: "Test Entry",
    level: "country",
    scope: { regionCode: "GLOBAL" },
    loaderType: "cdn_url",
    loaderTarget: "https://example.com/geo.geojson",
    joinKeys: [
      {
        geometryProperty: "iso_a3",
        codeFamily: { family: "iso", namespace: "alpha3" },
      },
    ],
    featureIdProperty: "iso_a3",
    resolution: "medium",
    status: "production",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Setup / teardown
// ═══════════════════════════════════════════════════════════════

const originalFetch = globalThis.fetch;

beforeEach(() => {
  clearGeometryCache();
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ═══════════════════════════════════════════════════════════════
// isValidFeatureCollection
// ═══════════════════════════════════════════════════════════════

describe("isValidFeatureCollection", () => {
  it("accepts a valid FeatureCollection", () => {
    expect(isValidFeatureCollection(validFC)).toBe(true);
  });

  it("rejects null", () => {
    expect(isValidFeatureCollection(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidFeatureCollection(undefined)).toBe(false);
  });

  it("rejects a string", () => {
    expect(isValidFeatureCollection("not geojson")).toBe(false);
  });

  it("rejects wrong type field", () => {
    expect(isValidFeatureCollection({ type: "Feature", features: [] })).toBe(false);
  });

  it("rejects missing features array", () => {
    expect(isValidFeatureCollection({ type: "FeatureCollection" })).toBe(false);
  });

  it("rejects empty features array", () => {
    expect(isValidFeatureCollection({ type: "FeatureCollection", features: [] })).toBe(false);
  });

  it("rejects features with invalid first element", () => {
    expect(
      isValidFeatureCollection({
        type: "FeatureCollection",
        features: [{ type: "NotFeature", geometry: {} }],
      }),
    ).toBe(false);
  });

  it("rejects features with null geometry in first element", () => {
    expect(
      isValidFeatureCollection({
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: null }],
      }),
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// cdn_url loading
// ═══════════════════════════════════════════════════════════════

describe("cdn_url loading", () => {
  it("fetches and returns valid GeoJSON", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validFC),
    });

    const entry = makeEntry({
      id: "cdn-test",
      loaderType: "cdn_url",
      loaderTarget: "https://example.com/countries.geojson",
    });

    const result = await loadGeometry(entry);

    expect(result.geometry).not.toBeNull();
    expect(result.error).toBeNull();
    expect(result.geometry!.type).toBe("FeatureCollection");
    expect(result.geometry!.features).toHaveLength(2);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://example.com/countries.geojson",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("returns not_found error on 404 response", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const entry = makeEntry({ id: "cdn-404" });
    const result = await loadGeometry(entry);

    expect(result.geometry).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error!.type).toBe("not_found");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("returns network error on connection failure", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const entry = makeEntry({ id: "cdn-error" });
    const result = await loadGeometry(entry);

    expect(result.geometry).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error!.type).toBe("network");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════
// api_route loading
// ═══════════════════════════════════════════════════════════════

describe("api_route loading", () => {
  it("resolves relative path and fetches", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validFC),
    });

    const entry = makeEntry({
      id: "api-test",
      loaderType: "api_route",
      loaderTarget: "/api/geo/world-countries",
    });

    const result = await loadGeometry(entry);

    expect(result.geometry).not.toBeNull();
    expect(result.geometry!.features).toHaveLength(2);
    // Should have resolved to full URL
    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calledUrl).toContain("/api/geo/world-countries");
    expect(calledUrl).toMatch(/^https?:\/\//);
  });

  it("uses ATLAS_BASE_URL env var when set", async () => {
    const original = process.env.ATLAS_BASE_URL;
    process.env.ATLAS_BASE_URL = "https://atlas.example.com";

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validFC),
    });

    const entry = makeEntry({
      id: "api-env",
      loaderType: "api_route",
      loaderTarget: "/api/geo/world-cities",
    });

    await loadGeometry(entry);

    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calledUrl).toBe("https://atlas.example.com/api/geo/world-cities");

    // Restore
    if (original === undefined) {
      delete process.env.ATLAS_BASE_URL;
    } else {
      process.env.ATLAS_BASE_URL = original;
    }
  });

  it("returns error on fetch failure", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("timeout"));

    const entry = makeEntry({
      id: "api-fail",
      loaderType: "api_route",
      loaderTarget: "/api/geo/world-countries",
    });

    const result = await loadGeometry(entry);

    expect(result.geometry).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error!.type).toBe("network");
    warnSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════
// local_file loading
// ═══════════════════════════════════════════════════════════════

describe("local_file loading", () => {
  it("reads file and returns valid GeoJSON", async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(validFC));

    const entry = makeEntry({
      id: "local-test",
      loaderType: "local_file",
      loaderTarget: "data/boundaries.geojson",
    });

    const result = await loadGeometry(entry);

    expect(result.geometry).not.toBeNull();
    expect(result.error).toBeNull();
    expect(result.geometry!.type).toBe("FeatureCollection");
    expect(result.geometry!.features).toHaveLength(2);
    expect(mockReadFile).toHaveBeenCalledWith(
      expect.stringContaining("data/boundaries.geojson"),
      "utf-8",
    );
  });

  it("returns file_not_found error when file missing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockReadFile.mockRejectedValue(new Error("ENOENT: no such file"));

    const entry = makeEntry({
      id: "local-missing",
      loaderType: "local_file",
      loaderTarget: "data/missing.geojson",
    });

    const result = await loadGeometry(entry);

    expect(result.geometry).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error!.type).toBe("file_not_found");
    warnSpy.mockRestore();
  });

  it("returns parse_error when file contains invalid JSON", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockReadFile.mockResolvedValue("not valid json {{}}");

    const entry = makeEntry({
      id: "local-bad-json",
      loaderType: "local_file",
      loaderTarget: "data/bad.geojson",
    });

    const result = await loadGeometry(entry);

    expect(result.geometry).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error!.type).toBe("parse_error");
    warnSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════
// Invalid GeoJSON rejection
// ═══════════════════════════════════════════════════════════════

describe("invalid GeoJSON rejection", () => {
  it("returns invalid_geojson for non-FeatureCollection response", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: {} }),
    });

    const entry = makeEntry({ id: "invalid-type" });
    const result = await loadGeometry(entry);

    expect(result.geometry).toBeNull();
    expect(result.error!.type).toBe("invalid_geojson");
    warnSpy.mockRestore();
  });

  it("returns invalid_geojson for empty features array", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ type: "FeatureCollection", features: [] }),
    });

    const entry = makeEntry({ id: "empty-features" });
    const result = await loadGeometry(entry);

    expect(result.geometry).toBeNull();
    expect(result.error!.type).toBe("invalid_geojson");
    warnSpy.mockRestore();
  });

  it("returns network error for HTML error page (parse failure)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new SyntaxError("Unexpected token < in JSON")),
    });

    const entry = makeEntry({ id: "html-error" });
    const result = await loadGeometry(entry);

    expect(result.geometry).toBeNull();
    expect(result.error).not.toBeNull();
    warnSpy.mockRestore();
  });

  it("returns invalid_geojson for array response", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([1, 2, 3]),
    });

    const entry = makeEntry({ id: "array-response" });
    const result = await loadGeometry(entry);

    expect(result.geometry).toBeNull();
    expect(result.error!.type).toBe("invalid_geojson");
    warnSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════
// Caching behavior
// ═══════════════════════════════════════════════════════════════

describe("caching behavior", () => {
  it("second call returns cached result without re-fetching", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validFC),
    });
    globalThis.fetch = fetchMock;

    const entry = makeEntry({ id: "cache-hit" });

    const first = await loadGeometry(entry);
    const second = await loadGeometry(entry);

    expect(first.geometry).not.toBeNull();
    expect(second.geometry).toBe(first.geometry); // same reference
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clearGeometryCache forces re-fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validFC),
    });
    globalThis.fetch = fetchMock;

    const entry = makeEntry({ id: "cache-clear" });

    await loadGeometry(entry);
    expect(geometryCacheSize()).toBe(1);

    clearGeometryCache();
    expect(geometryCacheSize()).toBe(0);

    await loadGeometry(entry);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("different entries have independent cache slots", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validFC),
    });
    globalThis.fetch = fetchMock;

    const entry1 = makeEntry({ id: "slot-1", loaderTarget: "https://a.com/1.json" });
    const entry2 = makeEntry({ id: "slot-2", loaderTarget: "https://a.com/2.json" });

    await loadGeometry(entry1);
    await loadGeometry(entry2);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(geometryCacheSize()).toBe(2);
  });

  it("failed loads are NOT cached", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("first fail"))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(validFC),
      });
    globalThis.fetch = fetchMock;

    const entry = makeEntry({ id: "no-cache-fail" });

    const fail = await loadGeometry(entry);
    expect(fail.geometry).toBeNull();
    expect(fail.error).not.toBeNull();
    expect(geometryCacheSize()).toBe(0);

    const success = await loadGeometry(entry);
    expect(success.geometry).not.toBeNull();
    expect(success.error).toBeNull();
    expect(geometryCacheSize()).toBe(1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════
// Generated type
// ═══════════════════════════════════════════════════════════════

describe("generated loader type", () => {
  it("returns unsupported error for generated type", async () => {
    const entry = makeEntry({
      id: "generated-test",
      loaderType: "generated",
      loaderTarget: "grid-generator",
    });

    const result = await loadGeometry(entry);

    expect(result.geometry).toBeNull();
    expect(result.error!.type).toBe("unsupported");
  });
});

// ═══════════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════════

describe("edge cases", () => {
  it("handles unknown loader type gracefully", async () => {
    const entry = makeEntry({
      id: "unknown-type",
      loaderType: "magic" as GeometryEntry["loaderType"],
      loaderTarget: "abracadabra",
    });

    const result = await loadGeometry(entry);

    expect(result.geometry).toBeNull();
    expect(result.error!.type).toBe("unsupported");
  });

  it("valid local_file GeoJSON is cached like any other", async () => {
    mockReadFile.mockClear();
    mockReadFile.mockResolvedValue(JSON.stringify(validFC));

    const entry = makeEntry({
      id: "local-cached",
      loaderType: "local_file",
      loaderTarget: "data/test.geojson",
    });

    const first = await loadGeometry(entry);
    const second = await loadGeometry(entry);

    expect(first.geometry).not.toBeNull();
    expect(second.geometry).toBe(first.geometry);
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  it("returns server_error for HTTP 500", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const entry = makeEntry({ id: "server-err" });
    const result = await loadGeometry(entry);

    expect(result.geometry).toBeNull();
    expect(result.error!.type).toBe("server_error");
    warnSpy.mockRestore();
  });
});
