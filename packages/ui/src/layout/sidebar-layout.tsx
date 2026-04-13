"use client";

import * as React from "react";
import { cn } from "../components/utils";

const MIN_SIDEBAR_PX = 180;
const MAX_SIDEBAR_PX = 520;

interface SidebarLayoutProps {
  sidebar?: React.ReactNode;
  panel?: React.ReactNode;
  sidebarOpen?: boolean;
  panelOpen?: boolean;
  children: React.ReactNode;
  className?: string;
  /** Override sidebar width in px (default 320). */
  sidebarWidth?: number;
  /** Override panel width in px (default 384). */
  panelWidth?: number;
}

/**
 * Responsive 3-column layout: sidebar | main | panel.
 * On mobile (<768px): main is fullscreen, sidebar/panel render as sheets.
 */
export function SidebarLayout({
  sidebar,
  panel,
  sidebarOpen = true,
  panelOpen = false,
  children,
  className,
  sidebarWidth,
  panelWidth,
}: SidebarLayoutProps) {
  const [width, setWidth] = React.useState(sidebarWidth ?? 320);
  const dragging = React.useRef(false);

  // Sync if prop changes externally
  React.useEffect(() => {
    if (sidebarWidth !== undefined) setWidth(sidebarWidth);
  }, [sidebarWidth]);

  const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startW = width;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const next = Math.min(MAX_SIDEBAR_PX, Math.max(MIN_SIDEBAR_PX, startW + (ev.clientX - startX)));
      setWidth(next);
    };

    const onUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 32 : 8;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setWidth((w) => Math.max(MIN_SIDEBAR_PX, w - step));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setWidth((w) => Math.min(MAX_SIDEBAR_PX, w + step));
    } else if (e.key === "Home") {
      e.preventDefault();
      setWidth(MIN_SIDEBAR_PX);
    } else if (e.key === "End") {
      e.preventDefault();
      setWidth(MAX_SIDEBAR_PX);
    }
  }, []);

  return (
    <div className={cn("flex h-full w-full overflow-hidden", className)}>
      {/* Left sidebar — desktop only */}
      {sidebar && sidebarOpen && (
        <aside
          className="hidden md:flex flex-shrink-0 flex-col overflow-hidden relative"
          style={{
            width,
            background: "rgba(13,18,23,0.95)",
            borderRight: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          {sidebar}
          {/* Resize handle */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            aria-valuenow={width}
            aria-valuemin={MIN_SIDEBAR_PX}
            aria-valuemax={MAX_SIDEBAR_PX}
            tabIndex={0}
            onMouseDown={handleMouseDown}
            onKeyDown={handleKeyDown}
            style={{
              position: "absolute",
              top: 0,
              right: -3,
              width: 6,
              height: "100%",
              cursor: "col-resize",
              zIndex: 10,
            }}
          />
        </aside>
      )}

      {/* Main content (map) */}
      <main className="relative flex-1 min-w-0">{children}</main>

      {/* Right panel — desktop only, slides in */}
      {panel && panelOpen && (
        <aside
          className="hidden lg:flex flex-shrink-0 flex-col overflow-hidden animate-slide-in-right"
          style={{
            width: panelWidth ?? 384,
            background: "rgba(13,18,23,0.95)",
            borderLeft: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          {panel}
        </aside>
      )}
    </div>
  );
}
