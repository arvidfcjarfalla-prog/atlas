"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  MapShell,
  useBasemapLayers,
  useManifestRenderer,
} from "@atlas/map-core";
import type { CompiledLegendItem } from "@atlas/map-core";
import type { MapManifest } from "@atlas/data-models";
import type { Map as MaplibreMap } from "maplibre-gl";

// ─── Camera sync hook ───────────────────────────────────────

function useCameraSync(
  map1: MaplibreMap | null,
  map2: MaplibreMap | null,
) {
  const syncing = useRef(false);

  useEffect(() => {
    if (!map1 || !map2) return;

    const syncTo = (source: MaplibreMap, target: MaplibreMap) => {
      if (syncing.current) return;
      syncing.current = true;
      target.jumpTo({
        center: source.getCenter(),
        zoom: source.getZoom(),
        bearing: source.getBearing(),
        pitch: source.getPitch(),
      });
      syncing.current = false;
    };

    const onMove1 = () => syncTo(map1, map2);
    const onMove2 = () => syncTo(map2, map1);

    map1.on("move", onMove1);
    map2.on("move", onMove2);

    return () => {
      map1.off("move", onMove1);
      map2.off("move", onMove2);
    };
  }, [map1, map2]);
}

// ─── Layer renderer (inside each MapShell's context) ────────

function LayerContent({
  manifest,
  data,
}: {
  manifest: MapManifest;
  data: GeoJSON.FeatureCollection;
}) {
  useBasemapLayers({ basemap: manifest.basemap });
  const layer = manifest.layers[0];
  useManifestRenderer({ layer, data });
  return null;
}

// ─── Split view ─────────────────────────────────────────────

interface CompareViewProps {
  leftManifest: MapManifest;
  rightManifest: MapManifest;
  leftData: GeoJSON.FeatureCollection;
  rightData: GeoJSON.FeatureCollection;
  onClose: () => void;
}

export function CompareView({
  leftManifest,
  rightManifest,
  leftData,
  rightData,
  onClose,
}: CompareViewProps) {
  const [leftMap, setLeftMap] = useState<MaplibreMap | null>(null);
  const [rightMap, setRightMap] = useState<MaplibreMap | null>(null);

  useCameraSync(leftMap, rightMap);

  return (
    <div className="h-full w-full flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border shrink-0">
        <div className="flex gap-8 text-caption">
          <span className="text-foreground font-medium">{leftManifest.title}</span>
          <span className="text-muted-foreground">vs</span>
          <span className="text-foreground font-medium">{rightManifest.title}</span>
        </div>
        <button
          onClick={onClose}
          className="text-caption text-muted-foreground hover:text-foreground transition-colors"
        >
          Stäng
        </button>
      </div>

      {/* Two maps side by side */}
      <div className="flex-1 flex">
        <div className="flex-1 relative">
          <MapShell manifest={leftManifest} onMapReady={setLeftMap}>
            <LayerContent manifest={leftManifest} data={leftData} />
          </MapShell>
        </div>
        <div className="w-px bg-border" />
        <div className="flex-1 relative">
          <MapShell manifest={rightManifest} onMapReady={setRightMap}>
            <LayerContent manifest={rightManifest} data={rightData} />
          </MapShell>
        </div>
      </div>
    </div>
  );
}

// ─── Swipe compare ──────────────────────────────────────────

interface SwipeCompareProps {
  leftManifest: MapManifest;
  rightManifest: MapManifest;
  leftData: GeoJSON.FeatureCollection;
  rightData: GeoJSON.FeatureCollection;
  onClose: () => void;
}

export function SwipeCompare({
  leftManifest,
  rightManifest,
  leftData,
  rightData,
  onClose,
}: SwipeCompareProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sliderX, setSliderX] = useState(0.5); // 0-1 fraction
  const [dragging, setDragging] = useState(false);
  const [leftMap, setLeftMap] = useState<MaplibreMap | null>(null);
  const [rightMap, setRightMap] = useState<MaplibreMap | null>(null);

  useCameraSync(leftMap, rightMap);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
      setSliderX(x);
    },
    [dragging],
  );

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      return () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };
    }
  }, [dragging, handlePointerMove, handlePointerUp]);

  // Resize maps when slider moves
  useEffect(() => {
    leftMap?.resize();
    rightMap?.resize();
  }, [sliderX, leftMap, rightMap]);

  const pct = `${sliderX * 100}%`;

  return (
    <div className="h-full w-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border shrink-0">
        <div className="flex gap-8 text-caption">
          <span className="text-foreground font-medium">{leftManifest.title}</span>
          <span className="text-muted-foreground">vs</span>
          <span className="text-foreground font-medium">{rightManifest.title}</span>
        </div>
        <button
          onClick={onClose}
          className="text-caption text-muted-foreground hover:text-foreground transition-colors"
        >
          Stäng
        </button>
      </div>

      {/* Stacked maps with clip */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        {/* Left map (full size, behind) */}
        <div className="absolute inset-0">
          <MapShell manifest={leftManifest} onMapReady={setLeftMap}>
            <LayerContent manifest={leftManifest} data={leftData} />
          </MapShell>
        </div>

        {/* Right map (clipped to right of slider) */}
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 0 0 ${pct})` }}
        >
          <MapShell manifest={rightManifest} onMapReady={setRightMap}>
            <LayerContent manifest={rightManifest} data={rightData} />
          </MapShell>
        </div>

        {/* Slider handle */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-white/60 cursor-col-resize z-10"
          style={{ left: pct, transform: "translateX(-50%)" }}
          onPointerDown={() => setDragging(true)}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow-lg flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M5 3L2 8L5 13M11 3L14 8L11 13" stroke="#333" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* Labels */}
        <div className="absolute top-3 left-3 bg-black/60 text-white text-[11px] px-2 py-1 rounded z-10">
          {leftManifest.title}
        </div>
        <div className="absolute top-3 right-3 bg-black/60 text-white text-[11px] px-2 py-1 rounded z-10">
          {rightManifest.title}
        </div>
      </div>
    </div>
  );
}
