"use client";

import { useEffect } from "react";
import { useBasemapLayers, useManifestRenderer } from "@atlas/map-core";
import type { CompiledLegendItem } from "@atlas/map-core";
import type { MapManifest } from "@atlas/data-models";

/**
 * Shared map content component — renders inside MapShell context.
 * Calls useBasemapLayers + useManifestRenderer hooks.
 * Returns null (all rendering happens via hooks).
 */
export function MapContent({
  manifest,
  data,
  onLegendItems,
}: {
  manifest: MapManifest;
  data: GeoJSON.FeatureCollection | string;
  onLegendItems: (items: CompiledLegendItem[]) => void;
}) {
  useBasemapLayers({ basemap: manifest.basemap });

  const layer = manifest.layers[0];
  const { legendItems } = useManifestRenderer({ layer, data });

  useEffect(() => {
    onLegendItems(legendItems);
  }, [legendItems, onLegendItems]);

  return null;
}
