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
}: SidebarLayoutProps) {
  return (
    <div className={cn("flex h-full w-full overflow-hidden", className)}>
      {/* Left sidebar — desktop only */}
      {sidebar && sidebarOpen && (
        <aside className="hidden md:flex w-80 flex-shrink-0 flex-col border-r bg-sidebar overflow-hidden">
          {sidebar}
        </aside>
      )}

      {/* Main content (map) */}
      <main className="relative flex-1 min-w-0">{children}</main>

      {/* Right panel — desktop only */}
      {panel && panelOpen && (
        <aside className="hidden lg:flex w-96 flex-shrink-0 flex-col border-l bg-sidebar overflow-hidden">
          {panel}
        </aside>
      )}
    </div>
  );
}
