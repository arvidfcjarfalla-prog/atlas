import { NextResponse } from "next/server";

/**
 * Serve Natural Earth 110m country boundaries as GeoJSON.
 *
 * Proxied from the Natural Earth GitHub CDN to avoid CORS issues
 * and to normalise attribute names. Cached for 24 hours.
 *
 * Attributes per feature:
 *   name, iso_a3, continent, subregion, pop_est, gdp_md
 */

const SOURCE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";

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
        { error: "Failed to fetch country boundaries" },
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
            name: p["NAME"] ?? p["name"] ?? "",
            iso_a3: p["ISO_A3_EH"] ?? p["ISO_A3"] ?? p["iso_a3"] ?? "",
            continent: p["CONTINENT"] ?? p["continent"] ?? "",
            subregion: p["SUBREGION"] ?? p["subregion"] ?? "",
            pop_est: Number(p["POP_EST"] ?? p["pop_est"] ?? 0),
            gdp_md: Number(p["GDP_MD"] ?? p["gdp_md"] ?? 0),
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
      { error: "Country boundaries unavailable" },
      { status: 502 },
    );
  }
}
