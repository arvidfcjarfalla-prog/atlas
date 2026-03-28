"use client";

import { useCallback } from "react";
import type { MapManifest, ColorScheme, BasemapStyle } from "@atlas/data-models";

interface StylePanelProps {
  manifest: MapManifest;
  onManifestChange: (manifest: MapManifest) => void;
}

// Design tokens from docs/prototype/atlas.html
const bd = "rgba(255,255,255,0.05)";
const bd2 = "rgba(255,255,255,0.08)";
const tx = "#e4e0d8";
const tx2 = "#908c85";
const tx3 = "#5a5752";
const sage = "#8ecba0";

// Section label style — Courier New mono, 9px uppercase, #5a5752
const sectionLabel: React.CSSProperties = {
  fontFamily: "'Courier New',monospace",
  fontSize: 9,
  fontWeight: 700,
  color: tx3,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  display: "block",
};

// Basemap style swatches — 3-band preview colors [bg, land, water]
const BASEMAP_SWATCHES: { key: BasemapStyle; name: string; colors: [string, string, string] }[] = [
  { key: "dark", name: "Dark", colors: ["#080e1a", "#10141e", "#060a14"] },
  { key: "paper", name: "Paper", colors: ["#f0ece4", "#f5f1ea", "#d8e4ec"] },
  { key: "nord", name: "Nord", colors: ["#2e3440", "#3b4252", "#1a2030"] },
  { key: "sepia", name: "Sepia", colors: ["#f2e8d5", "#f5eed8", "#c8d8c8"] },
  { key: "stark", name: "Stark", colors: ["#000000", "#0a0a0a", "#000000"] },
  { key: "retro", name: "Retro", colors: ["#e8dcc8", "#ede2d0", "#a8c8c0"] },
  { key: "ocean", name: "Ocean", colors: ["#04101e", "#0a1828", "#081420"] },
];

// Theme swatches exactly matching the prototype's `themes` object
const THEME_SWATCHES: {
  key: string;
  name: string;
  colors: string[];
  scheme: ColorScheme;
}[] = [
  {
    key: "clean",
    name: "Clean",
    colors: ["#184868", "#2878a0", "#48a8c4", "#78d0e0", "#a8f0f0"],
    scheme: "blues",
  },
  {
    key: "muted",
    name: "Muted",
    colors: ["#283848", "#406068", "#608888", "#88b0b4", "#b0d0d0"],
    scheme: "greys",
  },
  {
    key: "warm",
    name: "Warm",
    colors: ["#3a2a18", "#6a4a2a", "#9a7a4a", "#c4a870", "#e8d8a0"],
    scheme: "oranges",
  },
  {
    key: "vivid",
    name: "Vivid",
    colors: ["#0a1830", "#1a4898", "#2a90e0", "#58ccff", "#c8f0ff"],
    scheme: "spectral",
  },
];

export { THEME_SWATCHES };

export function StylePanel({ manifest, onManifestChange }: StylePanelProps) {
  const currentScheme = manifest.layers[0]?.style.color?.scheme;
  const currentOpacity = manifest.layers[0]?.style.fillOpacity ?? 0.7;
  const currentBasemap: BasemapStyle = manifest.basemap?.style ?? "dark";

  // Detect active swatch by matching scheme
  const activeKey =
    THEME_SWATCHES.find((s) => s.scheme === currentScheme)?.key ?? "clean";

  const applyBasemap = useCallback(
    (style: BasemapStyle) => {
      onManifestChange({
        ...manifest,
        basemap: { ...manifest.basemap, style },
      });
    },
    [manifest, onManifestChange],
  );

  const applyTheme = useCallback(
    (swatch: (typeof THEME_SWATCHES)[number]) => {
      const updated: MapManifest = {
        ...manifest,
        layers: manifest.layers.map((layer) => ({
          ...layer,
          style: {
            ...layer.style,
            color: { ...layer.style.color, scheme: swatch.scheme },
          },
        })),
      };
      onManifestChange(updated);
    },
    [manifest, onManifestChange],
  );

  const applyOpacity = useCallback(
    (opacity: number) => {
      const updated: MapManifest = {
        ...manifest,
        layers: manifest.layers.map((layer, i) =>
          i === 0
            ? { ...layer, style: { ...layer.style, fillOpacity: opacity } }
            : layer,
        ),
      };
      onManifestChange(updated);
    },
    [manifest, onManifestChange],
  );

  return (
    <div
      style={{
        overflowY: "auto",
        padding: "16px 14px",
        height: "100%",
        background: "rgba(16,22,30,0.72)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        fontFamily: "'Segoe UI',-apple-system,sans-serif",
      }}
    >
      {/* Header */}
      <span style={{ ...sectionLabel, marginBottom: 16 }}>STIL</span>

      {/* Basemap picker */}
      <span style={{ ...sectionLabel, marginBottom: 8 }}>BASKARTA</span>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 5,
          marginBottom: 18,
        }}
      >
        {BASEMAP_SWATCHES.map((swatch) => {
          const isActive = currentBasemap === swatch.key;
          return (
            <button
              key={swatch.key}
              onClick={() => applyBasemap(swatch.key)}
              style={{
                padding: "6px 4px 5px",
                borderRadius: 7,
                cursor: "pointer",
                textAlign: "center",
                border: isActive
                  ? "1.5px solid rgba(142,203,160,0.33)"
                  : "1.5px solid transparent",
                background: isActive
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(255,255,255,0.015)",
                transition: "all 0.12s ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 1,
                  marginBottom: 4,
                  borderRadius: 3,
                  overflow: "hidden",
                  height: 10,
                }}
              >
                {swatch.colors.map((c, i) => (
                  <div key={i} style={{ flex: 1, background: c }} />
                ))}
              </div>
              <span style={{ fontSize: 9, color: isActive ? tx : tx2 }}>
                {swatch.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Theme label */}
      <span style={{ ...sectionLabel, marginBottom: 8 }}>TEMA</span>

      {/* Theme swatches — 2x2 grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          marginBottom: 18,
        }}
      >
        {THEME_SWATCHES.map((swatch) => {
          const isActive = activeKey === swatch.key;
          return (
            <button
              key={swatch.key}
              onClick={() => applyTheme(swatch)}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                cursor: "pointer",
                textAlign: "left",
                border: isActive
                  ? `1.5px solid rgba(142,203,160,0.33)`
                  : "1.5px solid transparent",
                background: isActive
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(255,255,255,0.015)",
                transition: "all 0.12s ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 2,
                  marginBottom: 5,
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                {swatch.colors.map((c, i) => (
                  <div key={i} style={{ flex: 1, height: 10, background: c }} />
                ))}
              </div>
              <span style={{ fontSize: 10, color: isActive ? tx : tx2 }}>
                {swatch.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Data source */}
      <span style={{ ...sectionLabel, marginBottom: 8 }}>DATAKÄLLA</span>
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: `1px solid ${bd}`,
          borderRadius: 7,
          padding: "9px 12px",
          marginBottom: 18,
          fontSize: 11,
          color: tx2,
          cursor: "pointer",
        }}
      >
        {manifest.layers[0]?.label ?? "—"} ▾
      </div>

      {/* Opacity */}
      <span style={{ ...sectionLabel, marginBottom: 6 }}>OPACITET</span>
      <div
        style={{
          height: 5,
          background: "rgba(255,255,255,0.04)",
          borderRadius: 3,
          marginBottom: 16,
          position: "relative",
          cursor: "pointer",
        }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = Math.max(0.1, Math.min(1, (e.clientX - rect.left) / rect.width));
          applyOpacity(Math.round(pct * 20) / 20);
        }}
      >
        <div
          style={{
            width: `${currentOpacity * 100}%`,
            height: "100%",
            background:
              (THEME_SWATCHES.find((s) => s.key === activeKey)?.colors[3] ??
                "#78d0e0") + "44",
            borderRadius: 3,
            transition: "width 0.15s ease",
          }}
        />
      </div>

      {/* Output */}
      <span style={{ ...sectionLabel, marginBottom: 8 }}>OUTPUT</span>
      <div style={{ display: "flex", gap: 5, marginBottom: 18 }}>
        {["Interactive", "PDF"].map((t, i) => (
          <button
            key={t}
            style={{
              flex: 1,
              background:
                i === 0 ? "rgba(255,255,255,0.05)" : "transparent",
              border: `1px solid ${i === 0 ? bd2 : bd}`,
              padding: 7,
              fontSize: 11,
              color: i === 0 ? tx : tx3,
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "'Segoe UI',-apple-system,sans-serif",
            }}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
