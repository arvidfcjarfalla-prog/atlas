"use client";

import type { MapShellProps } from "./types";
import { MapViewport } from "./map-viewport";
import { SidebarLayout } from "@atlas/ui";

/**
 * Top-level map container. Composes layout + MapLibre viewport + overlays.
 * Each map page renders: <MapShell manifest={...} sidebar={...} />
 */
export function MapShell({
  manifest,
  sidebar,
  detailPanel,
  sidebarOpen = true,
  panelOpen = false,
  children,
  overlay,
}: MapShellProps) {
  return (
    <div data-theme={manifest.theme} className="h-full w-full">
      <SidebarLayout
        sidebar={sidebar}
        panel={detailPanel}
        sidebarOpen={sidebarOpen}
        panelOpen={panelOpen}
      >
        <MapViewport manifest={manifest}>
          {children}
          {overlay}
        </MapViewport>
      </SidebarLayout>
    </div>
  );
}
