import { NextResponse } from "next/server";

const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";

/**
 * Proxy USGS earthquake feed to avoid CORS issues.
 * Caches for 5 minutes via Next.js revalidation.
 */
export async function GET() {
  try {
    const res = await fetch(USGS_URL, { next: { revalidate: 300 } });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch USGS data" },
        { status: 502 },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "USGS feed unavailable" },
      { status: 502 },
    );
  }
}
