"use client";

import { useEffect, useRef, useMemo } from "react";
import type { MapLayerMouseEvent, GeoJSONSource } from "maplibre-gl";
import { useMap } from "./use-map";
import type { LayerManifest } from "@atlas/data-models";
import {
  compileLayer,
  type CompiledLayer,
  type CompiledLegendItem,
} from "./manifest-compiler";

interface UseManifestRendererOptions {
  /** Layer manifest to render. */
  layer: LayerManifest;
  /** GeoJSON data or URL string. */
  data: GeoJSON.FeatureCollection | string;
  /** Insert all layers before this layer ID. */
  beforeLayerId?: string;
  /** Callback when a feature is clicked. */
  onFeatureClick?: (properties: Record<string, unknown>) => void;
  /** Callback when a feature is hovered (null on leave). */
  onFeatureHover?: (properties: Record<string, unknown> | null) => void;
}

interface UseManifestRendererResult {
  legendItems: CompiledLegendItem[];
}

/**
 * Renders a LayerManifest on the map using compiled MapLibre layers.
 *
 * Handles source/layer lifecycle, data updates, click/hover interactions,
 * and cleanup on unmount.
 */
export function useManifestRenderer({
  layer,
  data,
  beforeLayerId,
  onFeatureClick,
  onFeatureHover,
}: UseManifestRendererOptions): UseManifestRendererResult {
  const { map, isReady } = useMap();
  const addedRef = useRef(false);
  const onClickRef = useRef(onFeatureClick);
  onClickRef.current = onFeatureClick;
  const onHoverRef = useRef(onFeatureHover);
  onHoverRef.current = onFeatureHover;

  // Compile the layer specification
  const compiled: CompiledLayer | null = useMemo(() => {
    if (typeof data === "string") {
      // URL — create a minimal FeatureCollection for compile, actual data loaded by MapLibre
      return compileLayer(layer, { type: "FeatureCollection", features: [] });
    }
    return compileLayer(layer, data);
  }, [layer, data]);

  // Add source + layers
  useEffect(() => {
    if (!map || !isReady || !compiled || addedRef.current) return;

    try {
      const sourceConfig =
        typeof data === "string"
          ? { ...compiled.sourceConfig, data }
          : compiled.sourceConfig;

      if (!map.getSource(compiled.sourceId)) {
        map.addSource(compiled.sourceId, sourceConfig);
      }

      for (const layerSpec of compiled.layers) {
        if (!map.getLayer(layerSpec.id)) {
          const insertBefore =
            beforeLayerId && map.getLayer(beforeLayerId)
              ? beforeLayerId
              : undefined;
          map.addLayer(layerSpec, insertBefore);
        }
      }

      addedRef.current = true;
    } catch {
      // Clean up orphaned source
      if (
        map.getSource(compiled.sourceId) &&
        compiled.layers.every((l) => !map.getLayer(l.id))
      ) {
        try {
          map.removeSource(compiled.sourceId);
        } catch {
          /* noop */
        }
      }
    }
  }, [map, isReady, compiled, data, beforeLayerId]);

  // Update data when it changes (inline GeoJSON only)
  useEffect(() => {
    if (!map || !isReady || !compiled || !addedRef.current) return;
    if (typeof data === "string") return;

    const source = map.getSource(compiled.sourceId) as GeoJSONSource | undefined;
    if (source) {
      source.setData(data);
    }
  }, [map, isReady, compiled, data]);

  // Interaction handlers
  useEffect(() => {
    if (!map || !isReady || !compiled || !addedRef.current) return;

    const clickBehavior = layer.interaction?.clickBehavior ?? "popup";
    const hoverEffect = layer.interaction?.hoverEffect ?? "highlight";

    // Find the main interactive layer (first non-cluster layer)
    const interactiveLayerId = compiled.layers.find(
      (l) => !l.id.endsWith("-highlight") && !l.id.endsWith("-cluster-count"),
    )?.id;

    if (!interactiveLayerId) return;

    const canvas = map.getCanvas();
    let hoveredFeatureId: string | number | null = null;

    const handleMouseEnter = (e: MapLayerMouseEvent) => {
      canvas.style.cursor = "pointer";
      const feature = e.features?.[0];
      if (!feature) return;

      if (hoverEffect === "highlight" && feature.id != null) {
        hoveredFeatureId = feature.id;
        map.setFeatureState(
          { source: compiled.sourceId, id: feature.id },
          { hover: true },
        );
      }

      if (onHoverRef.current) {
        onHoverRef.current(
          (feature.properties as Record<string, unknown>) ?? {},
        );
      }
    };

    const handleMouseLeave = () => {
      canvas.style.cursor = "";
      if (hoveredFeatureId != null) {
        map.setFeatureState(
          { source: compiled.sourceId, id: hoveredFeatureId },
          { hover: false },
        );
        hoveredFeatureId = null;
      }
      onHoverRef.current?.(null);
    };

    const handleClick = (e: MapLayerMouseEvent) => {
      if (clickBehavior === "none") return;
      const feature = e.features?.[0];
      if (!feature) return;

      if (clickBehavior === "fly-to" && feature.geometry.type === "Point") {
        map.flyTo({
          center: feature.geometry.coordinates as [number, number],
          zoom: Math.max(map.getZoom(), 10),
          duration: 800,
        });
      }

      onClickRef.current?.(
        (feature.properties as Record<string, unknown>) ?? {},
      );
    };

    map.on("mouseenter", interactiveLayerId, handleMouseEnter);
    map.on("mouseleave", interactiveLayerId, handleMouseLeave);
    map.on("click", interactiveLayerId, handleClick);

    return () => {
      map.off("mouseenter", interactiveLayerId, handleMouseEnter);
      map.off("mouseleave", interactiveLayerId, handleMouseLeave);
      map.off("click", interactiveLayerId, handleClick);
    };
  }, [map, isReady, compiled, layer.interaction]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (!map || !compiled || !addedRef.current) return;
      try {
        // Remove layers in reverse order
        for (let i = compiled.layers.length - 1; i >= 0; i--) {
          const id = compiled.layers[i].id;
          if (map.getLayer(id)) map.removeLayer(id);
        }
        if (map.getSource(compiled.sourceId)) {
          map.removeSource(compiled.sourceId);
        }
      } catch {
        // Map may already be destroyed
      }
      addedRef.current = false;
    };
  }, [map, compiled]);

  return {
    legendItems: compiled?.legendItems ?? [],
  };
}
