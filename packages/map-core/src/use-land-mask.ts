"use client";

import { useEffect, useRef } from "react";
import { useMap } from "./use-map";

interface UseLandMaskOptions {
  /** Land fill color. */
  color?: string;
  /** Insert below this layer ID. */
  beforeLayerId?: string;
}

const SOURCE_ID = "land-mask-source";
const LAYER_ID = "land-mask-fill";

/**
 * Adds a Natural Earth land polygon layer that ensures continents
 * are visible at all zoom levels — including zoom 0-4 where CARTO
 * Dark Matter doesn't render its own land fills.
 *
 * Uses ne_110m_land.geojson (~138KB, simplified for global views).
 */
export function useLandMask({
  color = "#151921",
  beforeLayerId,
}: UseLandMaskOptions = {}) {
  const { map, isReady } = useMap();
  const addedRef = useRef(false);

  useEffect(() => {
    if (!map || !isReady || addedRef.current) return;

    try {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson",
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
            type: "fill",
            source: SOURCE_ID,
            paint: {
              "fill-color": color,
              // Full opacity at zoom 0-1, gone by zoom 3 before edges get visible.
              "fill-opacity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                1, 1,
                3, 0,
              ],
            },
          },
          insertBefore,
        );
      }

      addedRef.current = true;
    } catch {
      if (map.getSource(SOURCE_ID) && !map.getLayer(LAYER_ID)) {
        try { map.removeSource(SOURCE_ID); } catch { /* noop */ }
      }
    }
  }, [map, isReady, color, beforeLayerId]);

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
