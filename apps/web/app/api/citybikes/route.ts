import { NextResponse } from "next/server";

const CITYBIKES_URL = "https://api.citybik.es/v2/networks";

interface CityBikesNetwork {
  id: string;
  name: string;
  company: string[];
  location: {
    city: string;
    country: string;
    latitude: number;
    longitude: number;
  };
}

/**
 * GET /api/citybikes
 *
 * Returns global bike-sharing networks as GeoJSON points.
 * Each feature is a bike-sharing network (city-level).
 * Caches for 1 hour.
 */
export async function GET() {
  try {
    const res = await fetch(CITYBIKES_URL, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "CityBikes API unavailable" },
        { status: 502 },
      );
    }

    const data = await res.json();
    const networks: CityBikesNetwork[] = data.networks ?? [];

    const features: GeoJSON.Feature[] = networks
      .filter((n) => n.location.latitude && n.location.longitude)
      .map((n) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [n.location.longitude, n.location.latitude],
        },
        properties: {
          name: n.name,
          city: n.location.city,
          country: n.location.country,
          company: n.company?.[0] ?? "Unknown",
          network_id: n.id,
        },
      }));

    return NextResponse.json(
      { type: "FeatureCollection", features },
      { headers: { "Cache-Control": "public, s-maxage=3600" } },
    );
  } catch {
    return NextResponse.json(
      { error: "CityBikes API unavailable" },
      { status: 502 },
    );
  }
}
