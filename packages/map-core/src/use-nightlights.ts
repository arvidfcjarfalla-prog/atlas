"use client";

import { useEffect, useRef } from "react";
import { useMap } from "./use-map";

interface UseNightlightsOptions {
  /** Enable the nightlights raster layer. */
  enabled?: boolean;
  /** Insert the nightlights layer below this layer ID. */
  beforeLayerId?: string;
}

const SOURCE_ID = "nightlights-source";
const LAYER_ID = "nightlights-layer";

/**
 * Adds a NASA VIIRS Black Marble nightlights raster layer
 * that shows city lights on the dark globe.
 *
 * Gives the land surface texture and life — warm orange/white
 * dots across populated areas. Opacity is intentionally low
 * so it reads as ambient texture, not content.
 *
 * Uses NASA GIBS WMTS tiles (free, no API key).
 * Falls back gracefully if tiles fail to load.
 */
export function useNightlights({
  enabled = true,
  beforeLayerId,
}: UseNightlightsOptions = {}) {
  const { map, isReady } = useMap();
  const addedRef = useRef(false);

  useEffect(() => {
    if (!map || !isReady || !enabled || addedRef.current) return;

    try {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: "raster",
          tiles: [
            "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png",
          ],
          tileSize: 256,
          maxzoom: 8,
        });
      }

      if (!map.getLayer(LAYER_ID)) {
        const insertBefore =
          beforeLayerId && map.getLayer(beforeLayerId)
            ? beforeLayerId
            : undefined;

        map.addLayer(
          {
            id: LAYER_ID,
            type: "raster",
            source: SOURCE_ID,
            paint: {
              "raster-opacity": 0.35,
              "raster-brightness-min": 0,
              "raster-brightness-max": 0.4,
              "raster-contrast": 1,
              "raster-saturation": -0.6,
            },
          },
          insertBefore,
        );
      }

      addedRef.current = true;
    } catch {
      // Clean up orphaned source if layer creation failed
      if (map.getSource(SOURCE_ID) && !map.getLayer(LAYER_ID)) {
        try { map.removeSource(SOURCE_ID); } catch { /* noop */ }
      }
    }
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
