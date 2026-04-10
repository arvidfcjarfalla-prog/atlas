import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";

interface USGSFeature {
  id: string;
  properties: {
    mag: number;
    place: string;
    time: number;
    updated: number;
    tsunami: number;
    alert: string | null;
    type: string;
  };
  geometry: {
    type: "Point";
    coordinates: [number, number, number];
  };
}

interface USGSResponse {
  type: "FeatureCollection";
  metadata: { generated: number; count: number; title: string };
  features: USGSFeature[];
}

function emptyEarthquakeFeed(): USGSResponse {
  return {
    type: "FeatureCollection",
    metadata: {
      generated: Date.now(),
      count: 0,
      title: "USGS feed unavailable",
    },
    features: [],
  };
}

/**
 * Proxy USGS earthquake feed to avoid CORS issues.
 * Caches for 5 minutes via Next.js revalidation.
 */
export async function GET() {
  try {
    const res = await fetch(USGS_URL, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return NextResponse.json(emptyEarthquakeFeed(), {
        headers: {
          "Cache-Control": "no-store",
        },
      });
    }

    const data: USGSResponse = await res.json();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch {
    return NextResponse.json(emptyEarthquakeFeed(), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
}
