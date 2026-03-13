import { describe, it, expect } from "vitest";
import { compileLayer } from "../manifest-compiler";
import type { LayerManifest } from "@atlas/data-models";
import type {
  CircleLayerSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
  HeatmapLayerSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";

// ─── Test fixtures ──────────────────────────────────────────────

function pt(
  lng: number,
  lat: number,
  props: Record<string, unknown>,
): GeoJSON.Feature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: props,
  };
}

function poly(
  ring: [number, number][],
  props: Record<string, unknown>,
): GeoJSON.Feature {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [ring] },
    properties: props,
  };
}

function line(
  coords: [number, number][],
  props: Record<string, unknown>,
): GeoJSON.Feature {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: coords },
    properties: props,
  };
}

function fc(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features };
}

function rect(
  w: number,
  s: number,
  e: number,
  n: number,
): [number, number][] {
  return [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ];
}

// ─── Test suite ─────────────────────────────────────────────────

describe("manifest-compiler", () => {
  describe("point family", () => {
    it("compiles point layer with categorical colorField", () => {
      const layer: LayerManifest = {
        id: "test-point",
        kind: "asset",
        label: "Test Points",
        sourceType: "geojson-static",
        geometryType: "point",
        style: {
          markerShape: "circle",
          mapFamily: "point",
          colorField: "type",
          color: { scheme: "set2", colorblindSafe: true },
        },
      };

      const data = fc([
        pt(10, 60, { type: "capital" }),
        pt(11, 61, { type: "nordic" }),
        pt(12, 62, { type: "capital" }),
      ]);

      const result = compileLayer(layer, data);

      expect(result.sourceId).toBe("test-point-source");
      expect(result.sourceConfig.type).toBe("geojson");
      expect(result.sourceConfig.data).toBe(data);
      expect(result.layers).toHaveLength(2);

      const pointsLayer = result.layers[0] as CircleLayerSpecification;
      const highlightLayer = result.layers[1] as CircleLayerSpecification;
      expect(pointsLayer.id).toBe("test-point-points");
      expect(pointsLayer.type).toBe("circle");
      expect(pointsLayer.source).toBe("test-point-source");
      expect(Array.isArray(pointsLayer.paint?.["circle-color"])).toBe(true);

      expect(highlightLayer.id).toBe("test-point-highlight");
      expect(highlightLayer.type).toBe("circle");
      expect(highlightLayer.source).toBe("test-point-source");

      expect(result.legendItems.length).toBeGreaterThan(0);
      result.legendItems.forEach((item) => {
        expect(item.color).toMatch(/^#[0-9a-f]{6}$/i);
        expect(item.shape).toBe("circle");
      });
    });

    it("compiles point layer without colorField", () => {
      const layer: LayerManifest = {
        id: "simple-points",
        kind: "asset",
        label: "Simple Points",
        sourceType: "geojson-static",
        style: {
          markerShape: "circle",
          mapFamily: "point",
          color: { scheme: "blues" },
        },
      };

      const data = fc([pt(10, 60, {}), pt(11, 61, {})]);

      const result = compileLayer(layer, data);

      expect(result.layers).toHaveLength(2);
      expect(result.legendItems).toHaveLength(1);
      expect(result.legendItems[0].label).toBe("Simple Points");
      expect(result.legendItems[0].shape).toBe("circle");
    });
  });

  describe("cluster family", () => {
    it("compiles cluster layer with source clustering config", () => {
      const layer: LayerManifest = {
        id: "test-cluster",
        kind: "event",
        label: "Test Clusters",
        sourceType: "geojson-static",
        geometryType: "point",
        style: {
          markerShape: "circle",
          mapFamily: "cluster",
          colorField: "severity",
          clusterRadius: 50,
          color: { scheme: "reds" },
        },
      };

      const data = fc([
        pt(10, 60, { severity: "high" }),
        pt(10.01, 60.01, { severity: "medium" }),
        pt(11, 61, { severity: "low" }),
      ]);

      const result = compileLayer(layer, data);

      expect(result.sourceId).toBe("test-cluster-source");
      expect(result.sourceConfig.type).toBe("geojson");
      expect(result.sourceConfig.cluster).toBe(true);
      expect(result.sourceConfig.clusterRadius).toBe(50);
      expect(result.sourceConfig.clusterMaxZoom).toBe(14);

      expect(result.layers).toHaveLength(3);

      const clustersLayer = result.layers[0] as CircleLayerSpecification;
      const countLayer = result.layers[1] as SymbolLayerSpecification;
      const pointsLayer = result.layers[2] as CircleLayerSpecification;
      expect(clustersLayer.id).toBe("test-cluster-clusters");
      expect(clustersLayer.type).toBe("circle");
      expect(clustersLayer.filter).toEqual(["has", "point_count"]);

      expect(countLayer.id).toBe("test-cluster-cluster-count");
      expect(countLayer.type).toBe("symbol");
      expect(countLayer.filter).toEqual(["has", "point_count"]);

      expect(pointsLayer.id).toBe("test-cluster-points");
      expect(pointsLayer.type).toBe("circle");
      expect(pointsLayer.filter).toEqual(["!", ["has", "point_count"]]);

      expect(result.legendItems.length).toBeGreaterThan(0);
    });
  });

  describe("choropleth family", () => {
    it("compiles choropleth layer with numeric classification", () => {
      const layer: LayerManifest = {
        id: "test-choropleth",
        kind: "asset",
        label: "Test Choropleth",
        sourceType: "geojson-static",
        geometryType: "polygon",
        style: {
          markerShape: "circle",
          mapFamily: "choropleth",
          colorField: "density",
          classification: { method: "quantile", classes: 5 },
          color: { scheme: "viridis" },
        },
      };

      const data = fc([
        poly(rect(10, 60, 11, 61), { density: 94 }),
        poly(rect(11, 60, 12, 61), { density: 119 }),
        poly(rect(12, 60, 13, 61), { density: 206 }),
        poly(rect(13, 60, 14, 61), { density: 350 }),
        poly(rect(14, 60, 15, 61), { density: 521 }),
      ]);

      const result = compileLayer(layer, data);

      expect(result.sourceId).toBe("test-choropleth-source");
      expect(result.layers).toHaveLength(3);

      const fillLayer = result.layers[0] as FillLayerSpecification;
      const strokeLayer = result.layers[1] as LineLayerSpecification;
      const highlightLayer = result.layers[2] as FillLayerSpecification;
      expect(fillLayer.id).toBe("test-choropleth-fill");
      expect(fillLayer.type).toBe("fill");
      expect(fillLayer.source).toBe("test-choropleth-source");
      expect(Array.isArray(fillLayer.paint?.["fill-color"])).toBe(true);

      expect(strokeLayer.id).toBe("test-choropleth-stroke");
      expect(strokeLayer.type).toBe("line");

      expect(highlightLayer.id).toBe("test-choropleth-highlight");
      expect(highlightLayer.type).toBe("fill");

      expect(result.legendItems.length).toBeGreaterThan(0);
      result.legendItems.forEach((item) => {
        expect(item.label).toMatch(/\d+\s*–\s*\d+/);
        expect(item.shape).toBe("square");
        expect(item.color).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });

    it("compiles choropleth without colorField", () => {
      const layer: LayerManifest = {
        id: "simple-choropleth",
        kind: "asset",
        label: "Simple Choropleth",
        sourceType: "geojson-static",
        style: {
          markerShape: "circle",
          mapFamily: "choropleth",
          color: { scheme: "greens" },
        },
      };

      const data = fc([poly(rect(10, 60, 11, 61), {})]);

      const result = compileLayer(layer, data);

      expect(result.layers).toHaveLength(3);
      expect(result.legendItems).toHaveLength(1);
    });
  });

  describe("heatmap family", () => {
    it("compiles heatmap layer with sizeField", () => {
      const layer: LayerManifest = {
        id: "test-heatmap",
        kind: "event",
        label: "Test Heatmap",
        sourceType: "geojson-static",
        geometryType: "point",
        style: {
          markerShape: "circle",
          mapFamily: "heatmap",
          sizeField: "weight",
          maxZoom: 10,
          color: { scheme: "inferno" },
        },
      };

      const data = fc([
        pt(10, 60, { weight: 5 }),
        pt(10.5, 60.5, { weight: 10 }),
        pt(11, 61, { weight: 15 }),
      ]);

      const result = compileLayer(layer, data);

      expect(result.sourceId).toBe("test-heatmap-source");
      expect(result.layers).toHaveLength(1);

      const heatmapLayer = result.layers[0] as HeatmapLayerSpecification;
      expect(heatmapLayer.id).toBe("test-heatmap-heatmap");
      expect(heatmapLayer.type).toBe("heatmap");
      expect(heatmapLayer.source).toBe("test-heatmap-source");
      expect(heatmapLayer.maxzoom).toBe(10);
      expect(Array.isArray(heatmapLayer.paint?.["heatmap-weight"])).toBe(true);

      expect(result.legendItems).toHaveLength(3);
      expect(result.legendItems[0].label).toBe("Low density");
      expect(result.legendItems[1].label).toBe("Medium density");
      expect(result.legendItems[2].label).toBe("High density");
      result.legendItems.forEach((item) => {
        expect(item.shape).toBe("square");
      });
    });

    it("compiles heatmap without sizeField", () => {
      const layer: LayerManifest = {
        id: "simple-heatmap",
        kind: "event",
        label: "Simple Heatmap",
        sourceType: "geojson-static",
        style: {
          markerShape: "circle",
          mapFamily: "heatmap",
        },
      };

      const data = fc([pt(10, 60, {}), pt(11, 61, {})]);

      const result = compileLayer(layer, data);

      expect(result.layers).toHaveLength(1);
      const heatmapLayer = result.layers[0] as HeatmapLayerSpecification;
      expect(heatmapLayer.paint?.["heatmap-weight"]).toBe(1);
    });
  });

  describe("proportional-symbol family", () => {
    it("compiles proportional symbol layer with sizeField and colorField", () => {
      const layer: LayerManifest = {
        id: "test-proportional",
        kind: "asset",
        label: "Test Proportional",
        sourceType: "geojson-static",
        geometryType: "point",
        style: {
          markerShape: "circle",
          mapFamily: "proportional-symbol",
          sizeField: "population",
          colorField: "region",
          color: { scheme: "set1" },
        },
      };

      const data = fc([
        pt(10, 60, { population: 1000, region: "north" }),
        pt(11, 61, { population: 5000, region: "south" }),
        pt(12, 62, { population: 10000, region: "north" }),
      ]);

      const result = compileLayer(layer, data);

      expect(result.sourceId).toBe("test-proportional-source");
      expect(result.layers).toHaveLength(2);

      const circlesLayer = result.layers[0] as CircleLayerSpecification;
      const highlightLayer = result.layers[1] as CircleLayerSpecification;
      expect(circlesLayer.id).toBe("test-proportional-circles");
      expect(circlesLayer.type).toBe("circle");
      expect(Array.isArray(circlesLayer.paint?.["circle-radius"])).toBe(true);
      expect(Array.isArray(circlesLayer.paint?.["circle-color"])).toBe(true);

      expect(highlightLayer.id).toBe("test-proportional-highlight");
      expect(highlightLayer.type).toBe("circle");

      expect(result.legendItems.length).toBeGreaterThan(0);
      result.legendItems.forEach((item) => {
        expect(item.shape).toBe("circle");
        expect(item.radius).toBeGreaterThan(0);
      });
    });

    it("compiles proportional symbol without sizeField", () => {
      const layer: LayerManifest = {
        id: "simple-proportional",
        kind: "asset",
        label: "Simple Proportional",
        sourceType: "geojson-static",
        style: {
          markerShape: "circle",
          mapFamily: "proportional-symbol",
        },
      };

      const data = fc([pt(10, 60, {}), pt(11, 61, {})]);

      const result = compileLayer(layer, data);

      expect(result.layers).toHaveLength(2);
      const circlesLayer = result.layers[0] as CircleLayerSpecification;
      expect(circlesLayer.paint?.["circle-radius"]).toBe(6);
    });
  });

  describe("flow family", () => {
    it("compiles flow layer with weightField and arc", () => {
      const layer: LayerManifest = {
        id: "test-flow",
        kind: "asset",
        label: "Test Flow",
        sourceType: "geojson-static",
        geometryType: "line",
        style: {
          markerShape: "circle",
          mapFamily: "flow",
          colorField: "type",
          color: { scheme: "paired" },
        },
        flow: {
          originField: "from",
          destinationField: "to",
          weightField: "volume",
          arc: true,
          minWidth: 1,
          maxWidth: 10,
        },
      };

      const data = fc([
        line(
          [
            [10, 60],
            [15, 65],
          ],
          { from: "A", to: "B", volume: 100, type: "export" },
        ),
        line(
          [
            [11, 61],
            [16, 66],
          ],
          { from: "C", to: "D", volume: 500, type: "import" },
        ),
      ]);

      const result = compileLayer(layer, data);

      expect(result.sourceId).toBe("test-flow-source");
      expect(result.layers).toHaveLength(2);

      const linesLayer = result.layers[0] as LineLayerSpecification;
      const highlightLayer = result.layers[1] as LineLayerSpecification;
      expect(linesLayer.id).toBe("test-flow-lines");
      expect(linesLayer.type).toBe("line");
      expect(linesLayer.source).toBe("test-flow-source");
      expect(Array.isArray(linesLayer.paint?.["line-width"])).toBe(true);
      expect(Array.isArray(linesLayer.paint?.["line-color"])).toBe(true);

      expect(highlightLayer.id).toBe("test-flow-highlight");
      expect(highlightLayer.type).toBe("line");

      // Arc interpolation should add coordinates
      const features = (
        result.sourceConfig.data as GeoJSON.FeatureCollection
      ).features;
      features.forEach((f) => {
        if (f.geometry.type === "LineString") {
          expect(f.geometry.coordinates.length).toBeGreaterThan(2);
        }
      });

      expect(result.legendItems.length).toBeGreaterThan(0);
      result.legendItems.forEach((item) => {
        expect(item.shape).toBe("line");
      });
    });

    it("compiles flow layer without arc or weightField", () => {
      const layer: LayerManifest = {
        id: "simple-flow",
        kind: "asset",
        label: "Simple Flow",
        sourceType: "geojson-static",
        style: {
          markerShape: "circle",
          mapFamily: "flow",
        },
        flow: {
          originField: "from",
          destinationField: "to",
        },
      };

      const data = fc([
        line(
          [
            [10, 60],
            [15, 65],
          ],
          { from: "A", to: "B" },
        ),
      ]);

      const result = compileLayer(layer, data);

      expect(result.layers).toHaveLength(2);
      expect(result.sourceConfig.data).toBe(data);
      const linesLayer = result.layers[0] as LineLayerSpecification;
      expect(typeof linesLayer.paint?.["line-width"]).toBe("number");
    });
  });

  describe("isochrone family", () => {
    it("compiles isochrone layer with breakpoints", () => {
      const layer: LayerManifest = {
        id: "test-isochrone",
        kind: "asset",
        label: "Test Isochrone",
        sourceType: "geojson-static",
        geometryType: "polygon",
        style: {
          markerShape: "circle",
          mapFamily: "isochrone",
          color: { scheme: "blues" },
        },
        isochrone: {
          mode: "cycling",
          breakpoints: [10, 20, 30],
          unit: "minutes",
        },
      };

      const data = fc([
        poly(rect(10, 60, 11, 61), { value: 10 }),
        poly(rect(9, 59, 12, 62), { value: 20 }),
        poly(rect(8, 58, 13, 63), { value: 30 }),
      ]);

      const result = compileLayer(layer, data);

      expect(result.sourceId).toBe("test-isochrone-source");
      expect(result.layers).toHaveLength(3);

      const fillLayer = result.layers[0] as FillLayerSpecification;
      const strokeLayer = result.layers[1] as LineLayerSpecification;
      const highlightLayer = result.layers[2] as FillLayerSpecification;
      expect(fillLayer.id).toBe("test-isochrone-fill");
      expect(fillLayer.type).toBe("fill");
      expect(Array.isArray(fillLayer.paint?.["fill-color"])).toBe(true);

      expect(strokeLayer.id).toBe("test-isochrone-stroke");
      expect(strokeLayer.type).toBe("line");

      expect(highlightLayer.id).toBe("test-isochrone-highlight");
      expect(highlightLayer.type).toBe("fill");

      expect(result.legendItems).toHaveLength(3);
      expect(result.legendItems[0].label).toBe("≤ 10 min");
      expect(result.legendItems[1].label).toBe("≤ 20 min");
      expect(result.legendItems[2].label).toBe("≤ 30 min");
      result.legendItems.forEach((item) => {
        expect(item.shape).toBe("square");
        expect(item.color).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });

    it("compiles isochrone with kilometers unit", () => {
      const layer: LayerManifest = {
        id: "km-isochrone",
        kind: "asset",
        label: "KM Isochrone",
        sourceType: "geojson-static",
        style: {
          markerShape: "circle",
          mapFamily: "isochrone",
        },
        isochrone: {
          mode: "walking",
          breakpoints: [1, 2, 5],
          unit: "kilometers",
        },
      };

      const data = fc([poly(rect(10, 60, 11, 61), { value: 1 })]);

      const result = compileLayer(layer, data);

      expect(result.legendItems[0].label).toBe("≤ 1 km");
    });
  });

  describe("edge cases", () => {
    it("handles empty FeatureCollection for all families", () => {
      const families = [
        "point",
        "cluster",
        "choropleth",
        "heatmap",
        "proportional-symbol",
        "flow",
        "isochrone",
      ] as const;

      families.forEach((family) => {
        const layer: LayerManifest = {
          id: `empty-${family}`,
          kind: "asset",
          label: "Empty",
          sourceType: "geojson-static",
          style: {
            markerShape: "circle",
            mapFamily: family,
          },
          ...(family === "flow" && {
            flow: { originField: "from", destinationField: "to" },
          }),
          ...(family === "isochrone" && {
            isochrone: { mode: "cycling", breakpoints: [10, 20] },
          }),
        };

        const data = fc([]);

        expect(() => compileLayer(layer, data)).not.toThrow();
        const result = compileLayer(layer, data);
        expect(result.sourceId).toBeTruthy();
        expect(result.layers.length).toBeGreaterThan(0);
      });
    });

    it("handles single feature", () => {
      const layer: LayerManifest = {
        id: "single-point",
        kind: "asset",
        label: "Single Point",
        sourceType: "geojson-static",
        style: {
          markerShape: "circle",
          mapFamily: "point",
          colorField: "type",
        },
      };

      const data = fc([pt(10, 60, { type: "single" })]);

      const result = compileLayer(layer, data);

      expect(result.layers).toHaveLength(2);
      expect(result.legendItems.length).toBeGreaterThan(0);
    });

    it("handles numeric colorField with all same values", () => {
      const layer: LayerManifest = {
        id: "uniform-choropleth",
        kind: "asset",
        label: "Uniform",
        sourceType: "geojson-static",
        style: {
          markerShape: "circle",
          mapFamily: "choropleth",
          colorField: "density",
          classification: { method: "quantile", classes: 5 },
        },
      };

      const data = fc([
        poly(rect(10, 60, 11, 61), { density: 100 }),
        poly(rect(11, 60, 12, 61), { density: 100 }),
        poly(rect(12, 60, 13, 61), { density: 100 }),
      ]);

      const result = compileLayer(layer, data);

      expect(result.layers).toHaveLength(3);
      // Should fallback to single color when all values are same
      const fillLayer = result.layers[0] as FillLayerSpecification;
      const fillColor = fillLayer.paint?.["fill-color"];
      expect(typeof fillColor === "string" || Array.isArray(fillColor)).toBe(
        true,
      );
    });

    it("defaults to point family when mapFamily is undefined", () => {
      const layer: LayerManifest = {
        id: "default-family",
        kind: "asset",
        label: "Default",
        sourceType: "geojson-static",
        style: {
          markerShape: "circle",
        },
      };

      const data = fc([pt(10, 60, {})]);

      const result = compileLayer(layer, data);

      expect(result.layers).toHaveLength(2);
      expect(result.layers[0].type).toBe("circle");
      expect(result.layers[0].id).toBe("default-family-points");
    });
  });
});
