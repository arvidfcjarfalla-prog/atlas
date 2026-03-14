import { describe, it, expect } from "vitest";
import { validateCartographic } from "../cartographic";
import type { MapManifest } from "@atlas/data-models";
import type { DatasetProfile } from "../../types";

function validManifest(layerOverrides?: Partial<any>): MapManifest {
  return {
    id: "test",
    title: "Test Map",
    description: "Test description",
    theme: "explore",
    defaultCenter: [0, 0],
    defaultZoom: 5,
    layers: [
      {
        id: "layer-1",
        kind: "asset",
        label: "Test",
        sourceType: "geojson-static",
        geometryType: "point",
        style: {
          markerShape: "circle",
          mapFamily: "point",
          color: { scheme: "blues", colorblindSafe: true },
        },
        ...layerOverrides,
      },
    ],
  } as MapManifest;
}

describe("validateCartographic", () => {
  it("returns valid for a complete manifest", () => {
    const manifest = validManifest();
    const result = validateCartographic(manifest);
    expect(result).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });
  });

  it("returns error when choropleth has point geometry", () => {
    const manifest = validManifest({
      geometryType: "point",
      style: {
        markerShape: "circle",
        mapFamily: "choropleth",
        colorField: "population",
      },
    });
    const result = validateCartographic(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": choropleth requires polygon geometry, got "point"'
    );
  });

  it("accepts choropleth with polygon geometry", () => {
    const manifest = validManifest({
      geometryType: "polygon",
      style: {
        markerShape: "circle",
        mapFamily: "choropleth",
        colorField: "population",
      },
    });
    const result = validateCartographic(manifest);
    expect(result.valid).toBe(true);
    expect(result.errors).not.toContainEqual(
      expect.stringContaining("choropleth requires polygon geometry")
    );
  });

  it("accepts choropleth with multi-polygon geometry", () => {
    const manifest = validManifest({
      geometryType: "multi-polygon",
      style: {
        markerShape: "circle",
        mapFamily: "choropleth",
        colorField: "population",
      },
    });
    const result = validateCartographic(manifest);
    expect(result.valid).toBe(true);
    expect(result.errors).not.toContainEqual(
      expect.stringContaining("choropleth requires polygon geometry")
    );
  });

  it("returns warning when choropleth has no normalization", () => {
    const manifest = validManifest({
      geometryType: "polygon",
      style: {
        markerShape: "circle",
        mapFamily: "choropleth",
        colorField: "population",
      },
    });
    const result = validateCartographic(manifest);
    expect(result.warnings).toContain(
      'Layer "layer-1": choropleth without normalization — raw counts may be misleading'
    );
  });

  it("returns error when proportional-symbol has no sizeField", () => {
    const manifest = validManifest({
      geometryType: "point",
      style: {
        markerShape: "circle",
        mapFamily: "proportional-symbol",
        colorField: "category",
      },
    });
    const result = validateCartographic(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": proportional-symbol requires sizeField'
    );
  });

  it("returns warning when heatmap maxZoom is greater than 12", () => {
    const manifest = validManifest({
      geometryType: "point",
      style: {
        markerShape: "circle",
        mapFamily: "heatmap",
        maxZoom: 15,
      },
    });
    const result = validateCartographic(manifest);
    expect(result.warnings).toContain(
      'Layer "layer-1": heatmap maxZoom > 12 may produce noisy results'
    );
  });

  it("does not warn when heatmap maxZoom is 12 or less", () => {
    const manifest = validManifest({
      geometryType: "point",
      style: {
        markerShape: "circle",
        mapFamily: "heatmap",
        maxZoom: 10,
      },
    });
    const result = validateCartographic(manifest);
    expect(result.warnings).not.toContainEqual(
      expect.stringContaining("heatmap maxZoom")
    );
  });

  it("returns warning when point layer has high featureThreshold without clustering", () => {
    const manifest = validManifest({
      geometryType: "point",
      style: {
        markerShape: "circle",
        mapFamily: "point",
        clusterEnabled: false,
      },
      performance: {
        featureThreshold: 1000,
      },
    });
    const result = validateCartographic(manifest);
    expect(result.warnings).toContain(
      'Layer "layer-1": > 500 features without clustering — consider enabling clusters or using heatmap'
    );
  });

  it("returns warning when colorblindSafe is false", () => {
    const manifest = validManifest({
      style: {
        markerShape: "circle",
        mapFamily: "point",
        color: {
          scheme: "blues",
          colorblindSafe: false,
        },
      },
    });
    const result = validateCartographic(manifest);
    expect(result.warnings).toContain(
      'Layer "layer-1": colorblindSafe is disabled — map may be inaccessible'
    );
  });

  it("returns warning when diverging scheme used with choropleth without normalization", () => {
    const manifest = validManifest({
      geometryType: "polygon",
      style: {
        markerShape: "circle",
        mapFamily: "choropleth",
        colorField: "population",
        color: {
          scheme: "blue-red",
        },
      },
    });
    const result = validateCartographic(manifest);
    expect(result.warnings).toContain(
      'Layer "layer-1": diverging color scheme without clear midpoint — consider a sequential scheme'
    );
  });

  it("returns error when flow has polygon geometry", () => {
    const manifest = validManifest({
      geometryType: "polygon",
      style: {
        markerShape: "circle",
        mapFamily: "flow",
      },
      flow: {
        originField: "origin",
        destinationField: "dest",
      },
    });
    const result = validateCartographic(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": flow requires line geometry, got "polygon"'
    );
  });

  it("accepts flow with line geometry", () => {
    const manifest = validManifest({
      geometryType: "line",
      style: {
        markerShape: "circle",
        mapFamily: "flow",
      },
      flow: {
        originField: "origin",
        destinationField: "dest",
      },
    });
    const result = validateCartographic(manifest);
    expect(result.errors).not.toContainEqual(
      expect.stringContaining("flow requires line geometry")
    );
  });

  it("returns warning when flow has no weightField", () => {
    const manifest = validManifest({
      geometryType: "line",
      style: {
        markerShape: "circle",
        mapFamily: "flow",
      },
      flow: {
        originField: "origin",
        destinationField: "dest",
      },
    });
    const result = validateCartographic(manifest);
    expect(result.warnings).toContain(
      'Layer "layer-1": flow without weightField — all lines will have equal width'
    );
  });

  it("returns error when isochrone has line geometry", () => {
    const manifest = validManifest({
      geometryType: "line",
      style: {
        markerShape: "circle",
        mapFamily: "isochrone",
      },
      isochrone: {
        mode: "driving",
        breakpoints: [5, 10, 15],
      },
    });
    const result = validateCartographic(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": isochrone requires polygon geometry, got "line"'
    );
  });

  it("accepts isochrone with polygon geometry", () => {
    const manifest = validManifest({
      geometryType: "polygon",
      style: {
        markerShape: "circle",
        mapFamily: "isochrone",
      },
      isochrone: {
        mode: "driving",
        breakpoints: [5, 10, 15],
      },
    });
    const result = validateCartographic(manifest);
    expect(result.errors).not.toContainEqual(
      expect.stringContaining("isochrone requires polygon geometry")
    );
  });

  it("returns warning when isochrone breakpoints are not sorted ascending", () => {
    const manifest = validManifest({
      geometryType: "polygon",
      style: {
        markerShape: "circle",
        mapFamily: "isochrone",
      },
      isochrone: {
        mode: "driving",
        breakpoints: [10, 5, 15, 30],
      },
    });
    const result = validateCartographic(manifest);
    expect(result.warnings).toContain(
      'Layer "layer-1": isochrone breakpoints should be sorted ascending'
    );
  });

  it("returns warning when isochrone has more than 6 breakpoints", () => {
    const manifest = validManifest({
      geometryType: "polygon",
      style: {
        markerShape: "circle",
        mapFamily: "isochrone",
      },
      isochrone: {
        mode: "driving",
        breakpoints: [5, 10, 15, 20, 25, 30, 45],
      },
    });
    const result = validateCartographic(manifest);
    expect(result.warnings).toContain(
      'Layer "layer-1": more than 6 isochrone breakpoints may be hard to distinguish visually'
    );
  });

  // ─── Profile-aware checks ────────────────────────────────────

  const testProfile: DatasetProfile = {
    featureCount: 100,
    geometryType: "Point",
    bounds: [[55, 12], [58, 15]],
    crs: null,
    attributes: [
      { name: "population", type: "number", uniqueValues: 90, nullCount: 2, min: 100, max: 1000000, mean: 50000, median: 25000, distribution: "skewed-right" },
      { name: "region", type: "string", uniqueValues: 5, nullCount: 0, sampleValues: ["North", "South", "East", "West", "Central"] },
      { name: "sparse_field", type: "string", uniqueValues: 3, nullCount: 80 },
      { name: "name", type: "string", uniqueValues: 100, nullCount: 0 },
    ],
  };

  it("still valid without profile (backward compatible)", () => {
    const manifest = validManifest({
      style: { markerShape: "circle", mapFamily: "point", colorField: "nonexistent" },
    });
    const result = validateCartographic(manifest);
    expect(result.valid).toBe(true);
  });

  it("returns error when colorField not found in profile", () => {
    const manifest = validManifest({
      style: { markerShape: "circle", mapFamily: "point", colorField: "nonexistent" },
    });
    const result = validateCartographic(manifest, testProfile);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": colorField "nonexistent" not found in dataset attributes'
    );
  });

  it("accepts colorField that exists in profile", () => {
    const manifest = validManifest({
      style: { markerShape: "circle", mapFamily: "point", colorField: "region" },
    });
    const result = validateCartographic(manifest, testProfile);
    expect(result.errors).not.toContainEqual(
      expect.stringContaining("colorField")
    );
  });

  it("returns error when sizeField not found in profile", () => {
    const manifest = validManifest({
      style: { markerShape: "circle", mapFamily: "proportional-symbol", sizeField: "gdp", colorField: "region" },
    });
    const result = validateCartographic(manifest, testProfile);
    expect(result.errors).toContain(
      'Layer "layer-1": sizeField "gdp" not found in dataset attributes'
    );
  });

  it("returns warning when sizeField is not numeric", () => {
    const manifest = validManifest({
      style: { markerShape: "circle", mapFamily: "proportional-symbol", sizeField: "region" },
    });
    const result = validateCartographic(manifest, testProfile);
    expect(result.warnings).toContain(
      'Layer "layer-1": sizeField "region" is string, expected number'
    );
  });

  it("returns error when tooltipField not found in profile", () => {
    const manifest = validManifest({
      style: { markerShape: "circle", mapFamily: "point" },
      interaction: { tooltipFields: ["name", "nonexistent_field"] },
    });
    const result = validateCartographic(manifest, testProfile);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": tooltipField "nonexistent_field" not found in dataset attributes'
    );
  });

  it("accepts tooltipFields that all exist in profile", () => {
    const manifest = validManifest({
      style: { markerShape: "circle", mapFamily: "point" },
      interaction: { tooltipFields: ["name", "population", "region"] },
    });
    const result = validateCartographic(manifest, testProfile);
    expect(result.errors).not.toContainEqual(
      expect.stringContaining("tooltipField")
    );
  });

  it("returns error when normalization.field not found in profile", () => {
    const manifest = validManifest({
      geometryType: "polygon",
      style: {
        markerShape: "circle",
        mapFamily: "choropleth",
        colorField: "population",
        normalization: { field: "nonexistent_area", method: "per-area" },
      },
    });
    const result = validateCartographic(manifest, testProfile);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": normalization.field "nonexistent_area" not found in dataset attributes'
    );
  });

  it("accepts normalization.field that exists in profile", () => {
    const manifest = validManifest({
      geometryType: "polygon",
      style: {
        markerShape: "circle",
        mapFamily: "choropleth",
        colorField: "population",
        normalization: { field: "population", method: "per-area" },
      },
    });
    const result = validateCartographic(manifest, testProfile);
    expect(result.errors).not.toContainEqual(
      expect.stringContaining("normalization.field")
    );
  });

  it("returns error when flow.weightField not found in profile", () => {
    const manifest = validManifest({
      geometryType: "line",
      style: { markerShape: "circle", mapFamily: "flow" },
      flow: { originField: "name", destinationField: "region", weightField: "volume" },
    });
    const result = validateCartographic(manifest, testProfile);
    expect(result.errors).toContain(
      'Layer "layer-1": flow.weightField "volume" not found in dataset attributes'
    );
  });

  it("returns warning when flow.weightField is not numeric", () => {
    const manifest = validManifest({
      geometryType: "line",
      style: { markerShape: "circle", mapFamily: "flow" },
      flow: { originField: "name", destinationField: "region", weightField: "region" },
    });
    const result = validateCartographic(manifest, testProfile);
    expect(result.warnings).toContain(
      'Layer "layer-1": flow.weightField "region" is string, expected number'
    );
  });

  it("returns error when flow.originField not found in profile", () => {
    const manifest = validManifest({
      geometryType: "line",
      style: { markerShape: "circle", mapFamily: "flow" },
      flow: { originField: "source_city", destinationField: "region" },
    });
    const result = validateCartographic(manifest, testProfile);
    expect(result.errors).toContain(
      'Layer "layer-1": flow.originField "source_city" not found in dataset attributes'
    );
  });

  it("returns warning when colorField has high null rate", () => {
    const manifest = validManifest({
      style: { markerShape: "circle", mapFamily: "point", colorField: "sparse_field" },
    });
    const result = validateCartographic(manifest, testProfile);
    expect(result.warnings).toContain(
      'Layer "layer-1": colorField "sparse_field" has >50% null values'
    );
  });

  it("returns warning for large point dataset without clustering", () => {
    const largeProfile: DatasetProfile = {
      ...testProfile,
      featureCount: 2000,
    };
    const manifest = validManifest({
      style: { markerShape: "circle", mapFamily: "point", clusterEnabled: false },
    });
    const result = validateCartographic(manifest, largeProfile);
    expect(result.warnings).toContain(
      'Layer "layer-1": 2000 features without clustering — consider cluster or heatmap'
    );
  });

  it("does not warn about clustering when cluster is enabled", () => {
    const largeProfile: DatasetProfile = {
      ...testProfile,
      featureCount: 2000,
    };
    const manifest = validManifest({
      style: { markerShape: "circle", mapFamily: "point", clusterEnabled: true },
    });
    const result = validateCartographic(manifest, largeProfile);
    expect(result.warnings).not.toContainEqual(
      expect.stringContaining("without clustering")
    );
  });

  it("does not warn about clustering for small datasets", () => {
    const smallProfile: DatasetProfile = {
      ...testProfile,
      featureCount: 50,
    };
    const manifest = validManifest({
      style: { markerShape: "circle", mapFamily: "point", clusterEnabled: false },
    });
    const result = validateCartographic(manifest, smallProfile);
    expect(result.warnings).not.toContainEqual(
      expect.stringContaining("without clustering")
    );
  });
});
