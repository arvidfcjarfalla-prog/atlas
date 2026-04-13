"use client";

import { useMapLayerResource } from "./use-map-layer-resource";

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
  useMapLayerResource({
    sourceId: SOURCE_ID,
    layerIds: [GLOW_ID, LINE_ID],
    enabled,
    beforeLayerId,
    // Optional structural overlay — silently skip if /data/plates.geojson is missing.
    silentOnFailure: true,
    setup: async (map, { insertBefore, signal }) => {
      const res = await fetch("/data/plates.geojson");
      const geojson = await res.json();
      if (signal.cancelled) return;
      if (map.getSource(SOURCE_ID)) return;

      map.addSource(SOURCE_ID, { type: "geojson", data: geojson });

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
        insertBefore,
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
        insertBefore,
      );
    },
  });
}
