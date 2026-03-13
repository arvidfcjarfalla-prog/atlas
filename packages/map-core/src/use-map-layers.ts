"use client";

import { useEffect, useRef } from "react";
import type { GeoJSONSource, MapLayerMouseEvent } from "maplibre-gl";
import { useMap } from "./use-map";
import { SEVERITY_HEX } from "@atlas/data-models";
import type { GeoEntity } from "@atlas/data-models";

interface UseMapLayersOptions {
  layerId: string;
  entities: GeoEntity[];
  clusterEnabled?: boolean;
  clusterRadius?: number;
  severityColors?: Record<string, string>;
  onFeatureClick?: (entityId: string) => void;
  onFeatureHover?: (entityId: string | null) => void;
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
  onFeatureClick,
  onFeatureHover,
}: UseMapLayersOptions) {
  const { map, isReady } = useMap();
  const onFeatureClickRef = useRef(onFeatureClick);
  onFeatureClickRef.current = onFeatureClick;
  const onFeatureHoverRef = useRef(onFeatureHover);
  onFeatureHoverRef.current = onFeatureHover;

  // Add source + layers + interaction handlers
  useEffect(() => {
    if (!map || !isReady) return;

    const sourceId = `${layerId}-source`;
    const pointsId = `${layerId}-points`;
    const ringsId = `${layerId}-rings`;
    const highlightId = `${layerId}-highlight`;
    const clustersId = `${layerId}-clusters`;
    const clusterCountId = `${layerId}-cluster-count`;

    if (map.getSource(sourceId)) return;

    map.addSource(sourceId, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: clusterEnabled,
      clusterRadius,
      clusterMaxZoom: 14,
    });

    // Cluster circles — muted, dense field feel, not SaaS bubbles
    if (clusterEnabled) {
      // Cluster glow — tight, not bloomy
      const clusterGlowId = `${layerId}-cluster-glow`;
      map.addLayer({
        id: clusterGlowId,
        type: "circle",
        source: sourceId,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "rgba(160, 140, 120, 1)",
            10,
            "rgba(200, 140, 60, 1)",
            50,
            "rgba(220, 90, 50, 1)",
          ],
          "circle-radius": ["step", ["get", "point_count"], 22, 10, 30, 50, 38],
          "circle-blur": 0.8,
          "circle-opacity": ["step", ["get", "point_count"], 0.10, 10, 0.15, 50, 0.22],
        },
      });

      map.addLayer({
        id: clustersId,
        type: "circle",
        source: sourceId,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "rgba(90, 80, 75, 0.9)",
            10,
            "rgba(140, 90, 45, 0.9)",
            50,
            "rgba(180, 70, 40, 0.9)",
          ],
          "circle-radius": ["step", ["get", "point_count"], 12, 10, 16, 50, 20],
          "circle-opacity": 0.85,
          "circle-stroke-width": 1,
          "circle-stroke-color": "rgba(255,255,255,0.12)",
        },
      });

      map.addLayer({
        id: clusterCountId,
        type: "symbol",
        source: sourceId,
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-size": 10,
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        },
        paint: {
          "text-color": "rgba(255,255,255,0.85)",
        },
      });
    }

    // Unclustered points — sized by severity, luminous style
    const colors = { ...SEVERITY_HEX, ...severityColors };

    const unclusteredFilter: ["!", ["has", "point_count"]] | ["literal", true] = clusterEnabled
      ? ["!", ["has", "point_count"]]
      : ["literal", true];

    // Glow layer — tight point-source energy, not soft UI shadow
    const glowId = `${layerId}-glow`;
    map.addLayer({
      id: glowId,
      type: "circle",
      source: sourceId,
      filter: unclusteredFilter,
      paint: {
        "circle-color": [
          "match",
          ["get", "severity"],
          "critical", colors.critical,
          "high", colors.high,
          "medium", colors.medium,
          colors.low,
        ],
        "circle-radius": [
          "match",
          ["get", "severity"],
          "critical", 30,
          "high", 22,
          "medium", 14,
          8,
        ],
        "circle-blur": 0.8,
        "circle-opacity": [
          "match",
          ["get", "severity"],
          "critical", 0.5,
          "high", 0.4,
          "medium", 0.15,
          0.06,
        ],
      },
    });

    // Core dot — severity-colored, embedded into the surface
    map.addLayer({
      id: pointsId,
      type: "circle",
      source: sourceId,
      filter: unclusteredFilter,
      paint: {
        "circle-color": [
          "match",
          ["get", "severity"],
          "critical", colors.critical,
          "high", colors.high,
          "medium", colors.medium,
          colors.low,
        ],
        "circle-radius": [
          "match",
          ["get", "severity"],
          "critical", 6,
          "high", 5,
          "medium", 3,
          2,
        ],
        "circle-stroke-width": [
          "match",
          ["get", "severity"],
          "critical", 1.5,
          "high", 1,
          0.5,
        ],
        "circle-stroke-color": [
          "match",
          ["get", "severity"],
          "critical", "rgba(255,255,255,0.7)",
          "high", "rgba(255,255,255,0.5)",
          "rgba(255,255,255,0.15)",
        ],
        "circle-opacity": 1,
      },
    });

    // Outer ring for high + critical — pulsing halo boundary
    map.addLayer({
      id: ringsId,
      type: "circle",
      source: sourceId,
      filter: clusterEnabled
        ? ["all", ["!", ["has", "point_count"]], ["in", ["get", "severity"], ["literal", ["high", "critical"]]]]
        : ["in", ["get", "severity"], ["literal", ["high", "critical"]]],
      paint: {
        "circle-color": "transparent",
        "circle-radius": [
          "match",
          ["get", "severity"],
          "critical", 14,
          11,
        ],
        "circle-stroke-width": [
          "match",
          ["get", "severity"],
          "critical", 1.5,
          1,
        ],
        "circle-stroke-color": [
          "match",
          ["get", "severity"],
          "critical", colors.critical,
          colors.high,
        ],
        "circle-stroke-opacity": 0.5,
      },
    });

    // Highlight ring — shown on hover via feature-state
    map.addLayer({
      id: highlightId,
      type: "circle",
      source: sourceId,
      filter: unclusteredFilter,
      paint: {
        "circle-color": "transparent",
        "circle-radius": [
          "match",
          ["get", "severity"],
          "critical", 20,
          "high", 16,
          "medium", 12,
          10,
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "rgba(255,255,255,0.6)",
        "circle-stroke-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 1, 0],
      },
    });

    // Text labels — show title for high + critical at close zoom
    const labelsId = `${layerId}-labels`;
    map.addLayer({
      id: labelsId,
      type: "symbol",
      source: sourceId,
      filter: clusterEnabled
        ? ["all", ["!", ["has", "point_count"]], ["in", ["get", "severity"], ["literal", ["high", "critical"]]]]
        : ["in", ["get", "severity"], ["literal", ["high", "critical"]]],
      minzoom: 4,
      layout: {
        "text-field": ["get", "title"],
        "text-size": 11,
        "text-offset": [0, -2.2],
        "text-anchor": "bottom",
        "text-max-width": 12,
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "rgba(255,255,255,0.85)",
        "text-halo-color": "rgba(0,0,0,0.7)",
        "text-halo-width": 1.5,
        "text-halo-blur": 0.5,
      },
    });

    // Interaction handlers
    const canvas = map.getCanvas();

    let hoveredFeatureId: string | number | null = null;

    const handlePointMouseEnter = (e: MapLayerMouseEvent) => {
      canvas.style.cursor = "pointer";
      const feature = e.features?.[0];
      if (feature?.id != null) {
        hoveredFeatureId = feature.id;
        map.setFeatureState({ source: sourceId, id: feature.id }, { hover: true });
        const entityId = feature.properties?.id as string | undefined;
        if (entityId) onFeatureHoverRef.current?.(entityId);
      }
    };

    const handlePointMouseLeave = () => {
      canvas.style.cursor = "";
      if (hoveredFeatureId != null) {
        map.setFeatureState({ source: sourceId, id: hoveredFeatureId }, { hover: false });
        hoveredFeatureId = null;
        onFeatureHoverRef.current?.(null);
      }
    };

    const handlePointClick = (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const id = feature.properties?.id as string | undefined;
      if (id) onFeatureClickRef.current?.(id);
    };

    const handleClusterClick = (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const clusterId = feature.properties?.cluster_id as number | undefined;
      if (clusterId == null) return;
      const source = map.getSource(sourceId) as GeoJSONSource;
      source.getClusterExpansionZoom(clusterId).then((zoom) => {
        const geometry = feature.geometry;
        if (geometry.type !== "Point") return;
        map.easeTo({
          center: geometry.coordinates as [number, number],
          zoom,
        });
      });
    };

    map.on("mouseenter", pointsId, handlePointMouseEnter);
    map.on("mouseleave", pointsId, handlePointMouseLeave);
    map.on("click", pointsId, handlePointClick);

    if (clusterEnabled) {
      map.on("mouseenter", clustersId, handlePointMouseEnter);
      map.on("mouseleave", clustersId, handlePointMouseLeave);
      map.on("click", clustersId, handleClusterClick);
    }

    return () => {
      map.off("mouseenter", pointsId, handlePointMouseEnter);
      map.off("mouseleave", pointsId, handlePointMouseLeave);
      map.off("click", pointsId, handlePointClick);

      if (clusterEnabled) {
        map.off("mouseenter", clustersId, handlePointMouseEnter);
        map.off("mouseleave", clustersId, handlePointMouseLeave);
        map.off("click", clustersId, handleClusterClick);
      }

      if (!map.getSource(sourceId)) return;
      const clusterGlowId = `${layerId}-cluster-glow`;
      [labelsId, highlightId, ringsId, pointsId, glowId, clusterCountId, clustersId, clusterGlowId].forEach((id) => {
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

    const features = entities.map((entity, idx) => ({
      type: "Feature" as const,
      id: idx,
      geometry: {
        type: "Point" as const,
        coordinates: [entity.coordinates[1], entity.coordinates[0]],
      },
      properties: {
        id: entity.id,
        title: entity.title,
        category: entity.category,
        severity: entity.severity ?? "low",
        sourceCount: entity.sourceCount ?? 1,
        occurredAt: entity.occurredAt ?? "",
        depth: (entity.properties?.depth as number) ?? 0,
      },
    }));

    source.setData({ type: "FeatureCollection", features });
  }, [map, isReady, layerId, entities]);
}
