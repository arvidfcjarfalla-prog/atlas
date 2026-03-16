import { NextResponse } from "next/server";

/**
 * Serve Natural Earth 10m admin1 (states/provinces) boundaries as GeoJSON.
 *
 * Proxied from the Natural Earth GitHub CDN to avoid CORS issues
 * and to normalise properties to a slim, consistent set.
 * The raw file is ~25 MB; slimming drops it to ~18 MB.
 * Cached in-memory for 24 hours.
 *
 * Properties per feature:
 *   iso_3166_2, name, name_en, iso_a2, admin
 */

const SOURCE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson";

let cache: { data: GeoJSON.FeatureCollection; timestamp: number } | null =
  null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Fetch timeout — generous for a ~25 MB file. */
const FETCH_TIMEOUT_MS = 60_000;

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
        { error: "Failed to fetch admin1 boundaries" },
        { status: 502 },
      );
    }

    const raw = (await res.json()) as GeoJSON.FeatureCollection;

    // Normalise to a slim set of properties.
    // The raw file has 80+ properties per feature — we only keep what the
    // join system and renderer need.
    const features: GeoJSON.Feature[] = raw.features.map((f) => {
      const p = f.properties ?? {};
      return {
        type: "Feature" as const,
        geometry: f.geometry,
        properties: {
          iso_3166_2: p["iso_3166_2"] ?? "",
          name: p["name"] ?? "",
          name_en: p["name_en"] ?? p["name"] ?? "",
          iso_a2: p["iso_a2"] ?? "",
          admin: p["admin"] ?? "",
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
      { error: "Admin1 boundaries unavailable" },
      { status: 502 },
    );
  }
}
