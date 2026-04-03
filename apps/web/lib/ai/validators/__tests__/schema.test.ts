import { describe, it, expect } from "vitest";
import { validateSchema } from "../schema";
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

describe("validateSchema", () => {
  it("returns valid for a complete manifest", () => {
    const manifest = validManifest();
    const result = validateSchema(manifest);
    expect(result).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });
  });

  it("returns error when id is missing", () => {
    const manifest = validManifest();
    manifest.id = "";
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing required field: id");
  });

  it("returns error when title is missing", () => {
    const manifest = validManifest();
    manifest.title = "";
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing required field: title");
  });

  it("returns error when layers array is empty", () => {
    const manifest = validManifest();
    manifest.layers = [];
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Manifest must have at least one layer");
  });

  it("returns error when layers is undefined", () => {
    const manifest = validManifest();
    (manifest as any).layers = undefined;
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Manifest must have at least one layer");
  });

  it("returns error when layer is missing id", () => {
    const manifest = validManifest();
    (manifest.layers[0] as any).id = "";
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Layer missing id");
  });

  it("returns error for duplicate layer ids", () => {
    const manifest = validManifest();
    manifest.layers.push({
      id: "layer-1",
      kind: "asset",
      label: "Duplicate",
      sourceType: "geojson-static",
      style: {
        markerShape: "circle",
        mapFamily: "point",
        color: { scheme: "blues" },
      },
    } as any);
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Duplicate layer id: "layer-1"');
  });

  it("returns error when layer is missing style", () => {
    const manifest = validManifest();
    (manifest.layers[0] as any).style = undefined;
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Layer "layer-1": missing style');
  });

  it("returns error when classification classes is 0", () => {
    const manifest = validManifest({
      style: {
        markerShape: "circle",
        mapFamily: "choropleth",
        classification: { method: "quantile", classes: 0 },
      },
    });
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": classification classes must be 2–9, got 0'
    );
  });

  it("returns error when classification classes is 1", () => {
    const manifest = validManifest({
      style: {
        markerShape: "circle",
        mapFamily: "choropleth",
        classification: { method: "quantile", classes: 1 },
      },
    });
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": classification classes must be 2–9, got 1'
    );
  });

  it("returns error when classification classes is 8", () => {
    const manifest = validManifest({
      style: {
        markerShape: "circle",
        mapFamily: "choropleth",
        classification: { method: "quantile", classes: 10 },
      },
    });
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": classification classes must be 2–9, got 10'
    );
  });

  it("returns error for unknown color scheme", () => {
    const manifest = validManifest({
      style: {
        markerShape: "circle",
        mapFamily: "point",
        color: { scheme: "rainbow-unicorn" as any },
      },
    });
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": unknown color scheme "rainbow-unicorn"'
    );
  });

  it("returns error when fillOpacity is negative", () => {
    const manifest = validManifest({
      style: {
        markerShape: "circle",
        mapFamily: "point",
        fillOpacity: -0.5,
      },
    });
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": fillOpacity must be 0–1, got -0.5'
    );
  });

  it("returns error when fillOpacity is greater than 1", () => {
    const manifest = validManifest({
      style: {
        markerShape: "circle",
        mapFamily: "point",
        fillOpacity: 1.5,
      },
    });
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": fillOpacity must be 0–1, got 1.5'
    );
  });

  it("returns error when strokeWidth is negative", () => {
    const manifest = validManifest({
      style: {
        markerShape: "circle",
        mapFamily: "point",
        strokeWidth: -2,
      },
    });
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": strokeWidth must be ≥ 0'
    );
  });

  it("returns error when flow family has no flow config", () => {
    const manifest = validManifest({
      style: {
        markerShape: "circle",
        mapFamily: "flow",
      },
    });
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": flow family requires a flow config'
    );
  });

  it("returns error when flow config is missing originField", () => {
    const manifest = validManifest({
      style: {
        markerShape: "circle",
        mapFamily: "flow",
      },
      flow: {
        destinationField: "dest",
      },
    });
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": flow.originField is required'
    );
  });

  it("returns error when flow config is missing destinationField", () => {
    const manifest = validManifest({
      style: {
        markerShape: "circle",
        mapFamily: "flow",
      },
      flow: {
        originField: "origin",
      },
    });
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": flow.destinationField is required'
    );
  });

  it("returns error when flow minWidth is negative", () => {
    const manifest = validManifest({
      style: {
        markerShape: "circle",
        mapFamily: "flow",
      },
      flow: {
        originField: "origin",
        destinationField: "dest",
        minWidth: -1,
      },
    });
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": flow.minWidth must be ≥ 0'
    );
  });

  it("returns error when flow maxWidth is negative", () => {
    const manifest = validManifest({
      style: {
        markerShape: "circle",
        mapFamily: "flow",
      },
      flow: {
        originField: "origin",
        destinationField: "dest",
        maxWidth: -5,
      },
    });
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": flow.maxWidth must be ≥ 0'
    );
  });

  it("returns error when isochrone family has no isochrone config", () => {
    const manifest = validManifest({
      style: {
        markerShape: "circle",
        mapFamily: "isochrone",
      },
    });
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": isochrone family requires an isochrone config'
    );
  });

  it("returns error when isochrone has unknown travel mode", () => {
    const manifest = validManifest({
      style: {
        markerShape: "circle",
        mapFamily: "isochrone",
      },
      isochrone: {
        mode: "flying" as any,
        breakpoints: [5, 10, 15],
      },
    });
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": unknown travel mode "flying"'
    );
  });

  it("returns error when isochrone breakpoints is empty", () => {
    const manifest = validManifest({
      style: {
        markerShape: "circle",
        mapFamily: "isochrone",
      },
      isochrone: {
        mode: "driving",
        breakpoints: [],
      },
    });
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": isochrone.breakpoints must be a non-empty array'
    );
  });

  it("returns error when isochrone breakpoint is zero", () => {
    const manifest = validManifest({
      style: {
        markerShape: "circle",
        mapFamily: "isochrone",
      },
      isochrone: {
        mode: "driving",
        breakpoints: [5, 0, 15],
      },
    });
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": isochrone.breakpoints must be positive numbers'
    );
  });

  it("returns error when isochrone breakpoint is negative", () => {
    const manifest = validManifest({
      style: {
        markerShape: "circle",
        mapFamily: "isochrone",
      },
      isochrone: {
        mode: "driving",
        breakpoints: [5, -10, 15],
      },
    });
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": isochrone.breakpoints must be positive numbers'
    );
  });

  it("returns error when isochrone unit is invalid", () => {
    const manifest = validManifest({
      style: {
        markerShape: "circle",
        mapFamily: "isochrone",
      },
      isochrone: {
        mode: "driving",
        breakpoints: [5, 10, 15],
        unit: "miles" as any,
      },
    });
    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-1": isochrone.unit must be "minutes" or "kilometers"'
    );
  });

  it("accepts valid flow manifest", () => {
    const manifest = validManifest({
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
    });
    const result = validateSchema(manifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts valid isochrone manifest", () => {
    const manifest = validManifest({
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
    });
    const result = validateSchema(manifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a non-primary layer with a different sourceUrl", () => {
    const manifest: MapManifest = {
      id: "multi-source-map",
      title: "Multi-source map",
      description: "Should fail until Atlas supports per-layer data loading",
      theme: "explore",
      defaultCenter: [0, 0],
      defaultZoom: 5,
      layers: [
        {
          id: "layer-1",
          kind: "asset",
          label: "Primary",
          sourceType: "geojson-url",
          sourceUrl: "https://example.com/a.geojson",
          geometryType: "polygon",
          style: {
            markerShape: "circle",
            mapFamily: "choropleth",
            colorField: "value",
          },
        },
        {
          id: "layer-2",
          kind: "asset",
          label: "Secondary",
          sourceType: "geojson-url",
          sourceUrl: "https://example.com/b.geojson",
          geometryType: "polygon",
          style: {
            markerShape: "circle",
            mapFamily: "choropleth",
            colorField: "value",
          },
        },
      ],
    };

    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-2": sourceUrl differs from the primary layer; Atlas currently supports one primary dataset per map',
    );
  });

  it("rejects a non-primary layer sourceUrl when the primary layer has none", () => {
    const manifest: MapManifest = {
      id: "late-source-map",
      title: "Late source map",
      description: "Secondary layer should not introduce the only URL-backed dataset",
      theme: "explore",
      defaultCenter: [0, 0],
      defaultZoom: 5,
      layers: [
        {
          id: "layer-1",
          kind: "asset",
          label: "Primary",
          sourceType: "geojson-static",
          geometryType: "polygon",
          style: {
            markerShape: "circle",
            mapFamily: "choropleth",
            colorField: "value",
          },
        },
        {
          id: "layer-2",
          kind: "asset",
          label: "Secondary",
          sourceType: "geojson-url",
          sourceUrl: "https://example.com/b.geojson",
          geometryType: "polygon",
          style: {
            markerShape: "circle",
            mapFamily: "choropleth",
            colorField: "value",
          },
        },
      ],
    };

    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Layer "layer-2": non-primary layers cannot declare sourceUrl when the primary layer has none; Atlas currently loads one primary dataset per map',
    );
  });

  it("warns when a non-primary layer duplicates the primary sourceUrl", () => {
    const manifest: MapManifest = {
      id: "duplicate-source-map",
      title: "Duplicate source map",
      description: "Redundant per-layer sourceUrl should not be treated as a separate data path",
      theme: "explore",
      defaultCenter: [0, 0],
      defaultZoom: 5,
      layers: [
        {
          id: "layer-1",
          kind: "asset",
          label: "Primary",
          sourceType: "geojson-url",
          sourceUrl: "https://example.com/a.geojson",
          geometryType: "polygon",
          style: {
            markerShape: "circle",
            mapFamily: "choropleth",
            colorField: "value",
          },
        },
        {
          id: "layer-2",
          kind: "asset",
          label: "Secondary",
          sourceType: "geojson-url",
          sourceUrl: "https://example.com/a.geojson",
          geometryType: "polygon",
          style: {
            markerShape: "circle",
            mapFamily: "choropleth",
            colorField: "value",
          },
        },
      ],
    };

    const result = validateSchema(manifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain(
      'Layer "layer-2": sourceUrl duplicates the primary layer and will be ignored at runtime',
    );
  });
});
