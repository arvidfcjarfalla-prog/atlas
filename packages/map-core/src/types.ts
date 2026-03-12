import type { MapManifest } from "@atlas/data-models";
import type { Map as MaplibreMap } from "maplibre-gl";

export type { MapManifest, MaplibreMap };

export interface MapContextValue {
  map: MaplibreMap | null;
  isReady: boolean;
}

export interface MapShellProps {
  manifest: MapManifest;
  sidebar?: React.ReactNode;
  detailPanel?: React.ReactNode;
  sidebarOpen?: boolean;
  panelOpen?: boolean;
  children?: React.ReactNode;
  /** Extra controls rendered on the map (timeline, legend, etc.) */
  overlay?: React.ReactNode;
}
