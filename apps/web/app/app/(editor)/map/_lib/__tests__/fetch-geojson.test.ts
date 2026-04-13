import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchGeoJSON } from "../fetch-geojson";
import { RetryableError } from "../pipeline-stages";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockFetch.mockReset();
});

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("fetchGeoJSON", () => {
  it("returns the FeatureCollection on success", async () => {
    const fc = { type: "FeatureCollection", features: [] };
    mockFetch.mockResolvedValue(respond(fc));
    const result = await fetchGeoJSON("/data");
    expect(result).toEqual(fc);
  });

  it("returns null if JSON is not a FeatureCollection", async () => {
    mockFetch.mockResolvedValue(respond({ type: "Polygon" }));
    expect(await fetchGeoJSON("/data")).toBeNull();
  });

  it("returns null for non-ok response when throwOnExpired is false", async () => {
    mockFetch.mockResolvedValue(respond({}, 500));
    expect(await fetchGeoJSON("/data")).toBeNull();
  });

  it("returns null for 404 when throwOnExpired is false (default)", async () => {
    mockFetch.mockResolvedValue(respond({}, 404));
    expect(await fetchGeoJSON("/data")).toBeNull();
  });

  it("throws RetryableError on 404 when throwOnExpired=true", async () => {
    mockFetch.mockResolvedValue(respond({}, 404));
    await expect(fetchGeoJSON("/data", { throwOnExpired: true })).rejects.toBeInstanceOf(RetryableError);
  });

  it("does NOT throw on 500 even with throwOnExpired=true (only 404 is retryable)", async () => {
    mockFetch.mockResolvedValue(respond({}, 500));
    expect(await fetchGeoJSON("/data", { throwOnExpired: true })).toBeNull();
  });

  it("returns null when fetch rejects (network error)", async () => {
    mockFetch.mockRejectedValue(new Error("network down"));
    expect(await fetchGeoJSON("/data")).toBeNull();
  });

  it("RetryableError from inside try block is re-thrown", async () => {
    // Simulate the case where fetch resolves with 404 and throwOnExpired is true.
    // The throw inside the try block must propagate, not be swallowed by the catch.
    mockFetch.mockResolvedValue(respond({}, 404));
    await expect(fetchGeoJSON("/data", { throwOnExpired: true })).rejects.toBeInstanceOf(RetryableError);
  });

  it("returns null when body is not valid JSON", async () => {
    mockFetch.mockResolvedValue(new Response("not json", { status: 200 }));
    expect(await fetchGeoJSON("/data")).toBeNull();
  });
});
