import { describe, expect, it } from "vitest";
import { getGenerationSelectionContext } from "../generation-selection";
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

const placePointProfile: DatasetProfile = {
  featureCount: 1248,
  geometryType: "Point",
  bounds: [[-54.8, -176.65], [78.22, 179.99]],
  crs: null,
  attributes: [
    { name: "name", type: "string", uniqueValues: 1248, nullCount: 0 },
    { name: "category", type: "string", uniqueValues: 3, nullCount: 0 },
    { name: "country", type: "string", uniqueValues: 167, nullCount: 0 },
    { name: "year_inscribed", type: "number", uniqueValues: 47, nullCount: 12 },
  ],
};

const quantitativePointProfile: DatasetProfile = {
  featureCount: 243,
  geometryType: "Point",
  bounds: [[-36.85, -123.12], [59.93, 151.21]],
  crs: null,
  attributes: [
    { name: "name", type: "string", uniqueValues: 243, nullCount: 0 },
    { name: "country", type: "string", uniqueValues: 104, nullCount: 0 },
    { name: "pop_max", type: "number", uniqueValues: 239, nullCount: 0 },
    { name: "capital", type: "number", uniqueValues: 2, nullCount: 0 },
  ],
};

const densityPointProfile: DatasetProfile = {
  featureCount: 5200,
  geometryType: "Point",
  bounds: [[40.63, -74.05], [40.88, -73.77]],
  crs: null,
  attributes: [
    { name: "fare", type: "number", uniqueValues: 3800, nullCount: 12 },
    { name: "passengers", type: "number", uniqueValues: 6, nullCount: 0 },
    { name: "trip_distance", type: "number", uniqueValues: 4100, nullCount: 0 },
  ],
};

const bufferPointProfile: DatasetProfile = {
  featureCount: 85,
  geometryType: "Point",
  bounds: [[59.28, 17.9], [59.42, 18.2]],
  crs: null,
  attributes: [
    { name: "name", type: "string", uniqueValues: 85, nullCount: 0 },
    { name: "students", type: "number", uniqueValues: 78, nullCount: 2 },
    { name: "type", type: "string", uniqueValues: 3, nullCount: 0 },
  ],
};

const lineProfile: DatasetProfile = {
  featureCount: 87,
  geometryType: "LineString",
  bounds: [[55.34, 12.45], [56.45, 14.37]],
  crs: null,
  attributes: [
    { name: "origin", type: "string", uniqueValues: 28, nullCount: 0 },
    { name: "destination", type: "string", uniqueValues: 28, nullCount: 0 },
    { name: "commuters", type: "number", uniqueValues: 82, nullCount: 0 },
  ],
};

const polygonProfile: DatasetProfile = {
  featureCount: 290,
  geometryType: "MultiPolygon",
  bounds: [[55.34, 11.11], [69.06, 24.17]],
  crs: null,
  attributes: [
    { name: "kommun_namn", type: "string", uniqueValues: 290, nullCount: 0 },
    { name: "total_skatt", type: "number", uniqueValues: 148, nullCount: 0 },
  ],
};

describe("getGenerationSelectionContext", () => {
  it("prioritizes place anchors for restaurant prompts", () => {
    const result = getGenerationSelectionContext("Show all restaurants in central Stockholm.");

    expect(result.genSkill).toBe("locational");
    expect(result.primaryAnchorId).toBe("restaurants");
    expect(result.selectedExampleIds.slice(0, 4)).toEqual([
      "restaurants",
      "population",
      "burglaries",
      "earthquakes-weekly",
    ]);
  });

  it("prioritizes transform anchors for isochrone prompts", () => {
    const result = getGenerationSelectionContext(
      "Show 15 and 30 minute driving isochrones from Gothenburg airport.",
    );

    expect(result.genSkill).toBe("locational");
    expect(result.primaryAnchorId).toBe("isochrone-cycling");
    expect(result.selectedExampleIds.slice(0, 4)).toEqual([
      "isochrone-cycling",
      "school-buffer-zones",
      "restaurants",
      "earthquakes-weekly",
    ]);
  });

  it("treats natural driving-area wording as isochrone intent", () => {
    const result = getGenerationSelectionContext(
      "Show 15 minute driving areas from Gothenburg airport.",
    );

    expect(result.primaryAnchorId).toBe("isochrone-cycling");
    expect(result.selectedExampleIds.slice(0, 3)).toEqual([
      "isochrone-cycling",
      "school-buffer-zones",
      "restaurants",
    ]);
  });

  it("does not steer POI-within-travel-time prompts toward isochrone anchors", () => {
    const result = getGenerationSelectionContext(
      "Show all restaurants within 15 minutes driving from Gothenburg airport.",
    );

    expect(result.primaryAnchorId).toBe("restaurants");
    expect(result.selectedExampleIds.slice(0, 3)).toEqual([
      "restaurants",
      "population",
      "burglaries",
    ]);
  });

  it("prioritizes quantitative anchors for proportional population prompts", () => {
    const result = getGenerationSelectionContext(
      "Show major world cities with circle sizes proportional to their population. Color by continent.",
    );

    expect(result.genSkill).toBe("general");
    expect(result.primaryAnchorId).toBe("population");
    expect(result.selectedExampleIds.slice(0, 5)).toEqual([
      "population",
      "housing-prices",
      "tax-rates",
      "earthquakes-weekly",
      "burglaries",
    ]);
  });

  it("preserves with-profile live-event anchors for point profiles", () => {
    const result = getGenerationSelectionContext(
      "Show earthquake events over the last day.",
      pointProfile,
    );

    expect(result.genSkill).toBe("locational");
    expect(result.primaryAnchorId).toBe("earthquakes-daily");
    expect(result.selectedExampleIds).toEqual([
      "earthquakes-daily",
      "world-cities-profile",
    ]);
  });

  it("prefers the heritage-style with-profile anchor for place-like point profiles", () => {
    const result = getGenerationSelectionContext(
      "Show UNESCO heritage sites colored by category.",
      placePointProfile,
    );

    expect(result.genSkill).toBe("locational");
    expect(result.primaryAnchorId).toBe("heritage-sites-profile");
    expect(result.selectedExampleIds).toEqual([
      "heritage-sites-profile",
      "world-cities-profile",
    ]);
  });

  it("prefers the world-cities-style with-profile anchor for quantitative point profiles", () => {
    const result = getGenerationSelectionContext(
      "Show major world cities with circle sizes proportional to their population.",
      quantitativePointProfile,
    );

    expect(result.genSkill).toBe("locational");
    expect(result.primaryAnchorId).toBe("world-cities-profile");
    expect(result.selectedExampleIds).toEqual([
      "world-cities-profile",
      "heritage-sites-profile",
    ]);
  });

  it("prefers the hexbin with-profile anchor for dense point profiles", () => {
    const result = getGenerationSelectionContext(
      "Show taxi trip density in New York with hexagons.",
      densityPointProfile,
    );

    expect(result.genSkill).toBe("thematic");
    expect(result.primaryAnchorId).toBe("taxi-hexbin");
    expect(result.selectedExampleIds).toEqual([
      "taxi-hexbin",
      "world-cities-profile",
    ]);
  });

  it("prefers the transform with-profile anchor for buffer prompts", () => {
    const result = getGenerationSelectionContext(
      "Show 1 km buffer zones around all schools.",
      bufferPointProfile,
    );

    expect(result.genSkill).toBe("locational");
    expect(result.primaryAnchorId).toBe("school-buffer-zones");
    expect(result.selectedExampleIds).toEqual([
      "school-buffer-zones",
      "heritage-sites-profile",
    ]);
  });

  it("keeps profiled line prompts on line-compatible anchors", () => {
    const result = getGenerationSelectionContext(
      "Show passenger counts on each route.",
      lineProfile,
    );

    expect(result.genSkill).toBe("flow");
    expect(result.primaryAnchorId).toBe("commuting");
    expect(result.selectedExampleIds).toEqual([
      "commuting",
      "earthquakes-weekly",
    ]);
  });

  it("keeps profiled polygon prompts on polygon-compatible anchors", () => {
    const result = getGenerationSelectionContext(
      "Show budget allocation by municipality.",
      polygonProfile,
    );

    expect(result.genSkill).toBe("thematic");
    expect(result.primaryAnchorId).toBe("tax-rates");
    expect(result.selectedExampleIds).toEqual([
      "tax-rates",
      "housing-prices",
    ]);
  });
});
