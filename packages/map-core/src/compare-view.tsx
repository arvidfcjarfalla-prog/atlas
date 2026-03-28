"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { MapManifest } from "@atlas/data-models";
import { MapViewport } from "./map-viewport";
import type { MaplibreMap } from "./types";

interface CompareViewProps {
  /** Left map manifest. */
  manifestA: MapManifest;
  /** Right map manifest. */
  manifestB: MapManifest;
  /** Children for left map. */
  childrenA?: React.ReactNode;
  /** Children for right map. */
  childrenB?: React.ReactNode;
}

/**
 * Side-by-side map comparison with a draggable divider.
 * Two synchronized MapViewport instances sharing camera state.
 */
export function CompareView({
  manifestA,
  manifestB,
  childrenA,
  childrenB,
}: CompareViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(50); // percentage
  const [dragging, setDragging] = useState(false);
  const mapARef = useRef<MaplibreMap | null>(null);
  const mapBRef = useRef<MaplibreMap | null>(null);
  const syncingRef = useRef(false);

  // Camera sync: when one map moves, move the other
  const syncCamera = useCallback((source: MaplibreMap, target: MaplibreMap) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    const center = source.getCenter();
    const zoom = source.getZoom();
    const pitch = source.getPitch();
    const bearing = source.getBearing();
    target.jumpTo({ center, zoom, pitch, bearing });
    syncingRef.current = false;
  }, []);

  const handleMapAReady = useCallback((map: MaplibreMap) => {
    mapARef.current = map;
    map.on("move", () => {
      if (mapBRef.current) syncCamera(map, mapBRef.current);
    });
  }, [syncCamera]);

  const handleMapBReady = useCallback((map: MaplibreMap) => {
    mapBRef.current = map;
    map.on("move", () => {
      if (mapARef.current) syncCamera(map, mapARef.current);
    });
  }, [syncCamera]);

  // Divider drag
  const handlePointerDown = useCallback(() => setDragging(true), []);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: PointerEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplit(Math.max(10, Math.min(90, pct)));
    };

    const handleUp = () => setDragging(false);

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragging]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        display: "flex",
      }}
    >
      {/* Left map */}
      <div style={{ width: `${split}%`, height: "100%", overflow: "hidden" }}>
        <MapViewport manifest={manifestA} onMapReady={handleMapAReady}>
          {childrenA}
        </MapViewport>
      </div>

      {/* Divider */}
      <div
        onPointerDown={handlePointerDown}
        style={{
          position: "absolute",
          left: `${split}%`,
          top: 0,
          bottom: 0,
          width: 4,
          transform: "translateX(-50%)",
          background: "rgba(142,203,160,0.6)",
          cursor: "col-resize",
          zIndex: 10,
          touchAction: "none",
        }}
      >
        {/* Handle grip */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 24,
            height: 40,
            borderRadius: 12,
            background: "rgba(12,16,24,0.9)",
            border: "1px solid rgba(142,203,160,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="8" height="16" viewBox="0 0 8 16" fill="none">
            <line x1="2" y1="2" x2="2" y2="14" stroke="rgba(142,203,160,0.6)" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="6" y1="2" x2="6" y2="14" stroke="rgba(142,203,160,0.6)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* Right map */}
      <div style={{ width: `${100 - split}%`, height: "100%", overflow: "hidden" }}>
        <MapViewport manifest={manifestB} onMapReady={handleMapBReady}>
          {childrenB}
        </MapViewport>
      </div>
    </div>
  );
}
