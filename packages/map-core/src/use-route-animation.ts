"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { GeoJSONSource } from "maplibre-gl";
import { useMap } from "./use-map";

export interface RouteAnimationState {
  isAnimating: boolean;
  /** Progress 0–1 along the route. */
  progress: number;
  play: () => void;
  pause: () => void;
}

/**
 * Interpolate a position along a LineString at parameter t (0–1).
 */
function interpolateAlongLine(
  coords: number[][],
  t: number,
): [number, number] {
  if (coords.length === 0) return [0, 0];
  if (coords.length === 1) return coords[0] as [number, number];

  // Compute cumulative segment distances
  const distances: number[] = [0];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - coords[i - 1][0];
    const dy = coords[i][1] - coords[i - 1][1];
    total += Math.sqrt(dx * dx + dy * dy);
    distances.push(total);
  }

  if (total === 0) return coords[0] as [number, number];

  const targetDist = t * total;

  // Find the segment
  for (let i = 1; i < coords.length; i++) {
    if (distances[i] >= targetDist) {
      const segLen = distances[i] - distances[i - 1];
      if (segLen === 0) return coords[i] as [number, number];
      const segT = (targetDist - distances[i - 1]) / segLen;
      return [
        coords[i - 1][0] + segT * (coords[i][0] - coords[i - 1][0]),
        coords[i - 1][1] + segT * (coords[i][1] - coords[i - 1][1]),
      ];
    }
  }

  return coords[coords.length - 1] as [number, number];
}

/**
 * Extract all coordinates from a FeatureCollection's LineString features.
 */
function extractRouteCoords(
  data: GeoJSON.FeatureCollection,
): number[][] {
  for (const f of data.features) {
    if (f.geometry?.type === "LineString") {
      return f.geometry.coordinates;
    }
    if (f.geometry?.type === "MultiLineString") {
      return f.geometry.coordinates.flat();
    }
  }
  return [];
}

const MARKER_SOURCE = "route-animation-marker";
const MARKER_LAYER = "route-animation-marker-layer";

/**
 * Hook that animates a marker along a LineString route.
 *
 * Creates a point source + circle layer and uses requestAnimationFrame
 * to interpolate position along the route.
 *
 * @param data - GeoJSON data containing LineString features.
 * @param enabled - Whether this layer should animate (from _animatable).
 * @param durationMs - Full animation duration in ms (default 10000).
 * @param loop - Whether to loop (default true).
 */
export function useRouteAnimation(
  data: GeoJSON.FeatureCollection | null,
  enabled: boolean,
  durationMs = 10_000,
  loop = true,
): RouteAnimationState | null {
  const { map, isReady } = useMap();
  const [isAnimating, setIsAnimating] = useState(false);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const coordsRef = useRef<number[][]>([]);

  // Extract route coords
  useEffect(() => {
    if (!data || !enabled) {
      coordsRef.current = [];
      return;
    }
    coordsRef.current = extractRouteCoords(data);
  }, [data, enabled]);

  // Setup marker source + layer
  useEffect(() => {
    if (!map || !isReady || !enabled || coordsRef.current.length === 0) return;

    const startPos = coordsRef.current[0];
    const markerGeoJSON: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: startPos },
          properties: {},
        },
      ],
    };

    if (!map.getSource(MARKER_SOURCE)) {
      map.addSource(MARKER_SOURCE, { type: "geojson", data: markerGeoJSON });
    }
    if (!map.getLayer(MARKER_LAYER)) {
      map.addLayer({
        id: MARKER_LAYER,
        type: "circle",
        source: MARKER_SOURCE,
        paint: {
          "circle-radius": 8,
          "circle-color": "#ff6b6b",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
        },
      });
    }

    return () => {
      try {
        if (map.getLayer(MARKER_LAYER)) map.removeLayer(MARKER_LAYER);
        if (map.getSource(MARKER_SOURCE)) map.removeSource(MARKER_SOURCE);
      } catch {
        // Map may be destroyed
      }
    };
  }, [map, isReady, enabled]);

  // Animation loop
  const animate = useCallback(() => {
    if (!map || coordsRef.current.length === 0) return;

    const elapsed = performance.now() - startTimeRef.current;
    let t = elapsed / durationMs;

    if (t >= 1) {
      if (loop) {
        startTimeRef.current = performance.now();
        t = 0;
      } else {
        t = 1;
        setIsAnimating(false);
        setProgress(1);
        return;
      }
    }

    setProgress(t);

    const [lng, lat] = interpolateAlongLine(coordsRef.current, t);
    const source = map.getSource(MARKER_SOURCE) as GeoJSONSource | undefined;
    if (source) {
      source.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [lng, lat] },
            properties: {},
          },
        ],
      });
    }

    rafRef.current = requestAnimationFrame(animate);
  }, [map, durationMs, loop]);

  const play = useCallback(() => {
    if (!enabled || coordsRef.current.length === 0) return;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    setIsAnimating(true);
    startTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(animate);
  }, [enabled, animate]);

  const pause = useCallback(() => {
    setIsAnimating(false);
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!enabled) return null;

  return { isAnimating, progress, play, pause };
}
