"use client";

import { useEffect, useRef } from "react";
import { useMap } from "./use-map";

interface ContourConfig {
  interval?: number;
  majorInterval?: number;
  opacity?: number;
}

interface UseContourLinesOptions {
  enabled?: boolean;
  config?: ContourConfig;
  beforeLayerId?: string;
}

const SOURCE_ID = "contour-dem-source";
const CONTOUR_LAYER_ID = "contour-lines";
const CONTOUR_MAJOR_LAYER_ID = "contour-lines-major";
const CONTOUR_LABEL_LAYER_ID = "contour-labels";

/**
 * Adds contour lines to the map using maplibre-contour protocol
 * with AWS Terrain Tiles (free, no API key).
 */
export function useContourLines({
  enabled = false,
  config,
  beforeLayerId,
}: UseContourLinesOptions = {}) {
  const { map, isReady } = useMap();
  const addedRef = useRef(false);

  useEffect(() => {
    if (!map || !isReady || !enabled || addedRef.current) return;

    const interval = config?.interval ?? 100;
    const majorInterval = config?.majorInterval ?? 500;
    const opacity = config?.opacity ?? 0.4;

    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { default: mlcontour } = await import("maplibre-contour");

        const demSource = new mlcontour.DemSource({
          url: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
          encoding: "terrarium",
          maxzoom: 12,
          worker: true,
        });

        demSource.setupMaplibre(map as unknown as Parameters<typeof demSource.setupMaplibre>[0]);

        if (!map.getSource(SOURCE_ID)) {
          map.addSource(SOURCE_ID, {
            type: "vector",
            tiles: [
              demSource.contourProtocolUrl({
                multiplier: 1,
                overzoom: 1,
                thresholds: {
                  11: [interval, majorInterval],
                  12: [interval, majorInterval],
                  13: [interval / 2, majorInterval],
                  14: [interval / 2, majorInterval],
                },
                elevationKey: "ele",
                levelKey: "level",
                contourLayer: "contours",
              }),
            ],
            maxzoom: 15,
          } as unknown as maplibregl.SourceSpecification);
        }

        const insertBefore =
          beforeLayerId && map.getLayer(beforeLayerId)
            ? beforeLayerId
            : undefined;

        if (!map.getLayer(CONTOUR_LAYER_ID)) {
          map.addLayer(
            {
              id: CONTOUR_LAYER_ID,
              type: "line",
              source: SOURCE_ID,
              "source-layer": "contours",
              filter: ["==", ["get", "level"], 0],
              paint: {
                "line-color": "rgba(180, 200, 220, 0.25)",
                "line-width": 0.5,
                "line-opacity": opacity,
              },
            },
            insertBefore,
          );
        }

        if (!map.getLayer(CONTOUR_MAJOR_LAYER_ID)) {
          map.addLayer(
            {
              id: CONTOUR_MAJOR_LAYER_ID,
              type: "line",
              source: SOURCE_ID,
              "source-layer": "contours",
              filter: ["==", ["get", "level"], 1],
              paint: {
                "line-color": "rgba(180, 200, 220, 0.45)",
                "line-width": 1,
                "line-opacity": opacity,
              },
            },
            insertBefore,
          );
        }

        if (!map.getLayer(CONTOUR_LABEL_LAYER_ID)) {
          map.addLayer(
            {
              id: CONTOUR_LABEL_LAYER_ID,
              type: "symbol",
              source: SOURCE_ID,
              "source-layer": "contours",
              filter: ["==", ["get", "level"], 1],
              layout: {
                "symbol-placement": "line",
                "text-field": ["concat", ["number-format", ["get", "ele"], {}], " m"],
                "text-size": 9,
                "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
              },
              paint: {
                "text-color": "rgba(180, 200, 220, 0.5)",
                "text-halo-color": "rgba(12, 16, 24, 0.8)",
                "text-halo-width": 1,
              },
            },
            insertBefore,
          );
        }

        addedRef.current = true;
      } catch {
        // maplibre-contour not available or failed
      }
    })();

    return () => {
      cleanup?.();
    };
  }, [map, isReady, enabled, config, beforeLayerId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (!map || !addedRef.current) return;
      try {
        if (map.getLayer(CONTOUR_LABEL_LAYER_ID)) map.removeLayer(CONTOUR_LABEL_LAYER_ID);
        if (map.getLayer(CONTOUR_MAJOR_LAYER_ID)) map.removeLayer(CONTOUR_MAJOR_LAYER_ID);
        if (map.getLayer(CONTOUR_LAYER_ID)) map.removeLayer(CONTOUR_LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        // Map may already be removed
      }
      addedRef.current = false;
    };
  }, [map]);
}
