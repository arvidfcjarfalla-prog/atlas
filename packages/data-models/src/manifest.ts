import type { EntityKind } from "./entities/base";

export type MapTheme = "editorial" | "explore" | "decision";

/** Declarative config that defines a map product. */
export interface MapManifest {
  id: string;
  title: string;
  description: string;
  theme: MapTheme;
  defaultCenter?: [number, number]; // [lat, lng]
  defaultZoom?: number;
  defaultBounds?: [[number, number], [number, number]];
  layers: LayerManifest[];
  timeline?: { enabled: boolean };
  modules?: {
    search?: boolean;
    legend?: boolean;
    detailPanel?: boolean;
  };
}

export interface LayerManifest {
  id: string;
  kind: EntityKind;
  label: string;
  sourceType: "geojson-url" | "geojson-static" | "api" | "pmtiles";
  sourceUrl?: string;
  refreshIntervalMs?: number;
  style: LayerStyle;
  attribution?: string;
  license?: string;
}

export interface LayerStyle {
  markerShape: "circle" | "icon";
  colorField?: string;
  sizeField?: string;
  clusterEnabled?: boolean;
  clusterRadius?: number;
  minZoom?: number;
  maxZoom?: number;
}
