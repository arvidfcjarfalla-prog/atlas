"use client";

import { useState, useCallback } from "react";
import { useMap } from "@atlas/map-core";
import type { LayerManifest } from "@atlas/data-models";

// Design tokens from docs/prototype/atlas.html
const bd = "rgba(255,255,255,0.05)";
const bd2 = "rgba(255,255,255,0.08)";
const tx = "#e4e0d8";
const tx3 = "#5a5752";
const sage = "#8ecba0";
const gold = "#d4a574";

interface LayerListProps {
  layers: LayerManifest[];
  onGenerate?: (prompt: string) => void;
}

/** Layer color dots cycle through these (matching prototype). */
const DOT_COLORS = ["#48a8c4", gold, tx3, sage, "#d06060"];

export function LayerList({ layers, onGenerate }: LayerListProps) {
  const { map, isReady } = useMap();
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(layers.map((l) => l.id)),
  );
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptVal, setPromptVal] = useState("");

  const toggleLayer = useCallback(
    (layerId: string) => {
      if (!map || !isReady) return;

      const isVis = visible.has(layerId);
      setVisible((prev) => {
        const next = new Set(prev);
        if (isVis) next.delete(layerId);
        else next.add(layerId);
        return next;
      });

      const style = map.getStyle();
      const subLayers = style?.layers?.filter((l) =>
        l.id.startsWith(layerId),
      );
      for (const sub of subLayers ?? []) {
        map.setLayoutProperty(
          sub.id,
          "visibility",
          isVis ? "none" : "visible",
        );
      }
    },
    [map, isReady, visible],
  );

  const handleGenerate = useCallback(() => {
    const val = promptVal.trim();
    if (!val || !onGenerate) return;
    onGenerate(val);
    setPromptVal("");
    setPromptOpen(false);
  }, [promptVal, onGenerate]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "rgba(16,22,30,0.72)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
      }}
    >
      {/* Header */}
      <div style={{ padding: "16px 14px 10px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <span
            style={{
              fontFamily: "'Courier New',monospace",
              fontSize: 9,
              fontWeight: 700,
              color: tx3,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Lager
          </span>
        </div>

        {/* Layer items */}
        {layers.map((layer, i) => {
          const isVis = visible.has(layer.id);
          const dotColor = DOT_COLORS[i % DOT_COLORS.length];

          return (
            <div
              key={layer.id}
              onClick={() => toggleLayer(layer.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 10px",
                marginBottom: 3,
                background: isVis ? "rgba(255,255,255,0.02)" : "transparent",
                borderRadius: 8,
                cursor: "pointer",
                transition: "background 0.15s ease",
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: isVis ? dotColor : tx3 + "33",
                  flexShrink: 0,
                  transition: "background 0.15s ease",
                }}
              />
              <span
                style={{
                  fontFamily: "'Segoe UI',-apple-system,sans-serif",
                  fontSize: 12,
                  color: isVis ? tx : tx3,
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  transition: "color 0.15s ease",
                }}
              >
                {layer.label}
              </span>
              {isVis && (
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path
                    d="M2,6L5,9L10,3"
                    fill="none"
                    stroke={sage + "88"}
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </div>
          );
        })}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Generate prompt — expandable like prototype */}
      <div style={{ padding: 14, borderTop: `1px solid ${bd}` }}>
        {!promptOpen ? (
          <button
            onClick={() => setPromptOpen(true)}
            style={{
              width: "100%",
              background: `${sage}0a`,
              border: `1px solid ${sage}1a`,
              color: sage,
              padding: 10,
              fontSize: 11,
              fontFamily: "'Segoe UI',-apple-system,sans-serif",
              cursor: "pointer",
              borderRadius: 7,
            }}
          >
            ✦ Generate from prompt
          </button>
        ) : (
          <div>
            <textarea
              value={promptVal}
              onChange={(e) => setPromptVal(e.target.value)}
              rows={2}
              placeholder="Add migration flow arrows…"
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${bd2}`,
                padding: "9px 10px",
                fontSize: 11,
                color: tx,
                borderRadius: 6,
                resize: "none",
                lineHeight: 1.4,
                fontFamily: "inherit",
                marginBottom: 6,
                outline: "none",
              }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleGenerate();
                }
                if (e.key === "Escape") {
                  setPromptOpen(false);
                  setPromptVal("");
                }
              }}
            />
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={handleGenerate}
                style={{
                  flex: 1,
                  background: gold,
                  color: "#1a1610",
                  border: "none",
                  padding: 8,
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Generate →
              </button>
              <button
                onClick={() => {
                  setPromptOpen(false);
                  setPromptVal("");
                }}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "none",
                  color: tx3,
                  padding: "8px 12px",
                  fontSize: 11,
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
