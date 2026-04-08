#!/usr/bin/env node
// Generate preview SVG data for remaining 6 map-type families.
// Reads real GeoJSON, projects, simplifies, outputs static TypeScript.
// Run: node apps/web/scripts/generate-family-thumbnails.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const OUTPUT = path.join(ROOT, "components/generated/family-thumbnails.ts");

const VIEW_W = 560;
const VIEW_H = 420;
const PADDING = 24;

// ─── Shared helpers ──────────────────────────────────────────────

function loadGeo(relPath) {
  const full = path.join(ROOT, "public", relPath);
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

function makeProjection({ minLon, maxLon, minLat, maxLat, padding = PADDING }) {
  const meanLat = (minLat + maxLat) / 2;
  const cosLat = Math.cos((meanLat * Math.PI) / 180);
  const lonRange = (maxLon - minLon) * cosLat;
  const latRange = maxLat - minLat;
  const availW = VIEW_W - padding * 2;
  const availH = VIEW_H - padding * 2;
  const scale = Math.min(availW / lonRange, availH / latRange);
  const scaledW = lonRange * scale;
  const scaledH = latRange * scale;
  const offsetX = (VIEW_W - scaledW) / 2;
  const offsetY = (VIEW_H - scaledH) / 2;
  return (lon, lat) => {
    const x = offsetX + (lon - minLon) * cosLat * scale;
    const y = offsetY + (maxLat - lat) * scale;
    return [x, y];
  };
}

function simplifyRing(ring, project, minDistSq = 0.8) {
  const out = [];
  let prev = null;
  for (const [lon, lat] of ring) {
    const [x, y] = project(lon, lat);
    if (prev) {
      const dx = x - prev[0];
      const dy = y - prev[1];
      if (dx * dx + dy * dy < minDistSq) continue;
    }
    out.push([x, y]);
    prev = [x, y];
  }
  return out;
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function ringToPath(ring) {
  if (ring.length < 3) return "";
  let d = `M${ring[0][0].toFixed(1)} ${ring[0][1].toFixed(1)}`;
  for (let i = 1; i < ring.length; i++) {
    d += `L${ring[i][0].toFixed(1)} ${ring[i][1].toFixed(1)}`;
  }
  return d + "Z";
}

function featureToPath(feature, project, { minArea = 4, minDistSq = 0.8 } = {}) {
  const geoms =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature.geometry.type === "MultiPolygon"
      ? feature.geometry.coordinates
      : [];
  let d = "";
  for (const poly of geoms) {
    for (const ring of poly) {
      const simplified = simplifyRing(ring, project, minDistSq);
      if (simplified.length < 3) continue;
      if (ringArea(simplified) < minArea) continue;
      d += ringToPath(simplified);
    }
  }
  return d;
}

function hash(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Bias toward middle classes for visual variety
function hashClass(id) {
  const raw = hash(id) % 100;
  if (raw < 8) return 0;
  if (raw < 22) return 1;
  if (raw < 42) return 2;
  if (raw < 64) return 3;
  if (raw < 85) return 4;
  return 5;
}

// ─── World projection (equirectangular, no lat correction) ───────
// Crop to lat -60..90 to drop Antarctica
const worldProject = (() => {
  const minLon = -180;
  const maxLon = 180;
  const minLat = -60;
  const maxLat = 90;
  const lonRange = maxLon - minLon;
  const latRange = maxLat - minLat;
  const scale = Math.min(VIEW_W / lonRange, VIEW_H / latRange);
  const scaledW = lonRange * scale;
  const scaledH = latRange * scale;
  const offsetX = (VIEW_W - scaledW) / 2;
  const offsetY = (VIEW_H - scaledH) / 2;
  return (lon, lat) => {
    const x = offsetX + (lon - minLon) * scale;
    const y = offsetY + (maxLat - lat) * scale;
    return [x, y];
  };
})();

// ─── Europe projection (lat-corrected) ───────────────────────────
const europeProject = makeProjection({
  minLon: -11,
  maxLon: 32,
  minLat: 35,
  maxLat: 71,
  padding: 28,
});

// ─── World outline (admin0_110m) ─────────────────────────────────
console.log("Loading world admin0...");
const admin0 = loadGeo("geo/global/admin0_110m.geojson");
const worldOutlinePaths = [];
for (const f of admin0.features) {
  const d = featureToPath(f, worldProject, { minArea: 6, minDistSq: 1.2 });
  if (d) worldOutlinePaths.push(d);
}
console.log(`World outline: ${worldOutlinePaths.length} country paths`);

// ─── Europe outline (admin0 filtered to Europe bbox) ─────────────
// Filter countries whose centroid falls roughly in Europe
const europeIsoList = new Set([
  "AL","AD","AT","BY","BE","BA","BG","HR","CY","CZ","DK","EE","FI","FR",
  "DE","GR","HU","IS","IE","IT","XK","LV","LI","LT","LU","MT","MD","MC",
  "ME","NL","MK","NO","PL","PT","RO","SM","RS","SK","SI","ES","SE","CH",
  "TR","UA","GB","VA","RU",
]);
const europeOutlinePaths = [];
for (const f of admin0.features) {
  const iso = f.properties.iso_a2;
  if (!europeIsoList.has(iso)) continue;
  const d = featureToPath(f, europeProject, { minArea: 4, minDistSq: 0.6 });
  if (d) europeOutlinePaths.push(d);
}
console.log(`Europe outline: ${europeOutlinePaths.length} country paths`);

// ─── Cities (global) ─────────────────────────────────────────────
console.log("Loading global cities...");
const cities = loadGeo("geo/global/cities.geojson");

// Sort by pop_max desc and take top 120 for density without clutter
const topCities = cities.features
  .filter((f) => f.geometry?.type === "Point" && typeof f.properties.pop_max === "number")
  .sort((a, b) => (b.properties.pop_max ?? 0) - (a.properties.pop_max ?? 0))
  .slice(0, 120);

const cityPoints = topCities.map((f) => {
  const [lon, lat] = f.geometry.coordinates;
  const [x, y] = worldProject(lon, lat);
  const pop = f.properties.pop_max;
  return {
    x: +x.toFixed(1),
    y: +y.toFixed(1),
    pop,
  };
});

// Point family: all cities as dots, size by 3 tiers
const popValues = cityPoints.map((c) => c.pop).sort((a, b) => a - b);
const popQ33 = popValues[Math.floor(popValues.length * 0.33)];
const popQ66 = popValues[Math.floor(popValues.length * 0.66)];

const pointData = cityPoints.map((c) => ({
  x: c.x,
  y: c.y,
  t: c.pop < popQ33 ? 0 : c.pop < popQ66 ? 1 : 2, // size tier
}));

// Proportional symbol: continuous radius from pop
const popMin = Math.min(...popValues);
const popMax = Math.max(...popValues);
function popToRadius(pop) {
  // sqrt scaling for area-proportional
  const norm = Math.sqrt((pop - popMin) / (popMax - popMin));
  return 2 + norm * 14; // 2-16px radius
}
const propData = cityPoints.map((c) => ({
  x: c.x,
  y: c.y,
  r: +popToRadius(c.pop).toFixed(1),
}));

// Heatmap: aggregate cities into heat hotspots — use top 30 by pop
const heatData = cityPoints.slice(0, 30).map((c) => {
  const intensity = Math.min(1, Math.sqrt((c.pop - popMin) / (popMax - popMin)) + 0.2);
  return {
    x: c.x,
    y: c.y,
    r: 18 + intensity * 36, // heat radius 18-54
    i: +intensity.toFixed(2),
  };
});

// Cluster: group cities into regional clusters
const clusterRegions = [
  { name: "europe", cx: 0, cy: 0, count: 0, lon: [-12, 32], lat: [35, 72] },
  { name: "ne-asia", cx: 0, cy: 0, count: 0, lon: [100, 150], lat: [20, 60] },
  { name: "south-asia", cx: 0, cy: 0, count: 0, lon: [60, 100], lat: [5, 40] },
  { name: "ne-america", cx: 0, cy: 0, count: 0, lon: [-100, -60], lat: [25, 60] },
  { name: "latin-america", cx: 0, cy: 0, count: 0, lon: [-90, -30], lat: [-40, 25] },
  { name: "africa", cx: 0, cy: 0, count: 0, lon: [-20, 50], lat: [-35, 35] },
  { name: "oceania", cx: 0, cy: 0, count: 0, lon: [110, 180], lat: [-45, 0] },
];
// Use a smaller city set with coords preserved
for (const f of topCities) {
  const [lon, lat] = f.geometry.coordinates;
  for (const r of clusterRegions) {
    if (lon >= r.lon[0] && lon <= r.lon[1] && lat >= r.lat[0] && lat <= r.lat[1]) {
      r.count++;
      const [x, y] = worldProject(lon, lat);
      r.cx += x;
      r.cy += y;
      break;
    }
  }
}
const clusterData = clusterRegions
  .filter((r) => r.count > 0)
  .map((r) => ({
    x: +(r.cx / r.count).toFixed(1),
    y: +(r.cy / r.count).toFixed(1),
    n: r.count,
  }));

// ─── European trade flows ────────────────────────────────────────
console.log("Loading European trade...");
const trade = loadGeo("templates/european-trade.geojson");
const flowData = [];
for (const f of trade.features) {
  if (f.geometry.type !== "LineString") continue;
  const coords = f.geometry.coordinates;
  if (coords.length < 2) continue;
  const [sx, sy] = europeProject(coords[0][0], coords[0][1]);
  const [ex, ey] = europeProject(coords[coords.length - 1][0], coords[coords.length - 1][1]);
  const volume = f.properties.volume ?? 1;
  flowData.push({
    sx: +sx.toFixed(1),
    sy: +sy.toFixed(1),
    ex: +ex.toFixed(1),
    ey: +ey.toFixed(1),
    w: volume,
  });
}
console.log(`Flow data: ${flowData.length} arcs`);

// ─── European regions (nuts2) for extrusion ──────────────────────
console.log("Loading European NUTS2...");
const nuts2 = loadGeo("geo/eu/nuts2.geojson");
// Take a subset spread across Europe — NUTS2 is ~299 regions, keep all with data
const extrusionPolygons = [];
for (const f of nuts2.features) {
  const id = f.properties.nuts_id ?? f.properties.name ?? "";
  if (!id) continue;
  const d = featureToPath(f, europeProject, { minArea: 3, minDistSq: 0.5 });
  if (!d) continue;
  const cls = hashClass(id);
  // Pseudo-3D: heights mapped from class (1-12 px)
  const height = 1 + cls * 2.2;
  extrusionPolygons.push({ d, c: cls, h: +height.toFixed(1) });
}
console.log(`Extrusion: ${extrusionPolygons.length} NUTS2 regions`);

// ─── NUTS2 regions for choropleth-like heatmap base (optional) ───
// Not needed — heatmap uses city hotspots

// ─── Write output ────────────────────────────────────────────────
const outDir = path.dirname(OUTPUT);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const header = `// Auto-generated by scripts/generate-family-thumbnails.mjs
// Sources: public/geo/global/admin0_110m.geojson, public/geo/global/cities.geojson,
//          public/geo/eu/nuts2.geojson, public/templates/european-trade.geojson
// DO NOT EDIT — regenerate with: node apps/web/scripts/generate-family-thumbnails.mjs

export const THUMB_VIEW_BOX = "0 0 ${VIEW_W} ${VIEW_H}";

// World country outlines (for point/proportional/heatmap/cluster backgrounds)
export const WORLD_OUTLINE_PATHS: readonly string[] = [
${worldOutlinePaths.map((d) => `  ${JSON.stringify(d)},`).join("\n")}
];

// Europe country outlines (for flow/extrusion backgrounds)
export const EUROPE_OUTLINE_PATHS: readonly string[] = [
${europeOutlinePaths.map((d) => `  ${JSON.stringify(d)},`).join("\n")}
];

// Point map — top 120 world cities, classified by pop into 3 size tiers
export const POINT_DATA: readonly { readonly x: number; readonly y: number; readonly t: number }[] = [
${pointData.map((p) => `  { x: ${p.x}, y: ${p.y}, t: ${p.t} },`).join("\n")}
];

// Proportional symbol — cities with continuous radius
export const PROP_DATA: readonly { readonly x: number; readonly y: number; readonly r: number }[] = [
${propData.map((p) => `  { x: ${p.x}, y: ${p.y}, r: ${p.r} },`).join("\n")}
];

// Heatmap — top 30 cities as heat hotspots with radius + intensity
export const HEAT_DATA: readonly { readonly x: number; readonly y: number; readonly r: number; readonly i: number }[] = [
${heatData.map((p) => `  { x: ${p.x}, y: ${p.y}, r: ${p.r}, i: ${p.i} },`).join("\n")}
];

// Flow — European trade arcs (source → end with weight)
export const FLOW_DATA: readonly { readonly sx: number; readonly sy: number; readonly ex: number; readonly ey: number; readonly w: number }[] = [
${flowData.map((p) => `  { sx: ${p.sx}, sy: ${p.sy}, ex: ${p.ex}, ey: ${p.ey}, w: ${p.w} },`).join("\n")}
];

// Extrusion — NUTS2 regions with class + pseudo-3D height
export const EXTRUSION_DATA: readonly { readonly d: string; readonly c: number; readonly h: number }[] = [
${extrusionPolygons.map((p) => `  { d: ${JSON.stringify(p.d)}, c: ${p.c}, h: ${p.h} },`).join("\n")}
];

// Cluster — regional aggregations with count
export const CLUSTER_DATA: readonly { readonly x: number; readonly y: number; readonly n: number }[] = [
${clusterData.map((p) => `  { x: ${p.x}, y: ${p.y}, n: ${p.n} },`).join("\n")}
];
`;

fs.writeFileSync(OUTPUT, header);

const stats = fs.statSync(OUTPUT);
console.log(`\nWrote ${OUTPUT} (${(stats.size / 1024).toFixed(1)} KB)`);
console.log(`- ${worldOutlinePaths.length} world countries`);
console.log(`- ${europeOutlinePaths.length} Europe countries`);
console.log(`- ${pointData.length} point cities`);
console.log(`- ${propData.length} proportional cities`);
console.log(`- ${heatData.length} heat hotspots`);
console.log(`- ${flowData.length} flow arcs`);
console.log(`- ${extrusionPolygons.length} extrusion regions`);
console.log(`- ${clusterData.length} cluster groups`);
