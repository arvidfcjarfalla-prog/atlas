import { NextResponse } from "next/server";

/**
 * Serve Natural Earth populated places as GeoJSON.
 *
 * Uses the "simple" dataset (~240 major cities worldwide).
 * Proxied from GitHub CDN. Cached for 24 hours.
 *
 * Attributes per feature:
 *   name, country, pop_max, pop_min, latitude, longitude, capital
 */

const SOURCE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_populated_places_simple.geojson";

let cache: { data: GeoJSON.FeatureCollection; timestamp: number } | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function GET(): Promise<NextResponse> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    const res = await fetch(SOURCE_URL, { next: { revalidate: 86400 } });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch city data" },
        { status: 502 },
      );
    }

    const raw = (await res.json()) as GeoJSON.FeatureCollection;

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

    return NextResponse.json(fc);
  } catch {
    return NextResponse.json(
      { error: "City data unavailable" },
      { status: 502 },
    );
  }
}
