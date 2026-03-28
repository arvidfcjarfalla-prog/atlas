import type { MapManifest, MapFamily } from "@atlas/data-models";

export const FAMILIES: MapFamily[] = [
  "point",
  "cluster",
  "choropleth",
  "heatmap",
  "proportional-symbol",
  "flow",
  "isochrone",
  "hexbin",
  "hexbin-3d",
  "screen-grid",
  "trip",
];

export interface TestFixture {
  manifest: MapManifest;
  data: GeoJSON.FeatureCollection;
}

// ─── Helpers ────────────────────────────────────────────────

function pt(lng: number, lat: number, props: Record<string, unknown>, id: number): GeoJSON.Feature {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: props,
  };
}

function line(coords: [number, number][], props: Record<string, unknown>, id: number): GeoJSON.Feature {
  return {
    type: "Feature",
    id,
    geometry: { type: "LineString", coordinates: coords },
    properties: props,
  };
}

function poly(ring: [number, number][], props: Record<string, unknown>, id: number): GeoJSON.Feature {
  return {
    type: "Feature",
    id,
    geometry: { type: "Polygon", coordinates: [ring] },
    properties: props,
  };
}

function fc(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features };
}

// ─── 1. Point ───────────────────────────────────────────────

const pointFixture: TestFixture = {
  manifest: {
    id: "smoke-point",
    title: "Point — Categorical Color",
    description: "European capitals colored by category.",
    theme: "explore",
    defaultCenter: [50, 10],
    defaultZoom: 4,
    layers: [{
      id: "cities",
      kind: "asset",
      label: "Cities",
      sourceType: "geojson-static",
      geometryType: "point",
      style: {
        markerShape: "circle",
        mapFamily: "point",
        colorField: "type",
        color: { scheme: "set2", colorblindSafe: true },
        fillOpacity: 0.85,
        strokeColor: "rgba(255,255,255,0.4)",
        strokeWidth: 1,
      },
      interaction: {
        tooltipFields: ["name", "type", "population"],
        clickBehavior: "popup",
        hoverEffect: "highlight",
      },
    }],
  },
  data: fc([
    pt(2.35, 48.86, { name: "Paris", type: "capital", population: 2161000 }, 0),
    pt(13.40, 52.52, { name: "Berlin", type: "capital", population: 3645000 }, 1),
    pt(12.50, 41.90, { name: "Rome", type: "capital", population: 2873000 }, 2),
    pt(-3.70, 40.42, { name: "Madrid", type: "capital", population: 3223000 }, 3),
    pt(18.07, 59.33, { name: "Stockholm", type: "nordic", population: 975000 }, 4),
    pt(24.94, 60.17, { name: "Helsinki", type: "nordic", population: 656000 }, 5),
    pt(10.75, 59.91, { name: "Oslo", type: "nordic", population: 694000 }, 6),
    pt(14.42, 50.08, { name: "Prague", type: "eastern", population: 1309000 }, 7),
    pt(19.04, 47.50, { name: "Budapest", type: "eastern", population: 1752000 }, 8),
    pt(21.01, 52.23, { name: "Warsaw", type: "eastern", population: 1794000 }, 9),
  ]),
};

// ─── 2. Cluster ─────────────────────────────────────────────

function generateClusterPoints(): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  let id = 0;
  // Cluster A: Western Europe
  for (let i = 0; i < 8; i++) {
    features.push(pt(
      2 + Math.sin(i) * 2,
      48 + Math.cos(i) * 1.5,
      { name: `Event W-${i}`, severity: i % 2 === 0 ? "high" : "medium", value: 10 + i * 5 },
      id++,
    ));
  }
  // Cluster B: Eastern Mediterranean
  for (let i = 0; i < 7; i++) {
    features.push(pt(
      28 + Math.sin(i) * 1.5,
      37 + Math.cos(i) * 1,
      { name: `Event E-${i}`, severity: i % 3 === 0 ? "critical" : "low", value: 20 + i * 8 },
      id++,
    ));
  }
  // Cluster C: Scandinavia
  for (let i = 0; i < 5; i++) {
    features.push(pt(
      15 + Math.sin(i) * 2,
      60 + Math.cos(i) * 1,
      { name: `Event N-${i}`, severity: "medium", value: 5 + i * 3 },
      id++,
    ));
  }
  return features;
}

const clusterFixture: TestFixture = {
  manifest: {
    id: "smoke-cluster",
    title: "Cluster — Aggregated Events",
    description: "20 events across Europe, clustered at low zoom.",
    theme: "explore",
    defaultCenter: [48, 15],
    defaultZoom: 3,
    layers: [{
      id: "events",
      kind: "event",
      label: "Events",
      sourceType: "geojson-static",
      geometryType: "point",
      style: {
        markerShape: "circle",
        mapFamily: "cluster",
        colorField: "severity",
        clusterEnabled: true,
        clusterRadius: 50,
        color: { scheme: "reds", colorblindSafe: true },
      },
      interaction: {
        tooltipFields: ["name", "severity"],
        hoverEffect: "highlight",
      },
    }],
  },
  data: fc(generateClusterPoints()),
};

// ─── 3. Choropleth ──────────────────────────────────────────

function rect(west: number, south: number, east: number, north: number): [number, number][] {
  return [[west, south], [east, south], [east, north], [west, north], [west, south]];
}

const choroplethFixture: TestFixture = {
  manifest: {
    id: "smoke-choropleth",
    title: "Choropleth — Population Density",
    description: "5 regions with quantile classification.",
    theme: "decision",
    defaultCenter: [52, 10],
    defaultZoom: 4,
    layers: [{
      id: "regions",
      kind: "zone",
      label: "Regions",
      sourceType: "geojson-static",
      geometryType: "polygon",
      style: {
        markerShape: "circle",
        mapFamily: "choropleth",
        colorField: "density",
        classification: { method: "quantile", classes: 5 },
        color: { scheme: "blues", colorblindSafe: true },
        fillOpacity: 0.85,
        strokeColor: "rgba(255,255,255,0.4)",
        strokeWidth: 1,
      },
      legend: { title: "Density (per km²)", type: "gradient" },
      interaction: {
        tooltipFields: ["name", "density", "population"],
        clickBehavior: "popup",
        hoverEffect: "highlight",
      },
    }],
  },
  data: fc([
    poly(rect(-5, 42, 3, 51), { name: "France", density: 119, population: 67390000 }, 0),
    poly(rect(5, 47, 15, 55), { name: "Germany", density: 240, population: 83200000 }, 1),
    poly(rect(6, 36, 18, 47), { name: "Italy", density: 206, population: 59550000 }, 2),
    poly(rect(-10, 36, 4, 44), { name: "Spain", density: 94, population: 47350000 }, 3),
    poly(rect(14, 49, 24, 55), { name: "Poland", density: 124, population: 37750000 }, 4),
  ]),
};

// ─── 4. Heatmap ─────────────────────────────────────────────

function generateHeatmapPoints(): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  // Dense cluster around London
  for (let i = 0; i < 8; i++) {
    features.push(pt(
      -0.12 + (Math.sin(i * 0.7) * 0.15),
      51.51 + (Math.cos(i * 0.9) * 0.1),
      { weight: 5 + i * 0.8 },
      i,
    ));
  }
  // Sparse around Paris
  for (let i = 0; i < 5; i++) {
    features.push(pt(
      2.35 + (Math.sin(i * 1.2) * 0.2),
      48.86 + (Math.cos(i * 0.8) * 0.15),
      { weight: 3 + i * 0.5 },
      8 + i,
    ));
  }
  // A few outliers
  features.push(pt(9.19, 45.46, { weight: 7 }, 13));
  features.push(pt(16.37, 48.21, { weight: 4 }, 14));
  return features;
}

const heatmapFixture: TestFixture = {
  manifest: {
    id: "smoke-heatmap",
    title: "Heatmap — Weighted Density",
    description: "15 weighted points showing density concentration.",
    theme: "explore",
    defaultCenter: [50, 5],
    defaultZoom: 5,
    layers: [{
      id: "heat",
      kind: "event",
      label: "Heat",
      sourceType: "geojson-static",
      geometryType: "point",
      style: {
        markerShape: "circle",
        mapFamily: "heatmap",
        sizeField: "weight",
        maxZoom: 10,
        color: { scheme: "magma", colorblindSafe: true },
      },
      legend: { title: "Density", type: "gradient" },
      interaction: { clickBehavior: "none", hoverEffect: "none" },
    }],
  },
  data: fc(generateHeatmapPoints()),
};

// ─── 5. Proportional Symbol ────────────────────────────────

const proportionalFixture: TestFixture = {
  manifest: {
    id: "smoke-proportional",
    title: "Proportional Symbol — City Population",
    description: "Circle radius proportional to population.",
    theme: "editorial",
    defaultCenter: [50, 10],
    defaultZoom: 4,
    layers: [{
      id: "pop-cities",
      kind: "asset",
      label: "Cities",
      sourceType: "geojson-static",
      geometryType: "point",
      style: {
        markerShape: "circle",
        mapFamily: "proportional-symbol",
        sizeField: "population",
        colorField: "region",
        color: { scheme: "set1", colorblindSafe: true },
        fillOpacity: 0.7,
        strokeColor: "rgba(255,255,255,0.5)",
        strokeWidth: 1,
      },
      legend: {
        title: "Population",
        type: "proportional",
        exampleValues: [500000, 3000000, 10000000],
      },
      interaction: {
        tooltipFields: ["name", "population", "region"],
        clickBehavior: "popup",
        hoverEffect: "highlight",
      },
    }],
  },
  data: fc([
    pt(-3.70, 40.42, { name: "Madrid", population: 6642000, region: "Southern" }, 0),
    pt(2.35, 48.86, { name: "Paris", population: 11020000, region: "Western" }, 1),
    pt(-0.12, 51.51, { name: "London", population: 9002000, region: "Western" }, 2),
    pt(13.40, 52.52, { name: "Berlin", population: 3645000, region: "Central" }, 3),
    pt(12.50, 41.90, { name: "Rome", population: 4342000, region: "Southern" }, 4),
    pt(18.07, 59.33, { name: "Stockholm", population: 975000, region: "Nordic" }, 5),
  ]),
};

// ─── 6. Flow ────────────────────────────────────────────────

const flowFixture: TestFixture = {
  manifest: {
    id: "smoke-flow",
    title: "Flow — Trade Routes",
    description: "Weighted origin-destination lines.",
    theme: "decision",
    defaultCenter: [50, 10],
    defaultZoom: 4,
    layers: [{
      id: "trade",
      kind: "route",
      label: "Trade",
      sourceType: "geojson-static",
      geometryType: "line",
      style: {
        markerShape: "circle",
        mapFamily: "flow",
        colorField: "category",
        color: { scheme: "set2", colorblindSafe: true },
        fillOpacity: 0.7,
      },
      flow: {
        originField: "origin",
        destinationField: "destination",
        weightField: "volume",
        arc: true,
        minWidth: 1,
        maxWidth: 10,
      },
      legend: { title: "Category", type: "flow" },
      interaction: {
        tooltipFields: ["origin", "destination", "volume", "category"],
        clickBehavior: "popup",
        hoverEffect: "highlight",
      },
    }],
  },
  data: fc([
    line([[2.35, 48.86], [13.40, 52.52]], { origin: "Paris", destination: "Berlin", volume: 8200, category: "goods" }, 0),
    line([[-0.12, 51.51], [12.50, 41.90]], { origin: "London", destination: "Rome", volume: 3400, category: "services" }, 1),
    line([[-3.70, 40.42], [2.35, 48.86]], { origin: "Madrid", destination: "Paris", volume: 5100, category: "goods" }, 2),
    line([[18.07, 59.33], [13.40, 52.52]], { origin: "Stockholm", destination: "Berlin", volume: 1200, category: "energy" }, 3),
    line([[24.94, 60.17], [18.07, 59.33]], { origin: "Helsinki", destination: "Stockholm", volume: 900, category: "services" }, 4),
    line([[21.01, 52.23], [14.42, 50.08]], { origin: "Warsaw", destination: "Prague", volume: 2800, category: "goods" }, 5),
  ]),
};

// ─── 7. Isochrone ───────────────────────────────────────────

/** Generate a rough octagonal ring centered at [cLng, cLat] with given radius in degrees. */
function ring(cLng: number, cLat: number, radius: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    pts.push([
      cLng + Math.cos(angle) * radius,
      cLat + Math.sin(angle) * radius * 0.7, // lat compression
    ]);
  }
  return pts;
}

const isoCenter: [number, number] = [13.00, 55.61]; // Malmö

const isochroneFixture: TestFixture = {
  manifest: {
    id: "smoke-isochrone",
    title: "Isochrone — Cycling from Malmö C",
    description: "10/20/30 min cycling zones.",
    theme: "explore",
    defaultCenter: [55.61, 13.00],
    defaultZoom: 11,
    layers: [{
      id: "zones",
      kind: "zone",
      label: "Cycling zones",
      sourceType: "geojson-static",
      geometryType: "polygon",
      style: {
        markerShape: "circle",
        mapFamily: "isochrone",
        colorField: "value",
        color: { scheme: "greens", colorblindSafe: true },
        fillOpacity: 0.45,
        strokeColor: "rgba(255,255,255,0.6)",
        strokeWidth: 1.5,
      },
      isochrone: {
        mode: "cycling",
        breakpoints: [10, 20, 30],
        unit: "minutes",
        origin: [55.61, 13.00],
      },
      legend: { title: "Cycling time", type: "gradient" },
      interaction: {
        tooltipFields: ["value"],
        clickBehavior: "popup",
        hoverEffect: "highlight",
      },
    }],
  },
  data: fc([
    // Largest first (30 min) — rendered bottom
    poly(ring(isoCenter[0], isoCenter[1], 0.12), { value: 30 }, 0),
    poly(ring(isoCenter[0], isoCenter[1], 0.07), { value: 20 }, 1),
    poly(ring(isoCenter[0], isoCenter[1], 0.03), { value: 10 }, 2),
  ]),
};

// ─── Helpers: derive fixture with different family ──────────

function withFamily(base: TestFixture, family: MapFamily, title: string): TestFixture {
  return {
    data: base.data,
    manifest: {
      ...base.manifest,
      id: `smoke-${family}`,
      title,
      layers: base.manifest.layers.map((l) => ({
        ...l,
        id: `${family}-layer`,
        style: { ...l.style, mapFamily: family },
      })),
    },
  };
}

// ─── Export ─────────────────────────────────────────────────

export const FIXTURES: Record<MapFamily, TestFixture> = {
  point: pointFixture,
  cluster: clusterFixture,
  choropleth: choroplethFixture,
  heatmap: heatmapFixture,
  "proportional-symbol": proportionalFixture,
  flow: flowFixture,
  isochrone: isochroneFixture,
  extrusion: withFamily(choroplethFixture, "extrusion", "Extrusion — 3D Polygons"),
  "animated-route": withFamily(flowFixture, "animated-route", "Animated Route"),
  timeline: withFamily(choroplethFixture, "timeline", "Timeline — Time Series"),
  hexbin: withFamily(pointFixture, "hexbin", "Hexbin — H3 Aggregation"),
  "hexbin-3d": withFamily(pointFixture, "hexbin-3d", "Hexbin 3D — deck.gl"),
  "screen-grid": withFamily(pointFixture, "screen-grid", "Screen Grid — deck.gl"),
  trip: withFamily(flowFixture, "trip", "Trip — deck.gl Animated"),
};
