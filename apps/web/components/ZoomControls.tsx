"use client";

import { useCallback } from "react";
import { useMap } from "@atlas/map-core";

const bd = "rgba(255,255,255,0.05)";

/**
 * Zoom controls — bottom-right + and − buttons.
 * Glassmorphism card matching prototype EditorView.
 */
export function ZoomControls() {
  const { map, isReady } = useMap();

  const zoomIn = useCallback(() => {
    if (map && isReady) map.zoomIn({ duration: 300 });
  }, [map, isReady]);

  const zoomOut = useCallback(() => {
    if (map && isReady) map.zoomOut({ duration: 300 });
  }, [map, isReady]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 14,
        right: 14,
        zIndex: 10,
        background: "rgba(12,16,20,0.8)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: `1px solid ${bd}`,
        borderRadius: 8,
        padding: 3,
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <button
        onClick={zoomIn}
        style={{
          width: 30,
          height: 30,
          background: "none",
          border: "none",
          color: "#908c85",
          fontSize: 15,
          cursor: "pointer",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Segoe UI',-apple-system,sans-serif",
        }}
      >
        +
      </button>
      <div
        style={{
          width: 18,
          height: 1,
          background: bd,
          margin: "0 auto",
        }}
      />
      <button
        onClick={zoomOut}
        style={{
          width: 30,
          height: 30,
          background: "none",
          border: "none",
          color: "#908c85",
          fontSize: 15,
          cursor: "pointer",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Segoe UI',-apple-system,sans-serif",
        }}
      >
        −
      </button>
    </div>
  );
}
