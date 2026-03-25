import type { ReactNode } from "react";

export default function EditorLayout({ children }: { children: ReactNode }) {
  return <div className="flex h-full w-full flex-col">{children}</div>;
}
