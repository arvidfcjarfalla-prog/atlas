import { describe, it, expect } from "vitest";
import {
  EXAMPLES,
  selectExamples,
  formatExample,
  type FewShotExample,
} from "../example-bank";
import type { DatasetProfile } from "../types";

const pointProfile: DatasetProfile = {
  featureCount: 100,
  geometryType: "Point",
  bounds: [[-58, -179], [66, 180]],
  crs: null,
  attributes: [
    { name: "mag", type: "number", uniqueValues: 80, nullCount: 0 },
  ],
};

const polygonProfile: DatasetProfile = {
  featureCount: 290,
  geometryType: "MultiPolygon",
  bounds: [[55, 11], [69, 24]],
  crs: null,
  attributes: [
    { name: "name", type: "string", uniqueValues: 290, nullCount: 0 },
  ],
};

const lineProfile: DatasetProfile = {
  featureCount: 87,
  geometryType: "LineString",
  bounds: [[55, 12], [56, 14]],
  crs: null,
  attributes: [
    { name: "origin", type: "string", uniqueValues: 28, nullCount: 0 },
  ],
};

describe("EXAMPLES bank", () => {
  it("contains 9 examples", () => {
    expect(EXAMPLES).toHaveLength(9);
  });

  it("covers all 7 map families", () => {
    const families = new Set(EXAMPLES.flatMap((e) => e.families));
    expect(families).toEqual(
      new Set([
        "point",
        "cluster",
        "choropleth",
        "heatmap",
        "proportional-symbol",
        "flow",
        "isochrone",
      ]),
    );
  });

  it("has 3 with-profile examples", () => {
    const withProfile = EXAMPLES.filter((e) => e.hasProfile);
    expect(withProfile).toHaveLength(3);
    expect(withProfile.every((e) => e.profile)).toBe(true);
  });
});

describe("selectExamples", () => {
  it("returns all 9 examples without profile", () => {
    const result = selectExamples();
    expect(result).toHaveLength(9);
    expect(result).toEqual(EXAMPLES);
  });

  it("returns all 9 when profile is undefined", () => {
    const result = selectExamples(undefined);
    expect(result).toHaveLength(9);
  });

  it("returns 3 examples for Point profile", () => {
    const result = selectExamples(pointProfile);
    expect(result).toHaveLength(3);
  });

  it("includes earthquakes-daily (with-profile) for Point geometry", () => {
    const result = selectExamples(pointProfile);
    const ids = result.map((e) => e.id);
    expect(ids).toContain("earthquakes-daily");
  });

  it("returns 3 examples for Polygon profile", () => {
    const result = selectExamples(polygonProfile);
    expect(result).toHaveLength(3);
  });

  it("includes tax-rates (with-profile) for MultiPolygon geometry", () => {
    const result = selectExamples(polygonProfile);
    const ids = result.map((e) => e.id);
    expect(ids).toContain("tax-rates");
  });

  it("does NOT include earthquakes-daily for Polygon profile", () => {
    const result = selectExamples(polygonProfile);
    const ids = result.map((e) => e.id);
    expect(ids).not.toContain("earthquakes-daily");
  });

  it("returns 3 examples for LineString profile", () => {
    const result = selectExamples(lineProfile);
    expect(result).toHaveLength(3);
  });

  it("includes commuting (with-profile) for LineString geometry", () => {
    const result = selectExamples(lineProfile);
    const ids = result.map((e) => e.id);
    expect(ids).toContain("commuting");
  });

  it("maximizes family coverage for Point profile", () => {
    const result = selectExamples(pointProfile);
    const families = new Set(result.flatMap((e) => e.families));
    // Should cover at least 3 unique families
    expect(families.size).toBeGreaterThanOrEqual(3);
  });

  it("is deterministic — same input produces same output", () => {
    const a = selectExamples(pointProfile);
    const b = selectExamples(pointProfile);
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
  });

  it("respects custom count", () => {
    const result = selectExamples(pointProfile, 2);
    expect(result).toHaveLength(2);
  });

  it("pads with other-geometry examples when needed (LineString)", () => {
    // LineString has only 1 matching example (commuting), so 2 slots
    // should be filled from other geometry types
    const result = selectExamples(lineProfile);
    const nonLineExamples = result.filter(
      (e) => !e.geometryTypes.includes("LineString") && !e.geometryTypes.includes("MultiLineString"),
    );
    expect(nonLineExamples.length).toBeGreaterThanOrEqual(2);
  });
});

describe("formatExample", () => {
  it("formats example without profile", () => {
    const ex = EXAMPLES.find((e) => e.id === "restaurants")!;
    const formatted = formatExample(ex);
    expect(formatted).toContain("<example>");
    expect(formatted).toContain("</example>");
    expect(formatted).toContain("<user-prompt>");
    expect(formatted).toContain("<output>");
    expect(formatted).not.toContain("<dataset-profile>");
  });

  it("formats example with profile", () => {
    const ex = EXAMPLES.find((e) => e.id === "earthquakes-daily")!;
    const formatted = formatExample(ex);
    expect(formatted).toContain("<dataset-profile>");
    expect(formatted).toContain("</dataset-profile>");
    expect(formatted).toContain("featureCount");
  });
});
