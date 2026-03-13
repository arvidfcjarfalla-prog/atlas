import { describe, it, expect } from "vitest";
import { interpolateArc, applyArcInterpolation } from "../arc-interpolator";

// Helper functions to create GeoJSON features
function lineFeature(coords: [number, number][]): GeoJSON.Feature {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: coords },
    properties: {},
  };
}

function pointFeature(coord: [number, number]): GeoJSON.Feature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: coord },
    properties: {},
  };
}

describe("interpolateArc", () => {
  it("returns single point unchanged", () => {
    const coords: [number, number][] = [[0, 0]];
    const result = interpolateArc(coords);
    expect(result).toBe(coords);
    expect(result).toEqual([[0, 0]]);
  });

  it("returns three+ points unchanged", () => {
    const coords: [number, number][] = [[0, 0], [5, 5], [10, 10]];
    const result = interpolateArc(coords);
    expect(result).toBe(coords);
    expect(result.length).toBe(3);
  });

  it("returns very short distance unchanged (< 1km)", () => {
    const coords: [number, number][] = [[0, 0], [0.001, 0.001]];
    const result = interpolateArc(coords);
    expect(result).toBe(coords);
    expect(result.length).toBe(2);
  });

  it("handles same point gracefully", () => {
    const coords: [number, number][] = [[5, 5], [5, 5]];
    const result = interpolateArc(coords);
    expect(result).toBe(coords);
    expect(result.length).toBe(2);
  });

  it("interpolates short distance with Bezier curve (London → Paris ~343km)", () => {
    const london: [number, number] = [-0.12, 51.51];
    const paris: [number, number] = [2.35, 48.86];
    const coords: [number, number][] = [london, paris];

    const result = interpolateArc(coords, 32);

    // Should have 32 segments → 31 midpoints + 2 endpoints = 33 total points
    expect(result.length).toBe(33);

    // First and last points should match endpoints
    expect(result[0]).toEqual(london);
    expect(result[32]).toEqual(paris);

    // Points should NOT be collinear (curve should have offset)
    // Check that a midpoint is not on the straight line between endpoints
    const midPoint = result[16];
    const straightLineMidLng = (london[0] + paris[0]) / 2;
    const straightLineMidLat = (london[1] + paris[1]) / 2;

    // At least one coordinate should differ significantly from straight line
    const lngDiff = Math.abs(midPoint[0] - straightLineMidLng);
    const latDiff = Math.abs(midPoint[1] - straightLineMidLat);
    expect(lngDiff + latDiff).toBeGreaterThan(0.01);
  });

  it("interpolates long distance with great circle (NY → LA ~3944km)", () => {
    const newYork: [number, number] = [-74.006, 40.7128];
    const losAngeles: [number, number] = [-118.2437, 33.9425];
    const coords: [number, number][] = [newYork, losAngeles];

    const result = interpolateArc(coords, 32);

    // Same point count as Bezier
    expect(result.length).toBe(33);

    // First and last points should match endpoints
    expect(result[0]).toEqual(newYork);
    expect(result[32]).toEqual(losAngeles);

    // Great circle should produce smooth interpolation
    // All intermediate points should be defined
    result.forEach((point) => {
      expect(point).toHaveLength(2);
      expect(typeof point[0]).toBe("number");
      expect(typeof point[1]).toBe("number");
    });
  });

  it("respects custom resolution parameter", () => {
    const coords: [number, number][] = [[0, 0], [10, 10]];
    const result = interpolateArc(coords, 8);

    // 8 segments → 7 midpoints + 2 endpoints = 9 total points
    expect(result.length).toBe(9);
    expect(result[0]).toEqual([0, 0]);
    expect(result[8]).toEqual([10, 10]);
  });
});

describe("applyArcInterpolation", () => {
  it("returns empty collection for empty input", () => {
    const input: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [],
    };

    const result = applyArcInterpolation(input);

    expect(result.type).toBe("FeatureCollection");
    expect(result.features).toEqual([]);
  });

  it("passes through Point features unchanged", () => {
    const point = pointFeature([5, 5]);
    const input: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [point],
    };

    const result = applyArcInterpolation(input);

    expect(result.features.length).toBe(1);
    expect(result.features[0]).toBe(point);
  });

  it("interpolates LineString with 2 points", () => {
    const london: [number, number] = [-0.12, 51.51];
    const paris: [number, number] = [2.35, 48.86];
    const line = lineFeature([london, paris]);
    const input: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [line],
    };

    const result = applyArcInterpolation(input);

    expect(result.features.length).toBe(1);
    const resultFeature = result.features[0];
    expect(resultFeature.geometry.type).toBe("LineString");
    const coords = (resultFeature.geometry as GeoJSON.LineString).coordinates;
    expect(coords.length).toBeGreaterThan(2);
    expect(coords.length).toBe(33); // Default resolution of 32
  });

  it("leaves LineString with 3+ points unchanged", () => {
    const line = lineFeature([[0, 0], [5, 5], [10, 10]]);
    const input: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [line],
    };

    const result = applyArcInterpolation(input);

    expect(result.features.length).toBe(1);
    expect(result.features[0]).toBe(line);
  });

  it("handles mixed geometries correctly", () => {
    const point = pointFeature([0, 0]);
    const london: [number, number] = [-0.12, 51.51];
    const paris: [number, number] = [2.35, 48.86];
    const line = lineFeature([london, paris]);

    const input: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [point, line],
    };

    const result = applyArcInterpolation(input);

    expect(result.features.length).toBe(2);

    // Point should be unchanged
    expect(result.features[0]).toBe(point);

    // LineString should be interpolated
    const resultLine = result.features[1];
    expect(resultLine.geometry.type).toBe("LineString");
    const coords = (resultLine.geometry as GeoJSON.LineString).coordinates;
    expect(coords.length).toBe(33);
  });

  it("does not mutate original data", () => {
    const london: [number, number] = [-0.12, 51.51];
    const paris: [number, number] = [2.35, 48.86];
    const originalCoords = [london, paris];
    const line = lineFeature(originalCoords);
    const input: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [line],
    };

    // Keep reference to original coordinates
    const originalCoordsRef = (input.features[0].geometry as GeoJSON.LineString).coordinates;

    applyArcInterpolation(input);

    // Original should still have 2 points
    expect(originalCoordsRef.length).toBe(2);
    expect((input.features[0].geometry as GeoJSON.LineString).coordinates.length).toBe(2);
  });
});
