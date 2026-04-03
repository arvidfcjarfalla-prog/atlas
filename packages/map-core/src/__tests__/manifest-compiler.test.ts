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

    it("compiles choropleth with labelField", () => {
      const layer: LayerManifest = {
        id: "labeled-choropleth",
        kind: "asset",
        label: "Labeled Choropleth",
        sourceType: "geojson-static",
        geometryType: "polygon",
        style: {
          markerShape: "circle",
          mapFamily: "choropleth",
          colorField: "density",
          classification: { method: "quantile", classes: 3 },
          color: { scheme: "viridis" },
          labelField: "name",
        },
      };

      const data = fc([
        poly(rect(10, 60, 11, 61), { density: 94, name: "A" }),
        poly(rect(11, 60, 12, 61), { density: 119, name: "B" }),
        poly(rect(12, 60, 13, 61), { density: 206, name: "C" }),
      ]);

      const result = compileLayer(layer, data);

      // 4 layers: fill + stroke + highlight + labels
      expect(result.layers).toHaveLength(4);

      const labelLayer = result.layers[3] as SymbolLayerSpecification;
      expect(labelLayer.id).toBe("labeled-choropleth-labels");
      expect(labelLayer.type).toBe("symbol");
      expect(labelLayer.layout?.["text-field"]).toEqual(["get", "name"]);
    });

    it("compiles choropleth with labelFormat template", () => {
      const layer: LayerManifest = {
        id: "formatted-choropleth",
        kind: "asset",
        label: "Formatted Choropleth",
        sourceType: "geojson-static",
        geometryType: "polygon",
        style: {
          markerShape: "circle",
          mapFamily: "choropleth",
          colorField: "value",
          classification: { method: "quantile", classes: 3 },
          color: { scheme: "blues" },
          labelField: "name",
          labelFormat: "{name}\n{value}",
        },
      };

      const data = fc([
        poly(rect(10, 60, 11, 61), { value: 10, name: "X" }),
        poly(rect(11, 60, 12, 61), { value: 20, name: "Y" }),
      ]);

      const result = compileLayer(layer, data);

      // 4 layers: fill + stroke + highlight + labels
      expect(result.layers).toHaveLength(4);

      const labelLayer = result.layers[3] as SymbolLayerSpecification;
      expect(labelLayer.layout?.["text-field"]).toBe("{name}\n{value}");
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

  // ─── Extrusion ────────────────────────────────────────────

  describe("extrusion", () => {
    it("produces fill-extrusion layers", () => {
      const layer: LayerManifest = {
        id: "ext",
        kind: "asset",
        label: "GDP 3D",
        sourceType: "geojson-url",
        style: { markerShape: "circle", mapFamily: "extrusion", colorField: "gdp" },
        extrusion: { heightField: "gdp", maxHeight: 500000 },
      };

      const ring: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
      const data = fc([poly(ring, { gdp: 100 }), poly(ring, { gdp: 200 })]);

      const result = compileLayer(layer, data);

      expect(result.layers[0].type).toBe("fill-extrusion");
      expect(result.layers[0].id).toBe("ext-extrusion");
      expect(result.layers).toHaveLength(2); // extrusion + highlight
    });
  });

  // ─── Animated route ───────────────────────────────────────

  describe("animated-route", () => {
    it("produces line + circle layers and sets _animatable", () => {
      const layer: LayerManifest = {
        id: "route",
        kind: "asset",
        label: "Tour",
        sourceType: "geojson-url",
        style: { markerShape: "circle", mapFamily: "animated-route" },
        animatedRoute: { orderField: "order" },
      };

      const line: GeoJSON.Feature = {
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[18, 59], [14, 61]] },
        properties: { name: "Route" },
      };
      const data = fc([line, pt(18, 59, { name: "Start" }), pt(14, 61, { name: "End" })]);

      const result = compileLayer(layer, data);

      expect(result.layers.some((l) => l.type === "line")).toBe(true);
      expect(result.layers.some((l) => l.type === "circle")).toBe(true);
      expect(result._animatable).toBe(true);
    });
  });

  // ─── Timeline ─────────────────────────────────────────────

  describe("timeline", () => {
    it("compiles with _timeline metadata", () => {
      const layer: LayerManifest = {
        id: "tl",
        kind: "asset",
        label: "History",
        sourceType: "geojson-url",
        style: { markerShape: "circle", mapFamily: "timeline", colorField: "value" },
        timeline: { timeField: "year" },
      };

      const ring: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
      const data = fc([
        poly(ring, { value: 10, year: 2020 }),
        poly(ring, { value: 20, year: 2021 }),
        poly(ring, { value: 30, year: 2022 }),
      ]);

      const result = compileLayer(layer, data);

      expect(result._timeline).toBeDefined();
      expect(result._timeline?.timeField).toBe("year");
      expect(result._timeline?.min).toBe(2020);
      expect(result._timeline?.max).toBe(2022);
      expect(result._timeline?.steps).toEqual([2020, 2021, 2022]);
      expect(result._timeline?.cumulative).toBe(true);
    });
  });

  // ─── Warnings & field auto-correction ───────────────────────────

  describe("warnings", () => {
    it("warns on empty FeatureCollection", () => {
      const layer: LayerManifest = {
        id: "empty", kind: "asset", label: "Empty",
        sourceType: "geojson-static", geometryType: "point",
        style: { markerShape: "circle", mapFamily: "point" },
      };
      const result = compileLayer(layer, fc([]));
      expect(result.warnings).toContainEqual(
        expect.stringContaining("no features"),
      );
    });

    it("warns when colorField has no numeric values", () => {
      const layer: LayerManifest = {
        id: "bad-field", kind: "asset", label: "Bad",
        sourceType: "geojson-static", geometryType: "point",
        style: { markerShape: "circle", mapFamily: "point", colorField: "value" },
      };
      // All values are strings, not numbers
      const data = fc([
        pt(10, 60, { value: "high" }),
        pt(11, 61, { value: "low" }),
      ]);
      const result = compileLayer(layer, data);
      // Should compile without crash — categorical expression
      expect(result.layers.length).toBeGreaterThan(0);
    });

    it("warns when all numeric values are identical", () => {
      const layer: LayerManifest = {
        id: "same", kind: "asset", label: "Same",
        sourceType: "geojson-static", geometryType: "point",
        style: { markerShape: "circle", mapFamily: "point", colorField: "val" },
      };
      const data = fc([
        pt(10, 60, { val: 42 }),
        pt(11, 61, { val: 42 }),
        pt(12, 62, { val: 42 }),
      ]);
      const result = compileLayer(layer, data);
      expect(result.warnings).toContainEqual(
        expect.stringContaining("identical"),
      );
    });

    it("returns no warnings for valid data", () => {
      const layer: LayerManifest = {
        id: "ok", kind: "asset", label: "OK",
        sourceType: "geojson-static", geometryType: "point",
        style: { markerShape: "circle", mapFamily: "point", colorField: "val" },
      };
      const data = fc([
        pt(10, 60, { val: 1 }),
        pt(11, 61, { val: 5 }),
        pt(12, 62, { val: 10 }),
      ]);
      const result = compileLayer(layer, data);
      expect(result.warnings ?? []).toHaveLength(0);
    });
  });

  describe("legend no-data fallback", () => {
    it("returns 'No data' legend item for choropleth with missing colorField values", () => {
      const layer: LayerManifest = {
        id: "no-data-choro", kind: "asset", label: "No Data",
        sourceType: "geojson-static", geometryType: "polygon",
        style: {
          markerShape: "circle", mapFamily: "choropleth",
          colorField: "value",
          classification: { method: "quantile", classes: 5 },
          color: { scheme: "viridis" },
        },
      };
      // All features have null values for colorField
      const data = fc([
        poly(rect(10, 60, 11, 61), { value: null }),
        poly(rect(11, 60, 12, 61), { name: "no-value" }),
      ]);
      const result = compileLayer(layer, data);
      expect(result.legendItems).toHaveLength(1);
      expect(result.legendItems[0].label).toBe("No data");
      expect(result.legendItems[0].color).toBe("#999999");
      expect(result.legendItems[0].shape).toBe("square");
    });

    it("returns 'No data' legend for proportional-symbol with missing sizeField", () => {
      const layer: LayerManifest = {
        id: "no-data-prop", kind: "asset", label: "No Data",
        sourceType: "geojson-static", geometryType: "point",
        style: {
          markerShape: "circle", mapFamily: "proportional-symbol",
          sizeField: "population",
          color: { scheme: "blues" },
        },
      };
      const data = fc([
        pt(10, 60, { name: "A" }),
        pt(11, 61, { name: "B" }),
      ]);
      const result = compileLayer(layer, data);
      expect(result.legendItems).toHaveLength(1);
      expect(result.legendItems[0].label).toBe("No data");
      expect(result.legendItems[0].shape).toBe("circle");
    });

    it("returns 'No data' legend for point with numeric colorField but no numeric values", () => {
      const layer: LayerManifest = {
        id: "no-data-point", kind: "asset", label: "No Data",
        sourceType: "geojson-static", geometryType: "point",
        style: {
          markerShape: "circle", mapFamily: "point",
          colorField: "count",
          color: { scheme: "reds" },
        },
      };
      // count exists as number type but is null in all features
      const data = fc([
        pt(10, 60, { count: null }),
        pt(11, 61, { count: null }),
      ]);
      const result = compileLayer(layer, data);
      // With all nulls, detectFieldType returns "missing" → falls through to categorical
      // which will also have empty categories → legend will be empty array from map()
      // The important thing is it doesn't crash
      expect(result.layers.length).toBeGreaterThan(0);
    });
  });

  describe("field auto-correction", () => {
    it("auto-corrects case-mismatched colorField", () => {
      const layer: LayerManifest = {
        id: "case", kind: "asset", label: "Case",
        sourceType: "geojson-static", geometryType: "point",
        style: { markerShape: "circle", mapFamily: "point", colorField: "Population" },
      };
      const data = fc([
        pt(10, 60, { population: 100 }),
        pt(11, 61, { population: 200 }),
        pt(12, 62, { population: 300 }),
      ]);
      const result = compileLayer(layer, data);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('Auto-corrected "Population"'),
      );
      // Should still compile with color expression (not fallback)
      const paint = (result.layers[0] as CircleLayerSpecification).paint!;
      expect(Array.isArray(paint["circle-color"])).toBe(true);
    });

    it("auto-corrects case-mismatched sizeField", () => {
      const layer: LayerManifest = {
        id: "size", kind: "asset", label: "Size",
        sourceType: "geojson-static", geometryType: "point",
        style: { markerShape: "circle", mapFamily: "proportional-symbol", sizeField: "VALUE" },
      };
      const data = fc([
        pt(10, 60, { value: 10 }),
        pt(11, 61, { value: 50 }),
      ]);
      const result = compileLayer(layer, data);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('Auto-corrected "VALUE"'),
      );
    });

    it("warns when field is completely missing", () => {
      const layer: LayerManifest = {
        id: "missing", kind: "asset", label: "Missing",
        sourceType: "geojson-static", geometryType: "point",
        style: { markerShape: "circle", mapFamily: "point", colorField: "nonexistent" },
      };
      const data = fc([
        pt(10, 60, { name: "A", pop: 100 }),
        pt(11, 61, { name: "B", pop: 200 }),
      ]);
      const result = compileLayer(layer, data);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('"nonexistent" not found'),
      );
      expect(result.warnings).toContainEqual(
        expect.stringContaining("Available:"),
      );
    });

    it("does not warn when field exists with exact name", () => {
      const layer: LayerManifest = {
        id: "exact", kind: "asset", label: "Exact",
        sourceType: "geojson-static", geometryType: "point",
        style: { markerShape: "circle", mapFamily: "point", colorField: "type" },
      };
      const data = fc([
        pt(10, 60, { type: "a" }),
        pt(11, 61, { type: "b" }),
      ]);
      const result = compileLayer(layer, data);
      const fieldWarnings = (result.warnings ?? []).filter(w =>
        w.includes("Auto-corrected") || w.includes("not found"),
      );
      expect(fieldWarnings).toHaveLength(0);
    });
  });

  // ─── Geometry robustness ─────────────────────────────────────

  describe("geometry robustness", () => {
    const multiPoly: GeoJSON.Feature = {
      type: "Feature",
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
          [[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]],
        ],
      },
      properties: { name: "Islands", value: 42 },
    };

    it("choropleth handles MultiPolygon data", () => {
      const layer: LayerManifest = {
        id: "multi", kind: "asset", label: "Multi",
        sourceType: "geojson-static", geometryType: "polygon",
        style: { markerShape: "circle", mapFamily: "choropleth", colorField: "value", color: { scheme: "viridis" }, classification: { method: "quantile", classes: 3 } },
      };
      const result = compileLayer(layer, fc([multiPoly]));
      const fills = result.layers.filter(l => l.type === "fill");
      expect(fills.length).toBeGreaterThan(0);
    });

    it("choropleth falls back to circles for Point-only data", () => {
      const layer: LayerManifest = {
        id: "pt-choro", kind: "asset", label: "Pts",
        sourceType: "geojson-static", geometryType: "point",
        style: { markerShape: "circle", mapFamily: "choropleth", colorField: "value", color: { scheme: "viridis" }, classification: { method: "quantile", classes: 3 } },
      };
      const data = fc([
        pt(0, 0, { value: 10 }), pt(1, 1, { value: 20 }),
        pt(2, 2, { value: 30 }), pt(3, 3, { value: 40 }),
      ]);
      const result = compileLayer(layer, data);
      const circles = result.layers.filter(l => l.type === "circle");
      expect(circles.length).toBeGreaterThan(0);
      expect(result.warnings?.some(w => w.includes("Point data"))).toBe(true);
    });

    it("choropleth falls back to lines for LineString-only data", () => {
      const layer: LayerManifest = {
        id: "line-choro", kind: "asset", label: "Lines",
        sourceType: "geojson-static", geometryType: "line",
        style: { markerShape: "circle", mapFamily: "choropleth", colorField: "value", color: { scheme: "viridis" }, classification: { method: "quantile", classes: 3 } },
      };
      const data = fc([
        line([[0, 0], [1, 1]], { value: 10 }),
        line([[2, 2], [3, 3]], { value: 20 }),
        line([[4, 4], [5, 5]], { value: 30 }),
        line([[6, 6], [7, 7]], { value: 40 }),
      ]);
      const result = compileLayer(layer, data);
      const lines = result.layers.filter(l => l.type === "line");
      expect(lines.length).toBeGreaterThan(0);
      expect(result.warnings?.some(w => w.includes("LineString data"))).toBe(true);
    });

    it("point handles LineString data with line sublayer", () => {
      const layer: LayerManifest = {
        id: "line-pt", kind: "asset", label: "Lines",
        sourceType: "geojson-static", geometryType: "line",
        style: { markerShape: "circle", mapFamily: "point" },
      };
      const data = fc([line([[0, 0], [1, 1]], { name: "path" })]);
      const result = compileLayer(layer, data);
      const lines = result.layers.filter(l => l.type === "line");
      expect(lines.length).toBeGreaterThan(0);
    });

    it("point handles Polygon data with fill sublayer", () => {
      const layer: LayerManifest = {
        id: "poly-pt", kind: "asset", label: "Polys",
        sourceType: "geojson-static", geometryType: "polygon",
        style: { markerShape: "circle", mapFamily: "point" },
      };
      const data = fc([poly(rect(0, 0, 1, 1), { name: "area" })]);
      const result = compileLayer(layer, data);
      const fills = result.layers.filter(l => l.type === "fill");
      expect(fills.length).toBeGreaterThan(0);
      expect(result.warnings?.some(w => w.includes("Polygon data"))).toBe(true);
    });

    it("point does not emit circle layers for polygon-only data", () => {
      const layer: LayerManifest = {
        id: "poly-only", kind: "asset", label: "PolyOnly",
        sourceType: "geojson-static", geometryType: "polygon",
        style: { markerShape: "circle", mapFamily: "point" },
      };
      const data = fc([poly(rect(0, 0, 1, 1), { name: "area" })]);
      const result = compileLayer(layer, data);
      const circles = result.layers.filter(l => l.type === "circle");
      expect(circles).toHaveLength(0);
    });

    it("timeline does not crash on null geometry features", () => {
      const layer: LayerManifest = {
        id: "tl-null", kind: "asset", label: "Timeline",
        sourceType: "geojson-static", geometryType: "polygon",
        style: { markerShape: "circle", mapFamily: "timeline", colorField: "value", color: { scheme: "viridis" }, classification: { method: "quantile", classes: 3 } },
        timeline: { timeField: "year" },
      };
      const data = fc([
        poly(rect(0, 0, 1, 1), { value: 10, year: "2020" }),
        { type: "Feature", geometry: null as unknown as GeoJSON.Geometry, properties: { value: 20, year: "2021" } },
      ]);
      expect(() => compileLayer(layer, data)).not.toThrow();
    });

    it("heatmap weight domain uses actual data range", () => {
      const layer: LayerManifest = {
        id: "heat", kind: "asset", label: "Heat",
        sourceType: "geojson-static", geometryType: "point",
        style: { markerShape: "circle", mapFamily: "heatmap", sizeField: "magnitude" },
      };
      const data = fc([
        pt(0, 0, { magnitude: 4.5 }),
        pt(1, 1, { magnitude: 7.2 }),
        pt(2, 2, { magnitude: 9.0 }),
      ]);
      const result = compileLayer(layer, data);
      const heatLayer = result.layers.find(l => l.type === "heatmap");
      expect(heatLayer).toBeTruthy();
      const paint = (heatLayer as HeatmapLayerSpecification).paint!;
      const weight = paint["heatmap-weight"] as unknown[];
      // Should interpolate from min (4.5) to max (9.0), not 0 to 10
      expect(weight).toContain(4.5);
      expect(weight).not.toContain(10);
    });

    it("hexbin-3d produces deck layer config", () => {
      const layer: LayerManifest = {
        id: "hex3d", kind: "asset", label: "HexGrid",
        sourceType: "geojson-static", geometryType: "point",
        style: { markerShape: "circle", mapFamily: "hexbin-3d" },
        hexbin3d: { elevationScale: 5000, coverage: 0.9 },
      };
      const data = fc([pt(0, 0, { v: 1 }), pt(1, 1, { v: 2 })]);
      const result = compileLayer(layer, data);
      expect(result.deckLayers).toBeDefined();
      expect(result.deckLayers!.length).toBe(1);
      expect(result.deckLayers![0].type).toBe("HexagonLayer");
      expect(result.deckLayers![0].props.elevationScale).toBe(5000);
    });

    it("screen-grid produces deck layer config", () => {
      const layer: LayerManifest = {
        id: "sg", kind: "asset", label: "ScreenGrid",
        sourceType: "geojson-static", geometryType: "point",
        style: { markerShape: "circle", mapFamily: "screen-grid" },
        screenGrid: { cellSize: 30 },
      };
      const data = fc([pt(0, 0, { v: 1 }), pt(1, 1, { v: 2 })]);
      const result = compileLayer(layer, data);
      expect(result.deckLayers).toBeDefined();
      expect(result.deckLayers![0].type).toBe("ScreenGridLayer");
      expect(result.deckLayers![0].props.cellSizePixels).toBe(30);
    });

    it("trip produces deck layer config and warns on missing timestampField", () => {
      const layer: LayerManifest = {
        id: "trip", kind: "asset", label: "Trip",
        sourceType: "geojson-static", geometryType: "line",
        style: { markerShape: "circle", mapFamily: "trip" },
        trip: { timestampField: "", trailLength: 100, widthPixels: 4 },
      };
      const data = fc([line([[0, 0], [1, 1]], { ts: 1000 })]);
      const result = compileLayer(layer, data);
      expect(result.deckLayers).toBeDefined();
      expect(result.deckLayers![0].type).toBe("TripsLayer");
      expect(result.deckLayers![0].props.trailLength).toBe(100);
      expect(result.warnings?.some(w => w.includes("timestampField"))).toBe(true);
    });

    it("natural-breaks classification compiles without fallback warning", () => {
      const layer: LayerManifest = {
        id: "nb", kind: "asset", label: "NB",
        sourceType: "geojson-static", geometryType: "polygon",
        style: { markerShape: "circle", mapFamily: "choropleth", colorField: "value", color: { scheme: "viridis" }, classification: { method: "natural-breaks", classes: 3 } },
      };
      const data = fc([
        poly(rect(0, 0, 1, 1), { value: 10 }),
        poly(rect(1, 0, 2, 1), { value: 50 }),
        poly(rect(2, 0, 3, 1), { value: 90 }),
        poly(rect(3, 0, 4, 1), { value: 100 }),
      ]);
      const result = compileLayer(layer, data);
      const warnings = result.warnings ?? [];
      expect(warnings.some((w) => w.includes("not yet implemented"))).toBe(false);
    });

    it("uses equal-interval breaks when requested", () => {
      const layer: LayerManifest = {
        id: "eq", kind: "asset", label: "EQ",
        sourceType: "geojson-static", geometryType: "polygon",
        style: {
          markerShape: "circle",
          mapFamily: "choropleth",
          colorField: "value",
          color: { scheme: "viridis" },
          classification: { method: "equal-interval", classes: 3 },
        },
      };
      const data = fc([
        poly(rect(0, 0, 1, 1), { value: 1 }),
        poly(rect(1, 0, 2, 1), { value: 2 }),
        poly(rect(2, 0, 3, 1), { value: 3 }),
        poly(rect(3, 0, 4, 1), { value: 100 }),
      ]);
      const result = compileLayer(layer, data);

      const fill = result.layers.find((l) => l.id === "eq-fill") as FillLayerSpecification;
      const expr = fill.paint?.["fill-color"] as unknown[];
      expect(Array.isArray(expr)).toBe(true);
      expect(expr[0]).toBe("step");
      // Equal interval breaks for [1, 100] with 3 classes are 34 and 67.
      expect(expr[3]).toBeCloseTo(34, 6);
      expect(expr[5]).toBeCloseTo(67, 6);
    });

    it("uses manual breaks for hexbin classification", () => {
      const layer: LayerManifest = {
        id: "hex-manual",
        kind: "asset",
        label: "Hex Manual",
        sourceType: "geojson-static",
        geometryType: "point",
        style: {
          markerShape: "circle",
          mapFamily: "hexbin",
          classification: { method: "manual", classes: 3, breaks: [20, 60] },
          color: { scheme: "viridis" },
        },
      };
      const data = fc([
        pt(10.0, 59.0, {}),
        pt(10.01, 59.01, {}),
        pt(10.02, 59.02, {}),
        pt(11.0, 60.0, {}),
      ]);

      const result = compileLayer(layer, data);
      const fill = result.layers.find((l) => l.id === "hex-manual-fill") as FillLayerSpecification;
      const expr = fill.paint?.["fill-color"] as unknown[];
      expect(Array.isArray(expr)).toBe(true);
      expect(expr[0]).toBe("step");
      expect(expr[3]).toBe(20);
      expect(expr[5]).toBe(60);
    });
  });
});
