export { MapShell } from "./map-shell";
export { MapViewport } from "./map-viewport";
export { MapControls } from "./map-controls";
export { MapContext, useMap } from "./use-map";
export { useMapLayers } from "./use-map-layers";
export { useTectonicLayers } from "./use-tectonic-layers";
export { useRippleLayers } from "./use-ripple-layers";
export { MapAtmosphere } from "./map-atmosphere";
export { useActivityField } from "./use-activity-field";
export { useHillshade } from "./use-hillshade";
export { useNightlights } from "./use-nightlights";
export { useLandMask } from "./use-land-mask";
export { useTerrain } from "./use-terrain";
export type { MapShellProps, MapContextValue, MaplibreMap } from "./types";

// v2: Manifest-driven rendering
export { compileLayer } from "./manifest-compiler";
export type { CompiledLayer, CompiledLegendItem, CompiledSourceConfig } from "./manifest-compiler";
export { useManifestRenderer } from "./use-manifest-renderer";
export { useBasemapLayers } from "./use-basemap-layers";
