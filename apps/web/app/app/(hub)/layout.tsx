"use client";

import { type ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { useSidebar } from "@/hooks/use-sidebar";

export default function HubLayout({ children }: { children: ReactNode }) {
  const { open, toggle } = useSidebar();

  return (
    <div className="relative h-full" style={{ backgroundColor: "#111820" }}>
      <AppSidebar mobileOpen={open} onMobileToggle={toggle} />
      <main className="h-full overflow-auto md:pl-64">{children}</main>
    </div>
  );
}
