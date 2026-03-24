import { NextResponse } from "next/server";

const OPENSKY_URL = "https://opensky-network.org/api/states/all";

interface OpenSkyState {
  /** ICAO24 transponder address */
  0: string;
  /** Callsign (flight number, trimmed) */
  1: string | null;
  /** Country of origin */
  2: string;
  /** Last position update (Unix timestamp) */
  3: number | null;
  /** Last contact (Unix timestamp) */
  4: number;
  /** Longitude (WGS-84) */
  5: number | null;
  /** Latitude (WGS-84) */
  6: number | null;
  /** Barometric altitude (meters) */
  7: number | null;
  /** On ground */
  8: boolean;
  /** Velocity (m/s) */
  9: number | null;
  /** True track (degrees clockwise from north) */
  10: number | null;
  /** Vertical rate (m/s) */
  11: number | null;
  /** Sensors */
  12: number[] | null;
  /** Geometric altitude (meters) */
  13: number | null;
  /** Squawk */
  14: string | null;
  /** SPI */
  15: boolean;
  /** Position source */
  16: number;
}

/**
 * GET /api/flights
 *
 * Proxies OpenSky Network's state vectors API and returns GeoJSON.
 * Filters out grounded aircraft and those without position.
 * Caches for 30 seconds (OpenSky updates every ~10s).
 */
export async function GET() {
  try {
    const res = await fetch(OPENSKY_URL, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `OpenSky API returned ${res.status}` },
        { status: 502 },
      );
    }

    const data = await res.json();
    const states: OpenSkyState[] = data.states ?? [];

    const features: GeoJSON.Feature[] = [];
    for (const s of states) {
      const lng = s[5];
      const lat = s[6];
      const onGround = s[8];
      if (lng == null || lat == null || onGround) continue;

      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: {
          icao24: s[0],
          callsign: s[1]?.trim() || null,
          origin_country: s[2],
          altitude: s[7] != null ? Math.round(s[7]) : null,
          velocity: s[9] != null ? Math.round(s[9] * 3.6) : null, // m/s → km/h
          heading: s[10] != null ? Math.round(s[10]) : null,
          vertical_rate: s[11] != null ? Math.round(s[11] * 10) / 10 : null,
        },
      });
    }

    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features,
    };

    return NextResponse.json(fc, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "OpenSky Network unavailable" },
      { status: 502 },
    );
  }
}
