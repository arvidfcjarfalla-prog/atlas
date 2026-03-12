"use client";

import { useEffect, useRef } from "react";
import { useMap } from "./use-map";

interface UseTectonicLayersOptions {
  /** Enable the tectonic plate boundary overlay. */
  enabled?: boolean;
  /** Insert layers below this layer ID (default: first layer added after basemap). */
  beforeLayerId?: string;
}

const SOURCE_ID = "tectonic-source";
const GLOW_ID = "tectonic-glow";
const LINE_ID = "tectonic-line";

/**
 * Renders tectonic plate boundaries as cool structural lines
 * between the basemap and data markers.
 *
 * Uses Peter Bird's PB2002 dataset (public domain).
 * The GeoJSON is fetched once from /data/plates.geojson and never refreshes.
 */
export function useTectonicLayers({
  enabled = true,
  beforeLayerId,
}: UseTectonicLayersOptions = {}) {
  const { map, isReady } = useMap();
  const addedRef = useRef(false);

  useEffect(() => {
    if (!map || !isReady || !enabled || addedRef.current) return;
    if (map.getSource(SOURCE_ID)) return;

    let cancelled = false;

    fetch("/data/plates.geojson")
      .then((res) => res.json())
      .then((geojson) => {
        if (cancelled || !map || map.getSource(SOURCE_ID)) return;

        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: geojson,
        });

        // Glow band — cool cyan, geological structure
        map.addLayer(
          {
            id: GLOW_ID,
            type: "line",
            source: SOURCE_ID,
            paint: {
              "line-color": "rgba(100, 180, 220, 1)",
              "line-width": 3,
              "line-blur": 3,
              "line-opacity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                0, 0.04,
                3, 0.06,
                6, 0.04,
                10, 0,
              ],
            },
          },
          beforeLayerId,
        );

        // Crisp structural line — cool teal, reads as terrain
        map.addLayer(
          {
            id: LINE_ID,
            type: "line",
            source: SOURCE_ID,
            paint: {
              "line-color": "rgba(80, 160, 200, 1)",
              "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                0, 0.5,
                4, 0.8,
                8, 1,
              ],
              "line-opacity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                0, 0.12,
                3, 0.18,
                6, 0.10,
                10, 0,
              ],
            },
          },
          beforeLayerId,
        );

        addedRef.current = true;
      })
      .catch(() => {
        // Silently skip — structural layer is optional
      });

    return () => {
      cancelled = true;
    };
  }, [map, isReady, enabled, beforeLayerId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (!map || !addedRef.current) return;
      try {
        if (map.getLayer(LINE_ID)) map.removeLayer(LINE_ID);
        if (map.getLayer(GLOW_ID)) map.removeLayer(GLOW_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        // Map may already be removed
      }
      addedRef.current = false;
    };
  }, [map]);
}
