import { describe, it, expect } from "vitest";
import {
  isValidCoord,
  shouldSkipWebResearch,
  buildPointsGeoJSON,
  buildRouteGeoJSON,
  buildEntityGeoJSON,
} from "../tools/web-research";

// ─── isValidCoord ───────────────────────────────────────────

describe("isValidCoord", () => {
  it("accepts valid coordinates", () => {
    expect(isValidCoord(59.33, 18.07)).toBe(true);
    expect(isValidCoord(-33.87, 151.21)).toBe(true);
    expect(isValidCoord(0, 32)).toBe(true);
  });

  it("rejects null/undefined", () => {
    expect(isValidCoord(null, 18)).toBe(false);
    expect(isValidCoord(59, null)).toBe(false);
    expect(isValidCoord(null, null)).toBe(false);
    expect(isValidCoord(undefined, undefined)).toBe(false);
  });

  it("rejects out of range", () => {
    expect(isValidCoord(91, 0)).toBe(false);
    expect(isValidCoord(-91, 0)).toBe(false);
    expect(isValidCoord(0, 181)).toBe(false);
    expect(isValidCoord(0, -181)).toBe(false);
  });

  it("rejects null island (0,0)", () => {
    expect(isValidCoord(0, 0)).toBe(false);
  });

  it("rejects NaN and Infinity", () => {
    expect(isValidCoord(NaN, 18)).toBe(false);
    expect(isValidCoord(59, Infinity)).toBe(false);
    expect(isValidCoord(-Infinity, 0)).toBe(false);
  });
});

// ─── shouldSkipWebResearch ──────────────────────────────────

describe("shouldSkipWebResearch", () => {
  it("skips dataset/file queries", () => {
    expect(shouldSkipWebResearch("download GeoJSON of Europe")).toBe(true);
    expect(shouldSkipWebResearch("find CSV data source")).toBe(true);
    expect(shouldSkipWebResearch("world dataset")).toBe(true);
  });

  it("skips statistical metric queries", () => {
    expect(shouldSkipWebResearch("GDP per capita in Europe")).toBe(true);
    expect(shouldSkipWebResearch("mortality rate by country")).toBe(true);
    expect(shouldSkipWebResearch("human development index")).toBe(true);
  });

  it("skips known World Bank / Eurostat indicators", () => {
    expect(shouldSkipWebResearch("unemployment in Europe")).toBe(true);
    expect(shouldSkipWebResearch("population by country")).toBe(true);
    expect(shouldSkipWebResearch("CO2 emissions by country")).toBe(true);
    expect(shouldSkipWebResearch("life expectancy world")).toBe(true);
    expect(shouldSkipWebResearch("inflation in Sweden")).toBe(true);
    expect(shouldSkipWebResearch("poverty map")).toBe(true);
  });

  it("skips Swedish metric terms", () => {
    expect(shouldSkipWebResearch("befolkning i Sverige")).toBe(true);
    expect(shouldSkipWebResearch("arbetslöshet per kommun")).toBe(true);
    expect(shouldSkipWebResearch("medellivslängd europa")).toBe(true);
  });

  it("allows entity-based queries", () => {
    expect(shouldSkipWebResearch("Paradise Hotel deltagare 2024")).toBe(false);
    expect(shouldSkipWebResearch("IKEA stores in Europe")).toBe(false);
    expect(shouldSkipWebResearch("Taylor Swift Eras Tour cities")).toBe(false);
    expect(shouldSkipWebResearch("terrorattacker 2024")).toBe(false);
    expect(shouldSkipWebResearch("Michelin star restaurants in Scandinavia")).toBe(false);
    expect(shouldSkipWebResearch("UNESCO world heritage sites")).toBe(false);
  });
});

// ─── buildPointsGeoJSON (also exported as buildEntityGeoJSON) ─

describe("buildPointsGeoJSON", () => {
  it("builds valid Point GeoJSON", () => {
    const entities = [
      { name: "IKEA Kungens Kurva", location: "Stockholm", country: "Sweden", lat: 59.27, lng: 17.93 },
      { name: "IKEA Barkarby", location: "Järfälla", country: "Sweden", lat: 59.42, lng: 17.88 },
    ];

    const fc = buildPointsGeoJSON(entities);

    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].geometry.type).toBe("Point");
    expect((fc.features[0].geometry as GeoJSON.Point).coordinates).toEqual([17.93, 59.27]);
    expect(fc.features[0].properties?.name).toBe("IKEA Kungens Kurva");
    expect(fc.features[0].properties?._source).toBe("web-research");
  });

  it("handles optional fields", () => {
    const fc = buildPointsGeoJSON([{ name: "Test", location: "City", lat: 10, lng: 20 }]);
    expect(fc.features[0].properties?.country).toBeUndefined();
    expect(fc.features[0].properties?.category).toBeUndefined();
  });

  it("includes value when provided", () => {
    const fc = buildPointsGeoJSON([{ name: "Big", location: "City", lat: 10, lng: 20, value: 42 }]);
    expect(fc.features[0].properties?.value).toBe(42);
  });

  it("backward compat: buildEntityGeoJSON alias works", () => {
    const fc = buildEntityGeoJSON([{ name: "X", location: "Y", lat: 1, lng: 2 }]);
    expect(fc.features).toHaveLength(1);
  });

  it("returns empty collection for empty input", () => {
    const fc = buildPointsGeoJSON([]);
    expect(fc.features).toHaveLength(0);
  });
});

// ─── buildRouteGeoJSON ──────────────────────────────────────

describe("buildRouteGeoJSON", () => {
  const stops = [
    { name: "Mora", location: "Mora", country: "Sweden", order: 1, lat: 61.0, lng: 14.55 },
    { name: "Oxberg", location: "Oxberg", country: "Sweden", order: 2, lat: 61.1, lng: 14.3 },
    { name: "Sälen", location: "Sälen", country: "Sweden", order: 3, lat: 61.15, lng: 13.27 },
  ];

  it("creates LineString + Point features", () => {
    const fc = buildRouteGeoJSON(stops);

    // 1 LineString + 3 Points = 4 features
    expect(fc.features).toHaveLength(4);

    const line = fc.features[0];
    expect(line.geometry.type).toBe("LineString");
    expect((line.geometry as GeoJSON.LineString).coordinates).toHaveLength(3);
    expect(line.properties?._type).toBe("route-line");

    const firstStop = fc.features[1];
    expect(firstStop.geometry.type).toBe("Point");
    expect(firstStop.properties?.name).toBe("Mora");
    expect(firstStop.properties?._stop_number).toBe(1);
  });

  it("sorts by order", () => {
    const reversed = [...stops].reverse();
    const fc = buildRouteGeoJSON(reversed);

    const line = fc.features[0];
    const coords = (line.geometry as GeoJSON.LineString).coordinates;
    // First coordinate should be Mora (order 1), not Sälen (order 3)
    expect(coords[0][1]).toBeCloseTo(61.0); // Mora lat
    expect(coords[2][1]).toBeCloseTo(61.15); // Sälen lat
  });

  it("handles single stop (no line)", () => {
    const fc = buildRouteGeoJSON([stops[0]]);
    // Only 1 Point, no LineString (need >= 2 points)
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.type).toBe("Point");
  });
});
