import { describe, it, expect } from "vitest";
import { applyGeometryGuards } from "../geometry-guards";
import type { MapManifest } from "@atlas/data-models";
import type { DatasetProfile } from "../types";

// ─── Helpers ─────────────────────────────────────────────────

function makeManifest(mapFamily: string): MapManifest {
  return {
    version: 2,
    id: "test",
    title: "Test",
    description: "Test",
    theme: "explore",
    defaultCenter: [0, 0],
    defaultZoom: 5,
    layers: [
      {
        id: "layer1",
        kind: "zone",
        label: "Layer",
        sourceType: "geojson-url",
        geometryType: "polygon",
        style: {
          markerShape: "circle",
          mapFamily,
        },
      },
    ],
    intent: {
      userPrompt: "test",
      taskType: "test",
      confidence: 0.9,
      assumptions: [],
    },
    validation: { valid: true, errors: [], warnings: [] },
  } as MapManifest;
}

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

// ─── Tests ───────────────────────────────────────────────────

describe("applyGeometryGuards", () => {
  it("switches point family to choropleth for polygon data", () => {
    const m = makeManifest("point");
    const warnings = applyGeometryGuards(m, makeProfile("Polygon"));
    expect(m.layers[0].style.mapFamily).toBe("choropleth");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Switched point → choropleth");
  });

  it("switches choropleth to proportional-symbol for point data (<= 2000)", () => {
    const m = makeManifest("choropleth");
    const warnings = applyGeometryGuards(m, makeProfile("Point", 500));
    expect(m.layers[0].style.mapFamily).toBe("proportional-symbol");
    expect(warnings[0]).toContain("Switched choropleth → proportional-symbol");
  });

  it("switches choropleth to heatmap for large point datasets (> 2000)", () => {
    const m = makeManifest("choropleth");
    const warnings = applyGeometryGuards(m, makeProfile("Point", 3000));
    expect(m.layers[0].style.mapFamily).toBe("heatmap");
    expect(warnings[0]).toContain("Switched choropleth → heatmap");
  });

  it("switches flow family to choropleth for polygon data", () => {
    const m = makeManifest("flow");
    const warnings = applyGeometryGuards(m, makeProfile("Polygon"));
    expect(m.layers[0].style.mapFamily).toBe("choropleth");
    expect(warnings[0]).toContain("Switched flow → choropleth");
  });

  it("switches flow family to point for small point datasets", () => {
    const m = makeManifest("flow");
    const warnings = applyGeometryGuards(m, makeProfile("Point", 100));
    expect(m.layers[0].style.mapFamily).toBe("point");
    expect(warnings[0]).toContain("Switched flow → point");
  });

  it("switches point family to flow for line data", () => {
    const m = makeManifest("point");
    const warnings = applyGeometryGuards(m, makeProfile("LineString"));
    expect(m.layers[0].style.mapFamily).toBe("flow");
    expect(warnings[0]).toContain("Switched point → flow");
  });

  it("switches choropleth to flow for line data", () => {
    const m = makeManifest("choropleth");
    const warnings = applyGeometryGuards(m, makeProfile("LineString"));
    expect(m.layers[0].style.mapFamily).toBe("flow");
  });

  it("auto-clusters point with > 5000 features", () => {
    const m = makeManifest("point");
    const warnings = applyGeometryGuards(m, makeProfile("Point", 6000));
    expect(m.layers[0].style.mapFamily).toBe("cluster");
    expect(m.layers[0].style.clusterRadius).toBe(50);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Switched to cluster");
  });

  it("does not modify when family matches geometry", () => {
    const m = makeManifest("choropleth");
    const warnings = applyGeometryGuards(m, makeProfile("Polygon"));
    expect(m.layers[0].style.mapFamily).toBe("choropleth");
    expect(warnings).toHaveLength(0);
  });

  it("handles manifest with no layers gracefully", () => {
    const m = makeManifest("point");
    m.layers = [];
    const warnings = applyGeometryGuards(m, makeProfile("Polygon"));
    expect(warnings).toHaveLength(0);
  });
});
