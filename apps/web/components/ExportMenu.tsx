"use client";

import { useState, useRef, useEffect } from "react";

interface ExportMenuProps {
  onExportPNG: (scale?: number) => void;
  onExportGeoJSON: () => void;
  onExportPDF?: () => void;
  onExportSVG?: () => void;
}

const items = [
  { label: "PNG 1x", key: "png-1" },
  { label: "PNG 2x", key: "png-2" },
  { label: "PNG 4x", key: "png-4" },
  { label: "PDF", key: "pdf" },
  { label: "SVG", key: "svg" },
  { label: "GeoJSON", key: "geojson" },
] as const;

export function ExportMenu({ onExportPNG, onExportGeoJSON, onExportPDF, onExportSVG }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
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
    if (key.startsWith("png")) {
      const scale = key === "png-4" ? 4 : key === "png-2" ? 2 : 1;
      setExporting(true);
      setTimeout(() => {
        onExportPNG(scale);
        setTimeout(() => setExporting(false), 600);
      }, 50);
    } else if (key === "pdf") {
      setExporting(true);
      onExportPDF?.();
      setTimeout(() => setExporting(false), 1200);
    } else if (key === "svg") {
      setExporting(true);
      onExportSVG?.();
      setTimeout(() => setExporting(false), 600);
    } else if (key === "geojson") {
      onExportGeoJSON();
    }
  }

  // Only show items that have handlers
  const visibleItems = items.filter((item) => {
    if (item.key === "pdf" && !onExportPDF) return false;
    if (item.key === "svg" && !onExportSVG) return false;
    return true;
  });

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        onClick={() => !exporting && setOpen((v) => !v)}
        style={{
          fontSize: 11,
          fontFamily: "'Segoe UI',-apple-system,sans-serif",
          color: exporting ? "#8ecba0" : "#908c85",
          background: "none",
          border: "none",
          cursor: exporting ? "wait" : "pointer",
          padding: "6px 12px",
          transition: "color 0.15s ease",
        }}
      >
        {exporting ? "Exporterar\u2026" : "Export \u2193"}
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
          {visibleItems.map((item, i) => {
            // Separator before GeoJSON
            const showSep = item.key === "geojson" && i > 0;
            return (
              <div key={item.key}>
                {showSep && (
                  <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 8px" }} />
                )}
                <button
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
