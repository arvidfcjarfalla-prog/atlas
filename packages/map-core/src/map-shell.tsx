"use client";

import type { CameraPadding, MapShellProps } from "./types";
import { MapViewport } from "./map-viewport";
import { SidebarLayout } from "@atlas/ui";

// Default fallback widths (overridden by props when set).
const DEFAULT_SIDEBAR_PX = 320;
const DEFAULT_PANEL_PX = 384;

/**
 * Top-level map container. Composes layout + MapLibre viewport + overlays.
 * Each map page renders: <MapShell manifest={...} sidebar={...} />
 *
 * Automatically computes cameraPadding from sidebarOpen/panelOpen so that
 * fitBounds and flyTo calls centre within the visible map area on all screens.
 */
export function MapShell({
  manifest,
  sidebar,
  detailPanel,
  sidebarOpen = true,
  panelOpen = false,
  children,
  overlay,
  cameraPadding: cameraPaddingOverride,
  onMapReady,
  sidebarWidth,
  panelWidth,
}: MapShellProps) {
  const sbPx = sidebarWidth ?? DEFAULT_SIDEBAR_PX;
  const pnPx = panelWidth ?? DEFAULT_PANEL_PX;

  // Compute padding from layout state unless the caller overrides it.
  // Only count a sidebar/panel if it actually has content to render.
  const cameraPadding: CameraPadding = cameraPaddingOverride ?? {
    left: sidebar && sidebarOpen ? sbPx : 0,
    right: detailPanel && panelOpen ? pnPx : 0,
    top: 0,
    bottom: 0,
  };

  return (
    <div data-theme={manifest.theme} className="h-full w-full">
      <SidebarLayout
        sidebar={sidebar}
        panel={detailPanel}
        sidebarOpen={sidebarOpen}
        panelOpen={panelOpen}
        sidebarWidth={sidebarWidth}
        panelWidth={panelWidth}
      >
        <MapViewport manifest={manifest} cameraPadding={cameraPadding} onMapReady={onMapReady}>
          {children}
          {overlay}
        </MapViewport>
      </SidebarLayout>
    </div>
  );
}
