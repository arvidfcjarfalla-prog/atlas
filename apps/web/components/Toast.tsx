"use client";

import type { Toast as ToastData } from "@/lib/hooks/use-toast";

const VARIANT_STYLES: Record<string, { background: string; color: string }> = {
  info: { background: "#e4e0d8", color: "#0d1217" },
  success: { background: "rgba(34,197,94,0.15)", color: "#8ecba0" },
  error: { background: "rgba(239,68,68,0.15)", color: "#ef4444" },
};

export function Toast({ toast }: { toast: ToastData | null }) {
  if (!toast) return null;
  const style = VARIANT_STYLES[toast.variant] ?? VARIANT_STYLES.info;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 28,
        left: "50%",
        transform: "translateX(-50%)",
        background: style.background,
        borderRadius: 10,
        padding: "10px 18px",
        fontFamily: "'Geist', sans-serif",
        fontSize: 13,
        color: style.color,
        zIndex: 200,
        boxShadow: "0 4px 24px rgba(0,0,0,0.20)",
        animation: "fadeUp 180ms ease",
        whiteSpace: "nowrap",
      }}
    >
      {toast.message}
    </div>
  );
}
