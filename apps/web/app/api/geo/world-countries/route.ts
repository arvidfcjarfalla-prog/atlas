import { readFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

/**
 * Serve Natural Earth 110m country boundaries as GeoJSON.
 *
 * Vendored in the repo and normalised at request/build time.
 *
 * Attributes per feature:
 *   name, iso_a3, continent, subregion, pop_est, gdp_md
 */

const DATA_FILE = join(process.cwd(), "public/geo/vendor/world-countries.geojson");
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

    return jsonWithCache(fc);
  } catch {
    if (cache) {
      return jsonWithCache(cache.data);
    }
    return NextResponse.json(
      { error: "Country boundaries unavailable" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
