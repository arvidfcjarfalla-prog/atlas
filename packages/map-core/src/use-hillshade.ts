"use client";

import { useEffect, useRef } from "react";
import { useMap } from "./use-map";

interface UseHillshadeOptions {
  /** Enable the hillshade terrain texture. */
  enabled?: boolean;
  /** Insert the hillshade layer below this layer ID. */
  beforeLayerId?: string;
}

const SOURCE_ID = "hillshade-dem-source";
const LAYER_ID = "hillshade-layer";

/**
 * Adds a subtle hillshade layer that reveals terrain structure —
 * mountain ranges, ocean ridges, continental relief.
 *
 * Uses a raster-DEM source rendered as a hillshade layer.
 * Opacity is intentionally low — terrain texture, not topographic map.
 * Sits below all data layers as the quietest visual element.
 *
 * Uses MapLibre demo terrain tiles (free, no API key).
 */
export function useHillshade({
  enabled = true,
  beforeLayerId,
}: UseHillshadeOptions = {}) {
  const { map, isReady } = useMap();
  const addedRef = useRef(false);

  useEffect(() => {
    if (!map || !isReady || !enabled || addedRef.current) return;
    if (map.getSource(SOURCE_ID)) return;

    map.addSource(SOURCE_ID, {
      type: "raster-dem",
      url: "https://demotiles.maplibre.org/terrain-tiles/tiles.json",
      tileSize: 256,
    });

    map.addLayer(
      {
        id: LAYER_ID,
        type: "hillshade",
        source: SOURCE_ID,
        paint: {
          // Low exaggeration — terrain texture, not topographic drama.
          // Hillshade paint props are DataConstant (no zoom expressions).
          "hillshade-exaggeration": 0.15,
          "hillshade-shadow-color": "rgba(0, 0, 0, 0.4)",
          "hillshade-highlight-color": "rgba(255, 255, 255, 0.08)",
          "hillshade-accent-color": "rgba(80, 80, 80, 1)",
          "hillshade-illumination-direction": 315,
          "hillshade-illumination-anchor": "map",
        },
      },
      beforeLayerId,
    );

    addedRef.current = true;
  }, [map, isReady, enabled, beforeLayerId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (!map || !addedRef.current) return;
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        // Map may already be removed
      }
      addedRef.current = false;
    };
  }, [map]);
}
