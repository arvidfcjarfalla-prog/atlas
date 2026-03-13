import { describe, it, expect } from "vitest";
import { profileDataset } from "../profiler";

// Test helpers
function fc(features: any[]): any {
  return { type: "FeatureCollection", features };
}

function pt(lng: number, lat: number, props: Record<string, unknown>): any {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: props,
  };
}

function polyFeature(ring: [number, number][], props: Record<string, unknown>): any {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [ring] },
    properties: props,
  };
}

function lineFeature(coords: [number, number][], props: Record<string, unknown>): any {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: coords },
    properties: props,
  };
}

function multiPolyFeature(polygons: [number, number][][][], props: Record<string, unknown>): any {
  return {
    type: "Feature",
    geometry: { type: "MultiPolygon", coordinates: polygons },
    properties: props,
  };
}

describe("profileDataset", () => {
  describe("Geometry type detection", () => {
    it("returns Point for empty FeatureCollection", () => {
      const profile = profileDataset(fc([]));
      expect(profile.geometryType).toBe("Point");
      expect(profile.featureCount).toBe(0);
      expect(profile.attributes).toEqual([]);
    });

    it("detects all Point features", () => {
      const profile = profileDataset(fc([
        pt(10, 20, {}),
        pt(15, 25, {}),
      ]));
      expect(profile.geometryType).toBe("Point");
    });

    it("detects all Polygon features", () => {
      const profile = profileDataset(fc([
        polyFeature([[10, 20], [15, 20], [15, 25], [10, 25], [10, 20]], {}),
        polyFeature([[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]], {}),
      ]));
      expect(profile.geometryType).toBe("Polygon");
    });

    it("detects all LineString features", () => {
      const profile = profileDataset(fc([
        lineFeature([[10, 20], [15, 25]], {}),
        lineFeature([[0, 0], [5, 5]], {}),
      ]));
      expect(profile.geometryType).toBe("LineString");
    });

    it("detects all MultiPolygon features", () => {
      const profile = profileDataset(fc([
        multiPolyFeature([[[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]]], {}),
      ]));
      expect(profile.geometryType).toBe("MultiPolygon");
    });

    it("returns Mixed for Point + Polygon", () => {
      const profile = profileDataset(fc([
        pt(10, 20, {}),
        polyFeature([[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]], {}),
      ]));
      expect(profile.geometryType).toBe("Mixed");
    });

    it("skips null geometry for type detection", () => {
      const profile = profileDataset(fc([
        { type: "Feature", geometry: null, properties: {} },
        pt(10, 20, {}),
      ]));
      expect(profile.geometryType).toBe("Point");
    });
  });

  describe("Bounds calculation", () => {
    it("calculates bounds from Point features", () => {
      const profile = profileDataset(fc([
        pt(10, 20, {}),
        pt(15, 25, {}),
        pt(5, 15, {}),
      ]));
      expect(profile.bounds).toEqual([[15, 5], [25, 15]]);
    });

    it("extracts bounds from Polygon coordinates", () => {
      const profile = profileDataset(fc([
        polyFeature([[0, 10], [20, 10], [20, 30], [0, 30], [0, 10]], {}),
      ]));
      expect(profile.bounds).toEqual([[10, 0], [30, 20]]);
    });

    it("returns initial bounds when all geometries are null", () => {
      const profile = profileDataset(fc([
        { type: "Feature", geometry: null, properties: {} },
      ]));
      expect(profile.bounds).toEqual([[90, 180], [-90, -180]]);
    });
  });

  describe("Attribute profiling", () => {
    it("profiles numeric attribute with statistics", () => {
      const profile = profileDataset(fc([
        pt(0, 0, { population: 100 }),
        pt(1, 1, { population: 200 }),
        pt(2, 2, { population: 300 }),
      ]));
      const attr = profile.attributes.find(a => a.name === "population");
      expect(attr).toBeDefined();
      expect(attr?.type).toBe("number");
      expect(attr?.min).toBe(100);
      expect(attr?.max).toBe(300);
      expect(attr?.mean).toBe(200);
      expect(attr?.median).toBe(200);
      expect(attr?.distribution).toBeDefined();
    });

    it("profiles string attribute with sample values", () => {
      const profile = profileDataset(fc([
        pt(0, 0, { city: "Stockholm" }),
        pt(1, 1, { city: "Oslo" }),
        pt(2, 2, { city: "Copenhagen" }),
      ]));
      const attr = profile.attributes.find(a => a.name === "city");
      expect(attr).toBeDefined();
      expect(attr?.type).toBe("string");
      expect(attr?.sampleValues).toHaveLength(3);
      expect(attr?.sampleValues).toContain("Stockholm");
    });

    it("counts null values correctly", () => {
      const profile = profileDataset(fc([
        pt(0, 0, { value: 100 }),
        pt(1, 1, { value: null }),
        pt(2, 2, { value: undefined }),
        pt(3, 3, { value: 200 }),
      ]));
      const attr = profile.attributes.find(a => a.name === "value");
      expect(attr?.nullCount).toBe(2);
    });

    it("rounds mean to 2 decimal places", () => {
      const profile = profileDataset(fc([
        pt(0, 0, { value: 10 }),
        pt(1, 1, { value: 20 }),
        pt(2, 2, { value: 25 }),
      ]));
      const attr = profile.attributes.find(a => a.name === "value");
      expect(attr?.mean).toBe(18.33);
    });

    it("detects boolean attribute type", () => {
      const profile = profileDataset(fc([
        pt(0, 0, { active: true }),
        pt(1, 1, { active: false }),
        pt(2, 2, { active: true }),
      ]));
      const attr = profile.attributes.find(a => a.name === "active");
      expect(attr?.type).toBe("boolean");
    });
  });

  describe("Distribution detection", () => {
    it("returns uniform for less than 10 values", () => {
      const profile = profileDataset(fc([
        pt(0, 0, { val: 1 }),
        pt(1, 1, { val: 2 }),
        pt(2, 2, { val: 3 }),
      ]));
      const attr = profile.attributes.find(a => a.name === "val");
      expect(attr?.distribution).toBe("uniform");
    });

    it("returns uniform when all values are the same", () => {
      const values = Array(20).fill(null).map((_, i) => pt(i, i, { val: 100 }));
      const profile = profileDataset(fc(values));
      const attr = profile.attributes.find(a => a.name === "val");
      expect(attr?.distribution).toBe("uniform");
    });

    it("detects skewed-right distribution", () => {
      const values = [1, 1, 1, 1, 2, 2, 3, 5, 10, 20].map((val, i) => pt(i, i, { val }));
      const profile = profileDataset(fc(values));
      const attr = profile.attributes.find(a => a.name === "val");
      expect(attr?.distribution).toBe("skewed-right");
    });

    it("detects normal distribution", () => {
      const values = [8, 9, 10, 10, 11, 11, 12, 12, 13, 14].map((val, i) => pt(i, i, { val }));
      const profile = profileDataset(fc(values));
      const attr = profile.attributes.find(a => a.name === "val");
      expect(attr?.distribution).toBe("normal");
    });
  });

  describe("Edge cases", () => {
    it("handles features with null properties", () => {
      const profile = profileDataset(fc([
        pt(0, 0, { name: "A" }),
        { type: "Feature", geometry: { type: "Point", coordinates: [1, 1] }, properties: null },
        pt(2, 2, { name: "B" }),
      ]));
      const attr = profile.attributes.find(a => a.name === "name");
      expect(attr?.nullCount).toBe(1);
    });

    it("returns accurate feature count", () => {
      const profile = profileDataset(fc([
        pt(0, 0, {}),
        pt(1, 1, {}),
        pt(2, 2, {}),
      ]));
      expect(profile.featureCount).toBe(3);
    });

    it("limits sample values to 5 for strings", () => {
      const values = ["A", "B", "C", "D", "E", "F", "G"].map((val, i) => pt(i, i, { letter: val }));
      const profile = profileDataset(fc(values));
      const attr = profile.attributes.find(a => a.name === "letter");
      expect(attr?.sampleValues).toHaveLength(5);
    });

    it("always returns crs as null", () => {
      const profile = profileDataset(fc([pt(0, 0, {})]));
      expect(profile.crs).toBe(null);
    });
  });
});
