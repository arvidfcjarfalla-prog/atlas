import { readFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

/**
 * Serve Natural Earth populated places as GeoJSON.
 *
 * Uses the "simple" dataset (~240 major cities worldwide).
 * Vendored in the repo and normalised at request/build time.
 *
 * Attributes per feature:
 *   name, country, pop_max, pop_min, latitude, longitude, capital
 */

const DATA_FILE = join(process.cwd(), "public/geo/vendor/world-cities.geojson");
let cache: { data: GeoJSON.FeatureCollection; timestamp: number } | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_CONTROL = "public, s-maxage=86400, stale-while-revalidate=172800";

function jsonWithCache(
  data: GeoJSON.FeatureCollection,
  cacheControl = CACHE_CONTROL,
): NextResponse {
  return NextResponse.json(data, {
    headers: { "Cache-Control": cacheControl },
  });
}

export async function GET(): Promise<NextResponse> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return jsonWithCache(cache.data);
  }

  try {
    const raw = JSON.parse(
      await readFile(DATA_FILE, "utf8"),
    ) as GeoJSON.FeatureCollection;

    // Normalise to a slim set of attributes
    const features: GeoJSON.Feature[] = raw.features.map((f) => {
      const p = f.properties ?? {};
      return {
        type: "Feature" as const,
        geometry: f.geometry,
        properties: {
          name: p["name"] ?? p["NAME"] ?? "",
          country: p["adm0name"] ?? p["ADM0NAME"] ?? "",
          pop_max: Number(p["pop_max"] ?? p["POP_MAX"] ?? 0),
          pop_min: Number(p["pop_min"] ?? p["POP_MIN"] ?? 0),
          latitude: Number(p["latitude"] ?? p["LATITUDE"] ?? 0),
          longitude: Number(p["longitude"] ?? p["LONGITUDE"] ?? 0),
          capital: Number(p["featurecla"]?.includes("capital") ? 1 : 0),
        },
      };
    });

    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features,
    };

    cache = { data: fc, timestamp: Date.now() };

    return jsonWithCache(fc);
  } catch {
    if (cache) {
      return jsonWithCache(cache.data);
    }
    return NextResponse.json(
      { error: "City data unavailable" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
