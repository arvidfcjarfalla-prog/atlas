"use client";

import { useMapLayerResource } from "./use-map-layer-resource";

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
 * Uses AWS/Mapzen Terrarium tiles (free, no API key, global coverage).
 */
export function useHillshade({
  enabled = true,
  beforeLayerId,
}: UseHillshadeOptions = {}) {
  useMapLayerResource({
    sourceId: SOURCE_ID,
    layerIds: [LAYER_ID],
    enabled,
    beforeLayerId,
    setup: (map, { insertBefore }) => {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: "raster-dem",
          tiles: [
            "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
          ],
          encoding: "terrarium",
          tileSize: 256,
          maxzoom: 15,
        });
      }

      if (!map.getLayer(LAYER_ID)) {
        map.addLayer(
          {
            id: LAYER_ID,
            type: "hillshade",
            source: SOURCE_ID,
            maxzoom: 8,
            paint: {
              "hillshade-exaggeration": 0.4,
              "hillshade-shadow-color": "rgba(0, 0, 0, 0.6)",
              "hillshade-highlight-color": "rgba(180, 200, 220, 0.10)",
              "hillshade-accent-color": "rgba(50, 60, 75, 1)",
              "hillshade-illumination-direction": 315,
              "hillshade-illumination-anchor": "map",
            },
          },
          insertBefore,
        );
      }
    },
  });
}
