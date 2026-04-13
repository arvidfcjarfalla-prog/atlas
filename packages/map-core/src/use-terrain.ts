"use client";

import { useMapLayerResource } from "./use-map-layer-resource";

interface UseTerrainOptions {
  /** Enable 3D terrain. */
  enabled?: boolean;
  /** Vertical exaggeration factor. */
  exaggeration?: number;
}

const SOURCE_ID = "terrain-dem-source";

/**
 * Activates MapLibre 3D terrain rendering using AWS Terrarium DEM tiles.
 * Shares the same tile source as hillshade but adds actual elevation
 * displacement to the map surface.
 */
export function useTerrain({
  enabled = true,
  exaggeration = 1.5,
}: UseTerrainOptions = {}) {
  useMapLayerResource({
    sourceId: SOURCE_ID,
    layerIds: [],
    enabled,
    keepSourceOnUnmount: true,
    deps: [exaggeration],
    setup: (map) => {
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
      map.setTerrain({ source: SOURCE_ID, exaggeration });
    },
    teardown: (map) => {
      map.setTerrain(null);
    },
  });
}
