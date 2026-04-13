export { MapShell } from "./map-shell";
export { MapViewport, getBasemapLandColor } from "./map-viewport";
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
export type { MaplibreMap } from "./types";

// v2: Manifest-driven rendering
export { compileLayer } from "./manifest-compiler";
export type { CompiledLayer, CompiledLegendItem, TimelineMetadata, DeckLayerConfig } from "./manifest-compiler";
export { useManifestRenderer } from "./use-manifest-renderer";
export type { ImageFillMetadata, ChartOverlayMetadata } from "./use-manifest-renderer";
export { useBasemapLayers } from "./use-basemap-layers";
export { CoordinateWidget } from "./coordinate-widget";
export { useTimelinePlayback } from "./use-timeline-playback";
export type { TimelinePlaybackState, PlaybackSpeed } from "@atlas/data-models";
export { useRouteAnimation, type RouteAnimationState } from "./use-route-animation";
export { useImageFills } from "./use-image-fills";
export { GeocoderControl } from "./geocoder-control";
export { MeasureControl } from "./measure-control";
export { CompareView } from "./compare-view";
export { useDeckOverlay } from "./use-deck-overlay";
