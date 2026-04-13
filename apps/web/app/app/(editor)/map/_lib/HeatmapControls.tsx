"use client";

import { useState } from "react";
import { useMap } from "@atlas/map-core";
import type { MapManifest } from "@atlas/data-models";

export function HeatmapControls({ manifest }: { manifest: MapManifest }) {
  const { map, isReady } = useMap();
  const [radius, setRadius] = useState(30);
  const [intensity, setIntensity] = useState(1.0);

  if (manifest.layers[0]?.style.mapFamily !== "heatmap") return null;

  const layerId = manifest.layers[0].id;

  function updateRadius(val: number) {
    setRadius(val);
    if (!map || !isReady) return;
    const style = map.getStyle();
    const heatLayer = style?.layers?.find((l) => l.id.includes(layerId) && l.type === "heatmap");
    if (heatLayer) map.setPaintProperty(heatLayer.id, "heatmap-radius", val);
  }

  function updateIntensity(val: number) {
    setIntensity(val);
    if (!map || !isReady) return;
    const style = map.getStyle();
    const heatLayer = style?.layers?.find((l) => l.id.includes(layerId) && l.type === "heatmap");
    if (heatLayer) map.setPaintProperty(heatLayer.id, "heatmap-intensity", val);
  }

  return (
    <div
      style={{
        position: "absolute",
        bottom: 40,
        left: 12,
        background: "rgba(12,16,24,0.82)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        padding: "12px 16px",
        width: 180,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <label style={{ fontFamily: "'Geist',sans-serif", fontSize: 11, color: "rgba(200,210,225,0.6)" }}>
            Radie
          </label>
          <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: "rgba(200,210,225,0.45)" }}>
            {radius}
          </span>
        </div>
        <input
          type="range"
          min={5}
          max={80}
          step={1}
          value={radius}
          onChange={(e) => updateRadius(Number(e.target.value))}
          style={{ width: "100%", accentColor: "#8ecba0", cursor: "pointer" }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <label style={{ fontFamily: "'Geist',sans-serif", fontSize: 11, color: "rgba(200,210,225,0.6)" }}>
            Intensitet
          </label>
          <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: "rgba(200,210,225,0.45)" }}>
            {intensity.toFixed(1)}
          </span>
        </div>
        <input
          type="range"
          min={0.1}
          max={3.0}
          step={0.1}
          value={intensity}
          onChange={(e) => updateIntensity(Number(e.target.value))}
          style={{ width: "100%", accentColor: "#8ecba0", cursor: "pointer" }}
        />
      </div>
    </div>
  );
}
