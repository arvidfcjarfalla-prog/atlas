"use client";

import { useEffect, useRef } from "react";
import { useMap } from "./use-map";

interface UseActivityFieldOptions {
  /** Layer ID prefix — must match the layerId used in useMapLayers. */
  layerId: string;
  /** Insert the heatmap layer below this layer ID. */
  beforeLayerId?: string;
}

const HEATMAP_ID_SUFFIX = "-activity-field";

/**
 * Adds an ultra-subtle heatmap that shows global seismic activity zones.
 *
 * This creates the "background energy" that makes active regions
 * (Ring of Fire, Mediterranean belt, mid-ocean ridges) glow faintly.
 * Opacity is intentionally very low (0.06-0.08) — structure, not content.
 *
 * Reuses the existing GeoJSON source from useMapLayers (same sourceId).
 * Must be called after useMapLayers has created the source.
 */
export function useActivityField({
  layerId,
  beforeLayerId,
}: UseActivityFieldOptions) {
  const { map, isReady } = useMap();
  const addedRef = useRef(false);

  useEffect(() => {
    if (!map || !isReady || addedRef.current) return;

    const sourceId = `${layerId}-source`;
    const heatmapId = `${layerId}${HEATMAP_ID_SUFFIX}`;

    if (!map.getSource(sourceId)) return;
    if (map.getLayer(heatmapId)) return;

    map.addLayer(
      {
        id: heatmapId,
        type: "heatmap",
        source: sourceId,
        // Show the activity field at low zoom; fade as you zoom in
        maxzoom: 9,
        paint: {
          // Weight by severity — larger events create more field energy
          "heatmap-weight": [
            "match",
            ["get", "severity"],
            "critical", 1,
            "high", 0.7,
            "medium", 0.4,
            0.15,
          ],
          // Radius grows with zoom
          "heatmap-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0, 20,
            4, 30,
            8, 40,
          ],
          // Very low opacity — background energy, not content
          "heatmap-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0, 0.10,
            4, 0.12,
            8, 0.06,
            9, 0,
          ],
          // Deep subsurface ramp — geological heat, not UI glow
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0, "rgba(0, 0, 0, 0)",
            0.15, "rgba(80, 20, 10, 0.3)",
            0.35, "rgba(140, 40, 15, 0.5)",
            0.55, "rgba(180, 60, 20, 0.7)",
            0.75, "rgba(200, 80, 25, 0.85)",
            1.0, "rgba(220, 100, 30, 1)",
          ],
          // Intensity
          "heatmap-intensity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0, 0.6,
            4, 0.8,
            8, 1,
          ],
        },
      },
      beforeLayerId,
    );

    addedRef.current = true;
  }, [map, isReady, layerId, beforeLayerId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (!map || !addedRef.current) return;
      const heatmapId = `${layerId}${HEATMAP_ID_SUFFIX}`;
      try {
        if (map.getLayer(heatmapId)) map.removeLayer(heatmapId);
      } catch {
        // Map may already be removed
      }
      addedRef.current = false;
    };
  }, [map, layerId]);
}
