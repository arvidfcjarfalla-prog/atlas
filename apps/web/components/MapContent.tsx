"use client";

import { useEffect, useRef } from "react";
import {
  useBasemapLayers,
  useManifestRenderer,
  useTimelinePlayback,
  useRouteAnimation,
  useImageFills,
  getBasemapLandColor,
} from "@atlas/map-core";
import type {
  CompiledLegendItem,
  TimelinePlaybackState,
  ChartOverlayMetadata,
} from "@atlas/map-core";
import type { MapManifest } from "@atlas/data-models";

/**
 * Shared map content component — renders inside MapShell context.
 * Calls useBasemapLayers + useManifestRenderer + creative rendering hooks.
 * Returns null (all rendering happens via hooks).
 */
export function MapContent({
  manifest,
  data,
  onLegendItems,
  onTimelineState,
  onChartOverlayMetadata,
  onWarnings,
}: {
  manifest: MapManifest;
  data: GeoJSON.FeatureCollection | string;
  onLegendItems: (items: CompiledLegendItem[]) => void;
  onTimelineState?: (state: TimelinePlaybackState | null) => void;
  onChartOverlayMetadata?: (metadata: ChartOverlayMetadata | null) => void;
  onWarnings?: (warnings: string[]) => void;
}) {
  useBasemapLayers({
    basemap: manifest.basemap,
    landColor: getBasemapLandColor(manifest.basemap?.style),
  });

  const layer = manifest.layers[0];
  const { legendItems, timelineMetadata, animatable, imageFillMetadata, chartOverlayMetadata, warnings, renderError } =
    useManifestRenderer({ layer, data });

  // Timeline playback
  const timelineState = useTimelinePlayback(layer?.id, timelineMetadata);

  // Route animation (auto-plays on mount)
  const routeAnim = useRouteAnimation(
    typeof data === "string" ? null : data,
    animatable,
  );
  const routeAutoPlayed = useRef(false);
  useEffect(() => {
    if (routeAnim && !routeAutoPlayed.current) {
      routeAutoPlayed.current = true;
      routeAnim.play();
    }
  }, [routeAnim]);

  // Image fills
  useImageFills(layer?.id, imageFillMetadata);

  // Lift warnings
  useEffect(() => {
    const all = [...warnings];
    if (renderError) all.push(`Render error: ${renderError}`);
    onWarnings?.(all);
  }, [warnings, renderError, onWarnings]);

  // Lift legend items
  useEffect(() => {
    onLegendItems(legendItems);
  }, [legendItems, onLegendItems]);

  // Lift timeline state
  useEffect(() => {
    onTimelineState?.(timelineState);
  }, [timelineState, onTimelineState]);

  // Lift chart overlay metadata
  useEffect(() => {
    onChartOverlayMetadata?.(chartOverlayMetadata);
  }, [chartOverlayMetadata, onChartOverlayMetadata]);

  return (
    <>
      {manifest.layers.slice(1).map((extraLayer, i) => (
        <ExtraLayer key={extraLayer.id ?? i} layer={extraLayer} data={data} />
      ))}
    </>
  );
}

/** Renders additional layers beyond the first (no interaction/legend). */
function ExtraLayer({ layer, data }: { layer: import("@atlas/data-models").LayerManifest; data: GeoJSON.FeatureCollection | string }) {
  useManifestRenderer({ layer, data });
  return null;
}
