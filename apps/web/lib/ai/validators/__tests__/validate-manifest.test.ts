import { describe, it, expect } from "vitest";
import { validateManifest } from "../index";
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

describe("validateManifest", () => {
  it("returns valid for a complete manifest", () => {
    const manifest = validManifest();
    const result = validateManifest(manifest);
    expect(result).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });
  });

  it("returns invalid when schema validation fails", () => {
    const manifest = validManifest();
    manifest.id = "";
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing required field: id");
  });

  it("returns invalid when cartographic validation fails", () => {
    const manifest = validManifest({
      geometryType: "point",
      style: {
        markerShape: "circle",
        mapFamily: "choropleth",
        colorField: "population",
      },
    });
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": choropleth requires polygon geometry, got "point"'
    );
  });

  it("merges errors from both schema and cartographic validation", () => {
    const manifest = validManifest({
      geometryType: "point",
      style: {
        markerShape: "circle",
        mapFamily: "choropleth",
        fillOpacity: 2.5,
      },
    });
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": fillOpacity must be 0–1, got 2.5'
    );
    expect(result.errors).toContain(
      'Layer "layer-1": choropleth requires polygon geometry, got "point"'
    );
    expect(result.errors.length).toBe(2);
  });

  it("returns valid with warnings when only warnings are present", () => {
    const manifest = validManifest({
      geometryType: "polygon",
      style: {
        markerShape: "circle",
        mapFamily: "choropleth",
        colorField: "population",
        color: {
          scheme: "blues",
          colorblindSafe: true,
        },
      },
    });
    const result = validateManifest(manifest);
    expect(result.valid).toBe(true);
    expect(result.warnings).toContain(
      'Layer "layer-1": choropleth without normalization — raw counts may be misleading'
    );
  });

  it("merges warnings from both schema and cartographic validation", () => {
    const manifest = validManifest({
      geometryType: "polygon",
      style: {
        markerShape: "circle",
        mapFamily: "isochrone",
        color: {
          scheme: "blues",
          colorblindSafe: false,
        },
      },
      isochrone: {
        mode: "driving",
        breakpoints: [15, 5, 10],
      },
    });
    const result = validateManifest(manifest);
    expect(result.valid).toBe(true);
    expect(result.warnings).toContain(
      'Layer "layer-1": colorblindSafe is disabled — map may be inaccessible'
    );
    expect(result.warnings).toContain(
      'Layer "layer-1": isochrone breakpoints should be sorted ascending'
    );
    expect(result.warnings.length).toBe(2);
  });

  it("handles complex multi-layer manifests with mixed validation results", () => {
    const manifest: MapManifest = {
      id: "complex-map",
      title: "Complex Test Map",
      description: "Testing multiple layers",
      theme: "explore",
      defaultCenter: [0, 0],
      defaultZoom: 5,
      layers: [
        {
          id: "layer-valid",
          kind: "asset",
          label: "Valid Layer",
          sourceType: "geojson-static",
          geometryType: "point",
          style: {
            markerShape: "circle",
            mapFamily: "point",
            color: { scheme: "blues", colorblindSafe: true },
          },
        },
        {
          id: "layer-warning",
          kind: "asset",
          label: "Warning Layer",
          sourceType: "geojson-static",
          geometryType: "polygon",
          style: {
            markerShape: "circle",
            mapFamily: "choropleth",
            colorField: "population",
            color: { scheme: "blues", colorblindSafe: false },
          },
        },
        {
          id: "layer-error",
          kind: "asset",
          label: "Error Layer",
          sourceType: "geojson-static",
          geometryType: "point",
          style: {
            markerShape: "circle",
            mapFamily: "proportional-symbol",
            colorField: "category",
          },
        },
      ],
    };
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-error": proportional-symbol requires sizeField'
    );
    expect(result.warnings).toContain(
      'Layer "layer-warning": choropleth without normalization — raw counts may be misleading'
    );
    expect(result.warnings).toContain(
      'Layer "layer-warning": colorblindSafe is disabled — map may be inaccessible'
    );
  });

  it("validates flow and isochrone families comprehensively", () => {
    const manifest: MapManifest = {
      id: "advanced-map",
      title: "Advanced Map",
      description: "Flow and isochrone testing",
      theme: "explore",
      defaultCenter: [0, 0],
      defaultZoom: 5,
      layers: [
        {
          id: "flow-layer",
          kind: "asset",
          label: "Flow",
          sourceType: "geojson-static",
          geometryType: "line",
          style: {
            markerShape: "circle",
            mapFamily: "flow",
          },
          flow: {
            originField: "origin",
            destinationField: "dest",
            weightField: "volume",
            minWidth: 1,
            maxWidth: 8,
          },
        },
        {
          id: "isochrone-layer",
          kind: "asset",
          label: "Isochrone",
          sourceType: "geojson-static",
          geometryType: "polygon",
          style: {
            markerShape: "circle",
            mapFamily: "isochrone",
          },
          isochrone: {
            mode: "walking",
            breakpoints: [5, 10, 15, 30],
            unit: "minutes",
          },
        },
      ],
    };
    const result = validateManifest(manifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
