"use client";

import { useEffect, useState, useCallback } from "react";
import type { ChartOverlayConfig } from "@atlas/data-models";
import { MiniBar } from "./mini-bar";
import { MiniPie } from "./mini-pie";
import { MiniSparkline } from "./mini-sparkline";

interface ChartFeature {
  centroid: [number, number]; // [lng, lat]
  values: number[];
  label?: string;
}

interface ChartOverlayMetadata {
  config: ChartOverlayConfig;
  features: ChartFeature[];
}

/** Minimal map interface for projection — avoids maplibre-gl dependency. */
interface MapLike {
  getZoom(): number;
  getBounds(): { contains(lnglat: [number, number]): boolean };
  project(lnglat: [number, number]): { x: number; y: number };
  on(type: string, fn: () => void): void;
  off(type: string, fn: () => void): void;
}

/**
 * Chart overlay container.
 *
 * Subscribes to map move/zoom events, projects centroids to screen pixels,
 * and renders mini charts as absolutely positioned divs.
 *
 * Uses pointer-events: none so clicks pass through to the map.
 */
export function ChartOverlay({
  map,
  metadata,
}: {
  /** MapLibre map instance (or any object implementing MapLike). */
  map: MapLike;
  metadata: ChartOverlayMetadata;
}) {
  const { config, features } = metadata;
  const size = config.size ?? 40;
  const minZoom = config.minZoom ?? 3;
  const maxVisible = config.maxVisible ?? 50;

  const [positions, setPositions] = useState<Array<{ x: number; y: number; idx: number }>>([]);

  const updatePositions = useCallback(() => {
    const zoom = map.getZoom();
    if (zoom < minZoom) {
      setPositions([]);
      return;
    }

    const bounds = map.getBounds();
    const visible: Array<{ x: number; y: number; idx: number }> = [];

    for (let i = 0; i < features.length && visible.length < maxVisible; i++) {
      const [lng, lat] = features[i].centroid;
      if (!bounds.contains([lng, lat])) continue;

      const point = map.project([lng, lat]);
      visible.push({ x: point.x, y: point.y, idx: i });
    }

    setPositions(visible);
  }, [map, features, minZoom, maxVisible]);

  useEffect(() => {
    updatePositions();
    map.on("move", updatePositions);
    map.on("zoom", updatePositions);
    return () => {
      map.off("move", updatePositions);
      map.off("zoom", updatePositions);
    };
  }, [map, updatePositions]);

  if (positions.length === 0) return null;

  const ChartComponent = config.type === "pie" ? MiniPie
    : config.type === "sparkline" ? MiniSparkline
    : MiniBar;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 5,
      }}
    >
      {positions.map(({ x, y, idx }) => {
        const feature = features[idx];
        return (
          <div
            key={idx}
            style={{
              position: "absolute",
              left: x - size / 2,
              top: y - size / 2,
              width: size,
              height: size,
              background: "rgba(12,16,24,0.65)",
              backdropFilter: "blur(4px)",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ChartComponent
              values={feature.values}
              labels={config.labels}
              size={size - 8}
            />
          </div>
        );
      })}
    </div>
  );
}
