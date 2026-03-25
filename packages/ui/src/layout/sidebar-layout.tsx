"use client";

import * as React from "react";
import { cn } from "../components/utils";

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
  return (
    <div className={cn("flex h-full w-full overflow-hidden", className)}>
      {/* Left sidebar — desktop only */}
      {sidebar && sidebarOpen && (
        <aside
          className="hidden md:flex flex-shrink-0 flex-col overflow-hidden"
          style={{
            width: sidebarWidth ?? 320,
            borderRight: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          {sidebar}
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
            borderLeft: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          {panel}
        </aside>
      )}
    </div>
  );
}
