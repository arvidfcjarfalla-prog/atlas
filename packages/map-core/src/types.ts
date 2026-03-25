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
  /**
   * Override camera padding. If omitted, MapShell computes it automatically
   * from sidebarOpen/panelOpen so that the map centres within the visible area.
   */
  cameraPadding?: CameraPadding;
  /** Called with the MapLibre instance once the map is loaded. Used for camera sync in compare views. */
  onMapReady?: (map: MaplibreMap) => void;
  /** Sidebar width in px (default 320). Passed to SidebarLayout. */
  sidebarWidth?: number;
  /** Panel width in px (default 384). Passed to SidebarLayout. */
  panelWidth?: number;
}

/** Pixel insets that describe which parts of the map viewport are obscured by UI chrome. */
export interface CameraPadding {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}
