"use client";

import { useMap } from "@atlas/map-core";
import type { ChartOverlayMetadata } from "@atlas/map-core";
import { ChartOverlay } from "@atlas/map-modules";

export function ChartOverlayWrapper({ metadata }: { metadata: ChartOverlayMetadata }) {
  const { map, isReady } = useMap();
  if (!map || !isReady) return null;
  return <ChartOverlay map={map} metadata={metadata} />;
}
