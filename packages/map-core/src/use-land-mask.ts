"use client";

import { useMapLayerResource } from "./use-map-layer-resource";

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
  useMapLayerResource({
    sourceId: SOURCE_ID,
    layerIds: [LAYER_ID],
    beforeLayerId,
    deps: [color],
    setup: (map, { insertBefore }) => {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson",
        });
      }

      if (!map.getLayer(LAYER_ID)) {
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
    },
  });
}
