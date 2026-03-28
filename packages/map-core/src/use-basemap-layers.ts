"use client";

import type { BasemapConfig } from "@atlas/data-models";
import { useHillshade } from "./use-hillshade";
import { useNightlights } from "./use-nightlights";
import { useLandMask } from "./use-land-mask";
import { useTerrain } from "./use-terrain";
import { useTectonicLayers } from "./use-tectonic-layers";
import { useContourLines } from "./use-contour-lines";

interface UseBasemapLayersOptions {
  basemap?: BasemapConfig;
  /** Insert basemap layers before this layer ID. */
  beforeLayerId?: string;
  /** Land color from the active basemap preset — passed to land mask. */
  landColor?: string;
}

/**
 * Activates basemap layers based on manifest configuration.
 *
 * Reads the basemap config and conditionally enables:
 * - Land mask (always on for dark themes)
 * - Hillshade terrain relief
 * - Nightlights city lights
 * - 3D terrain
 * - Tectonic plate boundaries
 */
export function useBasemapLayers({
  basemap,
  beforeLayerId,
  landColor,
}: UseBasemapLayersOptions = {}) {
  useLandMask({
    color: landColor,
    beforeLayerId,
  });

  useHillshade({
    enabled: basemap?.hillshade ?? false,
    beforeLayerId,
  });

  useNightlights({
    enabled: basemap?.nightlights ?? false,
    beforeLayerId,
  });

  useTerrain({
    enabled: typeof basemap?.terrain === "boolean"
      ? basemap.terrain
      : basemap?.terrain != null,
    exaggeration:
      typeof basemap?.terrain === "object"
        ? basemap.terrain.exaggeration ?? 1.5
        : 1.5,
  });

  useTectonicLayers({
    enabled: basemap?.tectonic ?? false,
    beforeLayerId,
  });

  const contourEnabled = basemap?.contourLines != null && basemap.contourLines !== false;
  const contourConfig = typeof basemap?.contourLines === "object" ? basemap.contourLines : undefined;
  useContourLines({
    enabled: contourEnabled,
    config: contourConfig,
    beforeLayerId,
  });
}
