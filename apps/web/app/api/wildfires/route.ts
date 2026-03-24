import { NextResponse } from "next/server";

/**
 * NASA FIRMS VIIRS active fire data — CSV converted to GeoJSON.
 * Source: https://firms.modaps.eosdis.nasa.gov
 * Returns fire hotspots detected in the last 24 hours.
 * Caches for 3 hours (satellite passes every ~12h per region).
 */

const MAX_FEATURES = 5000;

function getFirmsUrl(): string | null {
  const key = process.env.NASA_FIRMS_MAP_KEY;
  if (!key) return null;
  return `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_SNPP_NRT/world/1`;
}

export async function GET() {
  const firmsUrl = getFirmsUrl();
  if (!firmsUrl) {
    return NextResponse.json(
      { error: "NASA FIRMS API key not configured (NASA_FIRMS_MAP_KEY)" },
      { status: 503 },
    );
  }
  try {
    const res = await fetch(firmsUrl, {
      next: { revalidate: 10800 },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `FIRMS API returned ${res.status}` },
        { status: 502 },
      );
    }

    const text = await res.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2) {
      return NextResponse.json(
        { error: "No fire data available" },
        { status: 502 },
      );
    }

    // Parse CSV header
    const headers = lines[0].split(",").map((h) => h.trim());
    const latIdx = headers.indexOf("latitude");
    const lngIdx = headers.indexOf("longitude");
    const brightIdx = headers.indexOf("bright_ti4");
    const confIdx = headers.indexOf("confidence");
    const frpIdx = headers.indexOf("frp");
    const dateIdx = headers.indexOf("acq_date");
    const timeIdx = headers.indexOf("acq_time");

    if (latIdx === -1 || lngIdx === -1) {
      return NextResponse.json(
        { error: "Unexpected FIRMS CSV format" },
        { status: 502 },
      );
    }

    const features: GeoJSON.Feature[] = [];
    const limit = Math.min(lines.length, MAX_FEATURES + 1);

    for (let i = 1; i < limit; i++) {
      const cols = lines[i].split(",");
      const lat = parseFloat(cols[latIdx]);
      const lng = parseFloat(cols[lngIdx]);
      if (isNaN(lat) || isNaN(lng)) continue;

      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: {
          brightness: brightIdx !== -1 ? parseFloat(cols[brightIdx]) || null : null,
          confidence: confIdx !== -1 ? cols[confIdx]?.trim() || null : null,
          frp: frpIdx !== -1 ? parseFloat(cols[frpIdx]) || null : null,
          date: dateIdx !== -1 ? cols[dateIdx]?.trim() || null : null,
          time: timeIdx !== -1 ? cols[timeIdx]?.trim() || null : null,
        },
      });
    }

    return NextResponse.json(
      { type: "FeatureCollection", features } as GeoJSON.FeatureCollection,
      { headers: { "Cache-Control": "public, s-maxage=10800" } },
    );
  } catch {
    return NextResponse.json(
      { error: "NASA FIRMS unavailable" },
      { status: 502 },
    );
  }
}
