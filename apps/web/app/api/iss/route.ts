import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ISS_URL = "https://api.wheretheiss.at/v1/satellites/25544";
const MAX_STALE_MS = 5 * 60 * 1000;

let cache: { data: GeoJSON.FeatureCollection; timestamp: number } | null = null;

/**
 * GET /api/iss
 *
 * Returns the current ISS position as a single-feature GeoJSON.
 * Includes latitude, longitude, altitude, velocity.
 * No caching — position changes every second.
 */
export async function GET() {
  try {
    const res = await fetch(ISS_URL, {
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "ISS API unavailable" },
        { status: 502 },
      );
    }

    const data = await res.json();

    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [data.longitude, data.latitude],
          },
          properties: {
            name: "International Space Station",
            altitude_km: Math.round(data.altitude),
            velocity_kmh: Math.round(data.velocity),
            visibility: data.visibility,
            timestamp: data.timestamp,
          },
        },
      ],
    };

    cache = { data: fc, timestamp: Date.now() };

    return NextResponse.json(fc, {
      headers: { "Cache-Control": "no-cache, no-store" },
    });
  } catch {
    if (cache && Date.now() - cache.timestamp < MAX_STALE_MS) {
      return NextResponse.json(cache.data, {
        headers: {
          "Cache-Control": "no-cache, no-store",
          "X-Atlas-Stale": "1",
        },
      });
    }
    return NextResponse.json(
      { error: "ISS tracking unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
