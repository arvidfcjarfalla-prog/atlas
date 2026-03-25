"use client";

import { type ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { useSidebar } from "@/hooks/use-sidebar";

export default function HubLayout({ children }: { children: ReactNode }) {
  const { open, toggle } = useSidebar();

  return (
    <div className="flex h-full" style={{ backgroundColor: "#0d1217" }}>
      <AppSidebar mobileOpen={open} onMobileToggle={toggle} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
