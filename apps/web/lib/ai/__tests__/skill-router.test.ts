import { describe, it, expect } from "vitest";
import { classifyChatSkill, classifyGenSkill } from "../skills/router";
import type { DatasetProfile } from "../types";

// ─── Helpers ─────────────────────────────────────────────────

function makeProfile(
  geometryType: DatasetProfile["geometryType"],
  featureCount = 100,
): DatasetProfile {
  return {
    featureCount,
    geometryType,
    bounds: [[0, 0], [10, 10]],
    crs: null,
    attributes: [
      { name: "value", type: "number", uniqueValues: 50, nullCount: 0, min: 0, max: 100 },
    ],
  };
}

// ─── classifyChatSkill ──────────────────────────────────────

describe("classifyChatSkill", () => {
  it("classifies style changes", () => {
    expect(classifyChatSkill("change the colors to blue", true)).toBe("style");
    expect(classifyChatSkill("make it darker", true)).toBe("style");
    expect(classifyChatSkill("switch to heatmap", true)).toBe("style");
    expect(classifyChatSkill("increase the opacity", true)).toBe("style");
  });

  it("classifies style only when hasData is true", () => {
    expect(classifyChatSkill("change the colors to blue", false)).not.toBe("style");
  });

  it("classifies data requests", () => {
    expect(classifyChatSkill("show GDP per capita in Europe", false)).toBe("data");
    expect(classifyChatSkill("find restaurants in Paris", false)).toBe("data");
    expect(classifyChatSkill("search for population data in Sweden", false)).toBe("data");
  });

  it("classifies URLs as data", () => {
    expect(classifyChatSkill("load https://example.com/data.geojson", false)).toBe("data");
    expect(classifyChatSkill("use this: https://api.data.gov/csv", true)).toBe("data");
  });

  it("classifies insight questions", () => {
    expect(classifyChatSkill("what does this show?", true)).toBe("insight");
    expect(classifyChatSkill("compare the regions", true)).toBe("insight");
    expect(classifyChatSkill("why is the north higher?", true)).toBe("insight");
    expect(classifyChatSkill("what are the highest values?", true)).toBe("insight");
  });

  it("insight requires hasData", () => {
    expect(classifyChatSkill("what does this show?", false)).not.toBe("insight");
  });

  it("falls back to general", () => {
    expect(classifyChatSkill("hello", false)).toBe("general");
    expect(classifyChatSkill("how does this work?", false)).toBe("general");
    expect(classifyChatSkill("thanks", false)).toBe("general");
  });
});

// ─── classifyGenSkill ────────────────────────────────────────

describe("classifyGenSkill", () => {
  it("classifies polygon data as thematic", () => {
    expect(classifyGenSkill("GDP in Europe", makeProfile("Polygon"))).toBe("thematic");
    expect(classifyGenSkill("unemployment rates", makeProfile("MultiPolygon"))).toBe("thematic");
  });

  it("classifies point data as locational", () => {
    expect(classifyGenSkill("restaurants in Stockholm", makeProfile("Point"))).toBe("locational");
    expect(classifyGenSkill("show all parks", makeProfile("MultiPoint"))).toBe("locational");
  });

  it("classifies point data as thematic when thematic keywords present", () => {
    expect(classifyGenSkill("GDP per capita by city", makeProfile("Point"))).toBe("thematic");
  });

  it("classifies line data as flow", () => {
    expect(classifyGenSkill("commuter routes", makeProfile("LineString"))).toBe("flow");
    expect(classifyGenSkill("anything", makeProfile("MultiLineString"))).toBe("flow");
  });

  it("classifies flow keywords without profile", () => {
    expect(classifyGenSkill("trade routes between countries")).toBe("flow");
    expect(classifyGenSkill("migration patterns")).toBe("flow");
  });

  it("classifies thematic keywords without profile", () => {
    expect(classifyGenSkill("GDP comparison across nations")).toBe("thematic");
    expect(classifyGenSkill("unemployment rates in EU")).toBe("thematic");
  });

  it("classifies locational keywords without profile", () => {
    expect(classifyGenSkill("restaurants in Stockholm")).toBe("locational");
    expect(classifyGenSkill("hospitals near me")).toBe("locational");
  });

  it("falls back to general for ambiguous prompts", () => {
    expect(classifyGenSkill("make a map")).toBe("general");
    expect(classifyGenSkill("visualize this data")).toBe("general");
  });
});
