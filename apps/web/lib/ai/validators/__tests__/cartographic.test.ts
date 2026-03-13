import { describe, it, expect } from "vitest";
import { validateCartographic } from "../cartographic";
import type { MapManifest } from "@atlas/data-models";

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
});
