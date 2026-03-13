/**
 * Arc interpolator: converts straight 2-point LineStrings into smooth
 * curved arcs for flow map rendering.
 *
 * Pure data transform — no MapLibre or DOM dependency.
 *
 * Two algorithms:
 * - Great circle interpolation for long-distance flows (> 500km)
 * - Quadratic Bézier for short-distance flows
 *
 * Curves to the right (clockwise) by default for visual separation
 * of bidirectional flows.
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371;

/** Number of interpolated points per arc. */
const ARC_RESOLUTION = 32;

/** Distance threshold (km) for switching from Bézier to great circle. */
const GREAT_CIRCLE_THRESHOLD_KM = 500;

/** Minimum offset in degrees for very short flows. */
const MIN_OFFSET_DEG = 0.002;

// ─── Distance ──────────────────────────────────────────────

/** Haversine distance in km between two [lng, lat] points. */
function haversineKm(
  a: [number, number],
  b: [number, number],
): number {
  const dLat = (b[1] - a[1]) * DEG2RAD;
  const dLng = (b[0] - a[0]) * DEG2RAD;
  const lat1 = a[1] * DEG2RAD;
  const lat2 = b[1] * DEG2RAD;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// ─── Great circle interpolation ────────────────────────────

/**
 * Interpolate along a great circle arc between two [lng, lat] points.
 * Returns `resolution` intermediate points (excluding endpoints, which
 * are prepended/appended by the caller).
 */
function greatCirclePoints(
  a: [number, number],
  b: [number, number],
  resolution: number,
): [number, number][] {
  const lat1 = a[1] * DEG2RAD;
  const lng1 = a[0] * DEG2RAD;
  const lat2 = b[1] * DEG2RAD;
  const lng2 = b[0] * DEG2RAD;

  const d = 2 * Math.asin(
    Math.sqrt(
      Math.sin((lat2 - lat1) / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2,
    ),
  );

  if (d < 1e-10) return [];

  const points: [number, number][] = [];

  for (let i = 1; i < resolution; i++) {
    const f = i / resolution;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);

    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);

    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * RAD2DEG;
    const lng = Math.atan2(y, x) * RAD2DEG;

    points.push([lng, lat]);
  }

  return points;
}

// ─── Quadratic Bézier ──────────────────────────────────────

/**
 * Compute a quadratic Bézier control point offset perpendicular to
 * the midpoint of the segment. Offset direction is clockwise (right).
 */
function bezierControlPoint(
  a: [number, number],
  b: [number, number],
): [number, number] {
  const midLng = (a[0] + b[0]) / 2;
  const midLat = (a[1] + b[1]) / 2;

  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.sqrt(dx * dx + dy * dy);

  // Offset proportional to segment length, clamped
  const offset = Math.max(len * 0.25, MIN_OFFSET_DEG);

  // Perpendicular direction (rotate 90° clockwise: [dy, -dx])
  const nx = dy / (len || 1);
  const ny = -dx / (len || 1);

  return [midLng + nx * offset, midLat + ny * offset];
}

function bezierPoints(
  a: [number, number],
  b: [number, number],
  resolution: number,
): [number, number][] {
  const cp = bezierControlPoint(a, b);
  const points: [number, number][] = [];

  for (let i = 1; i < resolution; i++) {
    const t = i / resolution;
    const t1 = 1 - t;

    // Quadratic Bézier: B(t) = (1-t)²·P0 + 2(1-t)t·CP + t²·P1
    const lng = t1 * t1 * a[0] + 2 * t1 * t * cp[0] + t * t * b[0];
    const lat = t1 * t1 * a[1] + 2 * t1 * t * cp[1] + t * t * b[1];

    points.push([lng, lat]);
  }

  return points;
}

// ─── Public API ────────────────────────────────────────────

/**
 * Convert a 2-point LineString into a smooth arc.
 * Uses great circle interpolation for long-distance flows,
 * quadratic Bézier for short distances.
 *
 * Returns the original coordinates unchanged if the LineString
 * has fewer than 2 points or more than 2 (already multi-point).
 */
export function interpolateArc(
  coordinates: [number, number][],
  resolution = ARC_RESOLUTION,
): [number, number][] {
  // Only transform 2-point lines
  if (coordinates.length !== 2) return coordinates;

  const [a, b] = coordinates;
  const dist = haversineKm(a, b);

  // Very short distance — keep straight to avoid visual artifacts
  if (dist < 1) return coordinates;

  const midPoints =
    dist >= GREAT_CIRCLE_THRESHOLD_KM
      ? greatCirclePoints(a, b, resolution)
      : bezierPoints(a, b, resolution);

  return [a, ...midPoints, b];
}

/**
 * Apply arc interpolation to all LineString features in a
 * FeatureCollection. Returns a new FeatureCollection (immutable).
 */
export function applyArcInterpolation(
  data: GeoJSON.FeatureCollection,
  resolution = ARC_RESOLUTION,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: data.features.map((feature) => {
      if (feature.geometry.type !== "LineString") return feature;

      const coords = feature.geometry.coordinates as [number, number][];
      const arcCoords = interpolateArc(coords, resolution);

      // If unchanged, return original feature
      if (arcCoords === coords) return feature;

      return {
        ...feature,
        geometry: {
          type: "LineString" as const,
          coordinates: arcCoords,
        },
      };
    }),
  };
}
