"use client";

import { useEffect, useState, useCallback } from "react";
import type { ChartOverlayConfig } from "@atlas/data-models";
import { MiniBar } from "./mini-bar";
import { MiniPie } from "./mini-pie";
import { MiniSparkline } from "./mini-sparkline";
import {
  computeVisiblePositions,
  type FeaturePosition,
  type MapLike,
} from "./positions";

interface ChartFeature {
  centroid: [number, number]; // [lng, lat]
  values: number[];
  label?: string;
}

interface ChartOverlayMetadata {
  config: ChartOverlayConfig;
  features: ChartFeature[];
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

  const [positions, setPositions] = useState<FeaturePosition[]>([]);

  const updatePositions = useCallback(() => {
    setPositions(computeVisiblePositions(map, features, minZoom, maxVisible));
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
