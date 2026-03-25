import type { ReactNode } from "react";

export const metadata = {
  title: "Atlas",
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div data-mode="app" className="h-screen w-screen overflow-hidden">
      {children}
    </div>
  );
}
