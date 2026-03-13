import { NextRequest, NextResponse } from "next/server";

/**
 * Isochrone proxy: computes reachability polygons from an origin point.
 *
 * Uses OpenRouteService as the default backend (free tier: 40 req/min).
 * Requires ORS_API_KEY environment variable.
 *
 * Query parameters:
 *   origin  — "lat,lng" (required)
 *   mode    — driving | walking | cycling | transit (default "driving")
 *   breaks  — comma-separated breakpoints (required, e.g. "10,20,30")
 *   unit    — minutes | kilometers (default "minutes")
 *
 * Returns a GeoJSON FeatureCollection with one polygon per breakpoint,
 * ordered largest-to-smallest. Each feature has { value: <breakpoint> }.
 */

const ORS_BASE = "https://api.openrouteservice.org/v2/isochrones";

const MODE_MAP: Record<string, string> = {
  driving: "driving-car",
  walking: "foot-walking",
  cycling: "cycling-regular",
  transit: "driving-car", // ORS doesn't have transit — fallback to driving
};

const MAX_BREAKPOINTS = 10;
const MAX_BREAKPOINT_VALUE = 120; // minutes or km

// ─── Simple LRU cache ──────────────────────────────────────

interface CacheEntry {
  data: GeoJSON.FeatureCollection;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CACHE_MAX_SIZE = 100;

function getCached(key: string): GeoJSON.FeatureCollection | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: GeoJSON.FeatureCollection): void {
  // Evict oldest if at capacity
  if (cache.size >= CACHE_MAX_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

// ─── Route handler ─────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Isochrone service not configured (missing ORS_API_KEY)" },
      { status: 503 },
    );
  }

  const { searchParams } = request.nextUrl;

  // Parse origin
  const originParam = searchParams.get("origin");
  if (!originParam) {
    return NextResponse.json(
      { error: "Missing required parameter: origin (lat,lng)" },
      { status: 400 },
    );
  }

  const [latStr, lngStr] = originParam.split(",");
  const lat = Number(latStr);
  const lng = Number(lngStr);

  if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json(
      { error: "Invalid origin coordinates" },
      { status: 400 },
    );
  }

  // Parse mode
  const mode = searchParams.get("mode") ?? "driving";
  const orsProfile = MODE_MAP[mode];
  if (!orsProfile) {
    return NextResponse.json(
      { error: `Invalid mode: ${mode}. Use driving, walking, cycling, or transit` },
      { status: 400 },
    );
  }

  // Parse breakpoints
  const breaksParam = searchParams.get("breaks");
  if (!breaksParam) {
    return NextResponse.json(
      { error: "Missing required parameter: breaks (e.g. 10,20,30)" },
      { status: 400 },
    );
  }

  const breaks = breaksParam
    .split(",")
    .map(Number)
    .filter((n) => isFinite(n) && n > 0);

  if (breaks.length === 0) {
    return NextResponse.json(
      { error: "No valid breakpoints provided" },
      { status: 400 },
    );
  }

  if (breaks.length > MAX_BREAKPOINTS) {
    return NextResponse.json(
      { error: `Too many breakpoints (max ${MAX_BREAKPOINTS})` },
      { status: 400 },
    );
  }

  if (breaks.some((b) => b > MAX_BREAKPOINT_VALUE)) {
    return NextResponse.json(
      { error: `Breakpoint values must be ≤ ${MAX_BREAKPOINT_VALUE}` },
      { status: 400 },
    );
  }

  // Parse unit
  const unit = searchParams.get("unit") ?? "minutes";
  if (unit !== "minutes" && unit !== "kilometers") {
    return NextResponse.json(
      { error: "Invalid unit. Use minutes or kilometers" },
      { status: 400 },
    );
  }

  // Check cache
  const sortedBreaks = [...breaks].sort((a, b) => a - b);
  const cacheKey = `${lat},${lng}|${mode}|${sortedBreaks.join(",")}|${unit}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  // Call OpenRouteService
  try {
    const orsBody = {
      locations: [[lng, lat]], // ORS uses [lng, lat]
      range: sortedBreaks.map((b) => (unit === "minutes" ? b * 60 : b * 1000)),
      range_type: unit === "minutes" ? "time" : "distance",
    };

    const orsRes = await fetch(`${ORS_BASE}/${orsProfile}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify(orsBody),
    });

    if (!orsRes.ok) {
      const errText = await orsRes.text().catch(() => "Unknown error");

      if (orsRes.status === 429) {
        return NextResponse.json(
          { error: "Rate limit exceeded — try again in a moment" },
          { status: 429 },
        );
      }

      return NextResponse.json(
        { error: `Routing service error: ${orsRes.status}`, detail: errText },
        { status: 502 },
      );
    }

    const orsData = await orsRes.json();

    // Normalize ORS response to standard FeatureCollection
    const normalized = normalizeOrsResponse(orsData, sortedBreaks);

    // Cache the result
    setCache(cacheKey, normalized);

    return NextResponse.json(normalized);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to reach routing service",
        detail: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 502 },
    );
  }
}

// ─── Response normalization ────────────────────────────────

/**
 * ORS returns a GeoJSON FeatureCollection where each feature has
 * properties.value (in seconds or meters). We normalize to breakpoint
 * values and order largest-to-smallest for correct rendering order.
 */
function normalizeOrsResponse(
  orsData: { features?: Array<{ geometry: unknown; properties?: Record<string, unknown> }> },
  breakpoints: number[],
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  if (!orsData.features || !Array.isArray(orsData.features)) {
    return { type: "FeatureCollection", features: [] };
  }

  for (let i = 0; i < orsData.features.length && i < breakpoints.length; i++) {
    const feature = orsData.features[i];
    features.push({
      type: "Feature",
      id: i,
      geometry: feature.geometry as GeoJSON.Geometry,
      properties: {
        value: breakpoints[i],
      },
    });
  }

  // Reverse: largest first for correct polygon stacking
  features.reverse();

  return { type: "FeatureCollection", features };
}
