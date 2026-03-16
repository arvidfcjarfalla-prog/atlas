import { NextResponse } from "next/server";
import { intersect } from "@turf/intersect";
import type { Feature, Polygon, MultiPolygon } from "geojson";

/**
 * Serve Swedish municipality boundaries as GeoJSON.
 *
 * Proxied from OpenDataSoft (source: Lantmäteriet GSD-Sverigekartor)
 * to avoid CORS issues and normalise properties.
 *
 * Municipality polygons are clipped against Sweden's land boundary
 * (Natural Earth 10m) to remove territorial waters. Without this,
 * island municipalities like Gotland extend far into the sea.
 *
 * The upstream GeoJSON wraps property values in arrays (e.g. ["1737"]).
 * This route unwraps them to plain strings for downstream join compatibility.
 *
 * Properties per feature:
 *   kom_code  — SCB 4-digit municipality code (e.g. "1737")
 *   kom_name  — Municipality name (e.g. "Torsby")
 *   lan_code  — SCB 2-digit county code (e.g. "17")
 */

const SOURCE_URL =
  "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/georef-sweden-kommun/exports/geojson";

const NE_COUNTRIES_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson";

let cache: { data: GeoJSON.FeatureCollection; timestamp: number } | null =
  null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const FETCH_TIMEOUT_MS = 60_000;

/** Cached Sweden land polygon from Natural Earth 10m. */
let swedenLandCache: Feature<Polygon | MultiPolygon> | null = null;

async function getSwedenLand(): Promise<Feature<Polygon | MultiPolygon> | null> {
  if (swedenLandCache) return swedenLandCache;
  try {
    const res = await fetch(NE_COUNTRIES_URL, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as GeoJSON.FeatureCollection;
    const swe = raw.features.find((f) => {
      const p = f.properties ?? {};
      return (p["ISO_A3_EH"] ?? p["ISO_A3"]) === "SWE";
    });
    if (swe && (swe.geometry.type === "Polygon" || swe.geometry.type === "MultiPolygon")) {
      swedenLandCache = swe as Feature<Polygon | MultiPolygon>;
      return swedenLandCache;
    }
    return null;
  } catch {
    return null;
  }
}

/** Clip a feature to Sweden's land boundary, removing sea areas. */
function clipToLand(
  feature: GeoJSON.Feature,
  land: Feature<Polygon | MultiPolygon>,
): GeoJSON.Feature {
  try {
    const geom = feature.geometry;
    if (geom.type !== "Polygon" && geom.type !== "MultiPolygon") return feature;
    const clipped = intersect(
      { type: "FeatureCollection", features: [feature as Feature<Polygon | MultiPolygon>, land] },
    );
    if (clipped) {
      return { ...feature, geometry: clipped.geometry };
    }
  } catch {
    // Intersection failed — keep original geometry
  }
  return feature;
}

/** Unwrap a value that may be wrapped in an array (OpenDataSoft quirk). */
function unwrap(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] ?? "");
  return String(v ?? "");
}

export async function GET(): Promise<NextResponse> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    const res = await fetch(SOURCE_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch Swedish municipality boundaries" },
        { status: 502 },
      );
    }

    const raw = (await res.json()) as GeoJSON.FeatureCollection;

    const swedenLand = await getSwedenLand();

    const features: GeoJSON.Feature[] = raw.features.map((f) => {
      const p = f.properties ?? {};
      const feat: GeoJSON.Feature = {
        type: "Feature" as const,
        geometry: f.geometry,
        properties: {
          kom_code: unwrap(p["kom_code"]),
          kom_name: unwrap(p["kom_name"]),
          lan_code: unwrap(p["lan_code"]),
        },
      };
      return swedenLand ? clipToLand(feat, swedenLand) : feat;
    });

    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features,
    };

    cache = { data: fc, timestamp: Date.now() };

    return NextResponse.json(fc);
  } catch {
    return NextResponse.json(
      { error: "Swedish municipality boundaries unavailable" },
      { status: 502 },
    );
  }
}
