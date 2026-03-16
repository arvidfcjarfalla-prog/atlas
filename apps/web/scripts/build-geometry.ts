#!/usr/bin/env tsx
/**
 * Build static GeoJSON files from open data sources.
 *
 * Downloads boundary data from Natural Earth, Eurostat GISCO,
 * and geoBoundaries, then simplifies, normalizes properties,
 * and writes optimized GeoJSON to public/geo/.
 *
 * Usage:
 *   pnpm build:geo              # build all sources
 *   pnpm build:geo --id se:*    # build sources matching glob
 *   pnpm build:geo --id se:admin1 --id se:municipalities
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import simplify from "@turf/simplify";
import truncate from "@turf/truncate";
import { intersect } from "@turf/intersect";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import { SOURCES, type GeometrySource } from "./geometry-sources.js";

// ═══════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════

const PUBLIC_DIR = resolve(import.meta.dirname ?? __dirname, "../public");
const FETCH_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;

// ═══════════════════════════════════════════════════════════════
// CLI argument parsing
// ═══════════════════════════════════════════════════════════════

function parseArgs(): { ids: string[] } {
  const args = process.argv.slice(2);
  const ids: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--id" && args[i + 1]) {
      ids.push(args[++i]);
    }
  }

  return { ids };
}

function matchesFilter(id: string, filters: string[]): boolean {
  if (filters.length === 0) return true;
  return filters.some((f) => {
    if (f.endsWith("*")) return id.startsWith(f.slice(0, -1));
    return id === f;
  });
}

// ═══════════════════════════════════════════════════════════════
// Fetch helpers
// ═══════════════════════════════════════════════════════════════

async function fetchJson(url: string): Promise<unknown> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: "follow",
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from ${url}`);
      }
      return await res.json();
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      const delay = 2000 * (attempt + 1);
      console.log(`  Retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}

/** Resolve geoBoundaries API to actual GeoJSON download URL. */
async function resolveGeoBoundariesUrl(
  apiUrl: string,
  useSimplified?: boolean,
): Promise<string> {
  const meta = (await fetchJson(apiUrl)) as Record<string, string>;
  const key = useSimplified ? "simplifiedGeometryGeoJSON" : "gjDownloadURL";
  const gjUrl = meta[key] ?? meta.gjDownloadURL;
  if (!gjUrl) {
    throw new Error(`No ${key} in geoBoundaries API response: ${apiUrl}`);
  }
  return gjUrl;
}

// ═══════════════════════════════════════════════════════════════
// Sweden land clipping (post-process)
// ═══════════════════════════════════════════════════════════════

const NE_COUNTRIES_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson";

let swedenLandCache: Feature<Polygon | MultiPolygon> | null = null;

async function getSwedenLand(): Promise<Feature<Polygon | MultiPolygon>> {
  if (swedenLandCache) return swedenLandCache;
  console.log("  Fetching Sweden land polygon (NE 10m)...");
  const raw = (await fetchJson(NE_COUNTRIES_URL)) as GeoJSON.FeatureCollection;
  const swe = raw.features.find((f) => {
    const p = f.properties ?? {};
    return (p["ISO_A3_EH"] ?? p["ISO_A3"]) === "SWE";
  });
  if (
    !swe ||
    (swe.geometry.type !== "Polygon" && swe.geometry.type !== "MultiPolygon")
  ) {
    throw new Error("Could not find Sweden polygon in NE 10m countries");
  }
  swedenLandCache = swe as Feature<Polygon | MultiPolygon>;
  return swedenLandCache;
}

function clipFeatureToLand(
  feature: GeoJSON.Feature,
  land: Feature<Polygon | MultiPolygon>,
): GeoJSON.Feature {
  try {
    const geom = feature.geometry;
    if (geom.type !== "Polygon" && geom.type !== "MultiPolygon") return feature;
    const clipped = intersect({
      type: "FeatureCollection",
      features: [feature as Feature<Polygon | MultiPolygon>, land],
    });
    if (clipped) {
      return { ...feature, geometry: clipped.geometry };
    }
  } catch {
    // Intersection failed — keep original
  }
  return feature;
}

async function clipToSwedenLand(
  fc: GeoJSON.FeatureCollection,
): Promise<GeoJSON.FeatureCollection> {
  const land = await getSwedenLand();
  console.log("  Clipping to Sweden land boundary...");
  const features = fc.features.map((f) => clipFeatureToLand(f, land));
  return { ...fc, features };
}

// ═══════════════════════════════════════════════════════════════
// Processing pipeline
// ═══════════════════════════════════════════════════════════════

function stripProperties(
  feature: GeoJSON.Feature,
  propertyMap: Record<string, string>,
): GeoJSON.Feature {
  const newProps: Record<string, unknown> = {};
  for (const [srcKey, dstKey] of Object.entries(propertyMap)) {
    const val = feature.properties?.[srcKey];
    if (val !== undefined && val !== null) {
      newProps[dstKey] = val;
    }
  }
  return { ...feature, properties: newProps };
}

function countVertices(fc: GeoJSON.FeatureCollection): number {
  let total = 0;
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "Point") {
      total += 1;
    } else if (g.type === "Polygon") {
      for (const ring of g.coordinates) total += ring.length;
    } else if (g.type === "MultiPolygon") {
      for (const poly of g.coordinates)
        for (const ring of poly) total += ring.length;
    } else if (g.type === "MultiPoint") {
      total += g.coordinates.length;
    } else if (g.type === "LineString") {
      total += g.coordinates.length;
    } else if (g.type === "MultiLineString") {
      for (const line of g.coordinates) total += line.length;
    }
  }
  return total;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function processSource(source: GeometrySource): Promise<boolean> {
  const label = `[${source.id}]`;
  console.log(`\n${label} Processing...`);

  // Step 1: Resolve download URL
  let downloadUrl = source.url;
  if (source.isGeoBoundariesApi) {
    console.log(`${label} Resolving geoBoundaries API...`);
    downloadUrl = await resolveGeoBoundariesUrl(
      source.url,
      source.useSimplified,
    );
  }

  // Step 2: Download
  console.log(`${label} Downloading from ${downloadUrl.slice(0, 80)}...`);
  const raw = (await fetchJson(downloadUrl)) as GeoJSON.FeatureCollection;
  if (raw.type !== "FeatureCollection" || !Array.isArray(raw.features)) {
    console.error(`${label} ERROR: Not a valid FeatureCollection`);
    return false;
  }
  const rawVertices = countVertices(raw);
  console.log(
    `${label} Downloaded: ${raw.features.length} features, ${rawVertices.toLocaleString()} vertices`,
  );

  // Step 3: Filter
  let features = source.filter
    ? raw.features.filter(source.filter)
    : raw.features;

  // Step 4: Strip properties
  features = features.map((f) => stripProperties(f, source.propertyMap));

  // Step 5: Simplify (skip for point geometry)
  let fc: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features,
  };

  const isPointData = features.every(
    (f) => f.geometry?.type === "Point" || f.geometry?.type === "MultiPoint",
  );

  if (!isPointData && source.simplifyTolerance > 0) {
    console.log(
      `${label} Simplifying (tolerance=${source.simplifyTolerance})...`,
    );
    fc = simplify(fc, {
      tolerance: source.simplifyTolerance,
      highQuality: true,
    });
  }

  // Step 6: Truncate coordinates
  fc = truncate(fc, {
    precision: source.coordinatePrecision,
    coordinates: 2,
  });

  // Step 7: Post-process
  if (source.postProcess === "clip-sweden-land") {
    fc = await clipToSwedenLand(fc);
  }

  // Step 8: Validate
  if (fc.features.length === 0) {
    console.error(`${label} ERROR: No features after processing`);
    return false;
  }

  if (
    source.expectedFeatures &&
    Math.abs(fc.features.length - source.expectedFeatures) /
      source.expectedFeatures >
      0.3
  ) {
    console.warn(
      `${label} WARNING: Expected ~${source.expectedFeatures} features, got ${fc.features.length}`,
    );
  }

  const finalVertices = countVertices(fc);
  const reduction = rawVertices > 0
    ? ((1 - finalVertices / rawVertices) * 100).toFixed(1)
    : "0";

  // Step 9: Write
  const outPath = resolve(PUBLIC_DIR, source.outputPath);
  mkdirSync(dirname(outPath), { recursive: true });
  const json = JSON.stringify(fc);
  writeFileSync(outPath, json, "utf-8");

  const fileSize = Buffer.byteLength(json, "utf-8");
  console.log(
    `${label} Done: ${fc.features.length} features, ${finalVertices.toLocaleString()} vertices (${reduction}% reduction), ${formatSize(fileSize)}`,
  );

  return true;
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

async function main() {
  const { ids } = parseArgs();
  const sources = SOURCES.filter((s) => matchesFilter(s.id, ids));

  if (sources.length === 0) {
    console.error("No sources matched the filter.");
    console.error(`Available: ${SOURCES.map((s) => s.id).join(", ")}`);
    process.exit(1);
  }

  console.log(`Building ${sources.length} geometry sources...`);
  console.log(`Output: ${PUBLIC_DIR}/geo/`);

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const source of sources) {
    try {
      const ok = await processSource(source);
      if (ok) {
        success++;
      } else {
        failed++;
        errors.push(source.id);
      }
    } catch (err) {
      failed++;
      errors.push(source.id);
      console.error(
        `[${source.id}] FAILED: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`Done: ${success} succeeded, ${failed} failed`);
  if (errors.length > 0) {
    console.log(`Failed sources: ${errors.join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
