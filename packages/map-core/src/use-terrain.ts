"use client";

import { useEffect, useRef } from "react";
import { useMap } from "./use-map";

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
  const { map, isReady } = useMap();
  const addedRef = useRef(false);

  useEffect(() => {
    if (!map || !isReady || !enabled || addedRef.current) return;

    // Add DEM source if hillshade hasn't already added one
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
    addedRef.current = true;
  }, [map, isReady, enabled, exaggeration]);

  useEffect(() => {
    return () => {
      if (!map || !addedRef.current) return;
      try {
        map.setTerrain(null);
        // Don't remove source — hillshade may still use it
      } catch {
        // Map may already be removed
      }
      addedRef.current = false;
    };
  }, [map]);
}
