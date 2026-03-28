/**
 * Route snapper: calls the OSRM Match API to snap waypoints to roads.
 * Returns a snapped GeoJSON LineString.
 *
 * Used as an AI tool — the agent can call this before generating
 * a flow or animated-route manifest.
 */

interface RouteSnapOptions {
  /** Array of [lng, lat] coordinates. */
  coordinates: [number, number][];
  /** OSRM profile: driving, cycling, or walking. Default "driving". */
  profile?: "driving" | "cycling" | "walking";
}

interface RouteSnapResult {
  /** Snapped GeoJSON LineString. */
  geometry: GeoJSON.LineString | null;
  /** Total distance in meters. */
  distance: number;
  /** Total duration in seconds. */
  duration: number;
  /** Warning message if snapping partially failed. */
  warning?: string;
}

const OSRM_BASE = "https://router.project-osrm.org";

/**
 * Snap coordinates to roads using OSRM Match API.
 * Falls back to the raw coordinates as a LineString if OSRM fails.
 */
export async function snapToRoads(
  options: RouteSnapOptions,
): Promise<RouteSnapResult> {
  const { coordinates, profile = "driving" } = options;

  if (coordinates.length < 2) {
    return {
      geometry: null,
      distance: 0,
      duration: 0,
      warning: "Need at least 2 coordinates to snap a route",
    };
  }

  // OSRM Match API has a 100-coordinate limit per request
  const coords = coordinates.slice(0, 100);
  const coordStr = coords.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const url = `${OSRM_BASE}/match/v1/${profile}/${coordStr}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      return fallback(coordinates, `OSRM returned ${res.status}`);
    }

    const data = await res.json();
    if (data.code !== "Ok" || !data.matchings?.length) {
      return fallback(coordinates, `OSRM match failed: ${data.code}`);
    }

    const matching = data.matchings[0];
    return {
      geometry: matching.geometry,
      distance: matching.distance ?? 0,
      duration: matching.duration ?? 0,
    };
  } catch (err) {
    return fallback(
      coordinates,
      err instanceof Error ? err.message : "OSRM request failed",
    );
  }
}

function fallback(
  coordinates: [number, number][],
  warning: string,
): RouteSnapResult {
  return {
    geometry: {
      type: "LineString",
      coordinates,
    },
    distance: 0,
    duration: 0,
    warning: `Road snapping unavailable — using raw coordinates. ${warning}`,
  };
}
