"use client";

import { useEffect } from "react";
import type { GeoJSONSource } from "maplibre-gl";
import { useMap } from "./use-map";
import type { GeoEntity } from "@atlas/data-models";

interface UseMapLayersOptions {
  layerId: string;
  entities: GeoEntity[];
  clusterEnabled?: boolean;
  clusterRadius?: number;
  severityColors?: Record<string, string>;
}

/**
 * Manages a GeoJSON source + circle/cluster layers on the map.
 * Adds source and layers on mount, updates data reactively, cleans up on unmount.
 */
export function useMapLayers({
  layerId,
  entities,
  clusterEnabled = true,
  clusterRadius = 50,
  severityColors,
}: UseMapLayersOptions) {
  const { map, isReady } = useMap();

  // Add source + layers
  useEffect(() => {
    if (!map || !isReady) return;

    const sourceId = `${layerId}-source`;

    if (map.getSource(sourceId)) return;

    map.addSource(sourceId, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: clusterEnabled,
      clusterRadius,
      clusterMaxZoom: 14,
    });

    // Cluster circles
    if (clusterEnabled) {
      map.addLayer({
        id: `${layerId}-clusters`,
        type: "circle",
        source: sourceId,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "hsl(var(--primary))",
            10,
            "hsl(var(--warning))",
            50,
            "hsl(var(--destructive))",
          ],
          "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 50, 32],
          "circle-opacity": 0.85,
        },
      });

      map.addLayer({
        id: `${layerId}-cluster-count`,
        type: "symbol",
        source: sourceId,
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-size": 12,
        },
        paint: {
          "text-color": "#ffffff",
        },
      });
    }

    // Unclustered points
    const defaultColors = {
      low: "#6b7280",
      medium: "#eab308",
      high: "#ef4444",
      critical: "#dc2626",
    };
    const colors = { ...defaultColors, ...severityColors };

    map.addLayer({
      id: `${layerId}-points`,
      type: "circle",
      source: sourceId,
      filter: clusterEnabled ? ["!", ["has", "point_count"]] : ["literal", true],
      paint: {
        "circle-color": [
          "match",
          ["get", "severity"],
          "critical", colors.critical,
          "high", colors.high,
          "medium", colors.medium,
          colors.low,
        ],
        "circle-radius": 6,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "rgba(0,0,0,0.3)",
        "circle-opacity": 0.9,
      },
    });

    return () => {
      if (!map.getSource(sourceId)) return;
      [`${layerId}-points`, `${layerId}-cluster-count`, `${layerId}-clusters`].forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      map.removeSource(sourceId);
    };
  }, [map, isReady, layerId, clusterEnabled, clusterRadius, severityColors]);

  // Update data
  useEffect(() => {
    if (!map || !isReady) return;

    const sourceId = `${layerId}-source`;
    const source = map.getSource(sourceId) as GeoJSONSource | undefined;
    if (!source) return;

    const features = entities.map((entity) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [entity.coordinates[1], entity.coordinates[0]], // GeoJSON is [lng, lat]
      },
      properties: {
        id: entity.id,
        title: entity.title,
        category: entity.category,
        severity: entity.severity ?? "low",
        sourceCount: entity.sourceCount ?? 1,
      },
    }));

    source.setData({ type: "FeatureCollection", features });
  }, [map, isReady, layerId, entities]);
}
