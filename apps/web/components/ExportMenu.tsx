"use client";

import { useState, useRef, useEffect } from "react";

interface ExportMenuProps {
  onExportPNG: () => void;
  onExportGeoJSON: () => void;
}

const items = [
  { label: "PNG (bild)", key: "png" },
  { label: "GeoJSON", key: "geojson" },
] as const;

export function ExportMenu({ onExportPNG, onExportGeoJSON }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleSelect(key: string) {
    setOpen(false);
    if (key === "png") onExportPNG();
    else if (key === "geojson") onExportGeoJSON();
  }

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          fontSize: 11,
          fontFamily: "'Segoe UI',-apple-system,sans-serif",
          color: "#908c85",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "6px 12px",
        }}
      >
        Export ↓
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            minWidth: 140,
            background: "#131920",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            padding: 4,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            zIndex: 50,
          }}
        >
          {items.map((item) => (
            <button
              key={item.key}
              onClick={() => handleSelect(item.key)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                fontSize: 12,
                fontFamily: "'Geist',sans-serif",
                color: "#e4e0d8",
                background: "transparent",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
