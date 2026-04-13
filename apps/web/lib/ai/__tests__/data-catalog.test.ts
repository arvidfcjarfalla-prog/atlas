import { describe, expect, it } from "vitest";
import { DATA_CATALOG, matchCatalog } from "../data-catalog";

describe("matchCatalog", () => {
  it("prefers world-cities over world-countries for explicit city prompts", () => {
    const matches = matchCatalog(
      "Show major world cities with circle sizes proportional to their population. Color by continent.",
    );

    expect(matches[0]?.id).toBe("world-cities");
    expect(matches.slice(0, 2).map((entry) => entry.id)).toEqual([
      "world-cities",
      "world-countries",
    ]);
  });

  it("still prefers world-countries for country boundary prompts", () => {
    const matches = matchCatalog("Show all countries of the world colored by continent.");

    expect(matches[0]?.id).toBe("world-countries");
  });

  it("advertises continent on world-cities when city prompts ask for regional grouping", () => {
    const worldCities = DATA_CATALOG.find((entry) => entry.id === "world-cities");

    expect(worldCities?.attributes).toContain("continent");
  });

  it("keeps unesco prompts on the heritage catalog", () => {
    const matches = matchCatalog("Show UNESCO heritage sites colored by category.");

    expect(matches[0]?.id).toBe("unesco-heritage");
  });
});
