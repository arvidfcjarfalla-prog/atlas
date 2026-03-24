import { NextResponse } from "next/server";

const ISS_URL = "https://api.wheretheiss.at/v1/satellites/25544";

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

    return NextResponse.json(fc, {
      headers: { "Cache-Control": "no-cache, no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "ISS tracking unavailable" },
      { status: 502 },
    );
  }
}
