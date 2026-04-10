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

describe("getGenerationSelectionContext", () => {
  it("captures current no-profile selection for restaurant prompts", () => {
    const result = getGenerationSelectionContext("Show all restaurants in central Stockholm.");

    expect(result.genSkill).toBe("locational");
    expect(result.primaryAnchorId).toBe("earthquakes-weekly");
    expect(result.selectedExampleIds.slice(0, 4)).toEqual([
      "earthquakes-weekly",
      "burglaries",
      "population",
      "restaurants",
    ]);
  });

  it("captures current no-profile selection for isochrone prompts", () => {
    const result = getGenerationSelectionContext(
      "Show 15 and 30 minute driving isochrones from Gothenburg airport.",
    );

    expect(result.genSkill).toBe("locational");
    expect(result.primaryAnchorId).toBe("earthquakes-weekly");
    expect(result.selectedExampleIds).toContain("restaurants");
    expect(result.selectedExampleIds).toContain("school-buffer-zones");
  });

  it("captures current no-profile selection for proportional population prompts", () => {
    const result = getGenerationSelectionContext(
      "Show major world cities with circle sizes proportional to their population. Color by continent.",
    );

    expect(result.genSkill).toBe("general");
    expect(result.primaryAnchorId).toBe("earthquakes-weekly");
    expect(result.selectedExampleIds.slice(0, 5)).toEqual([
      "earthquakes-weekly",
      "housing-prices",
      "burglaries",
      "population",
      "restaurants",
    ]);
  });

  it("captures current with-profile point selection", () => {
    const result = getGenerationSelectionContext(
      "Show earthquake events over the last day.",
      pointProfile,
    );

    expect(result.genSkill).toBe("locational");
    expect(result.primaryAnchorId).toBe("earthquakes-daily");
    expect(result.selectedExampleIds).toEqual([
      "earthquakes-daily",
      "earthquakes-weekly",
    ]);
  });
});
