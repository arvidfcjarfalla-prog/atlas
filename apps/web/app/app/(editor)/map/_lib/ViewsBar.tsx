"use client";

import { useCallback } from "react";
import { useMap } from "@atlas/map-core";
import { PILL_STYLE } from "./pill-style";

export interface SavedView {
  name: string;
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

export function ViewsBar({
  savedViews,
  onSaveView,
}: {
  savedViews: SavedView[];
  onSaveView: (view: SavedView) => void;
}) {
  const { map, isReady } = useMap();

  const handleSave = useCallback(() => {
    if (!map || !isReady) return;
    const center = map.getCenter();
    const name = window.prompt("Namnge vyn:");
    if (!name?.trim()) return;
    onSaveView({
      name: name.trim(),
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
    });
  }, [map, isReady, onSaveView]);

  const handleFly = useCallback(
    (view: SavedView) => {
      if (!map || !isReady) return;
      map.flyTo({
        center: view.center,
        zoom: view.zoom,
        pitch: view.pitch,
        bearing: view.bearing,
        duration: 1200,
      });
    },
    [map, isReady],
  );

  return (
    <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 6, zIndex: 5 }}>
      {savedViews.map((view, i) => (
        <button key={i} style={PILL_STYLE} onClick={() => handleFly(view)}>
          {view.name}
        </button>
      ))}
      <button style={PILL_STYLE} onClick={handleSave} title="Spara nuvarande vy">
        +
      </button>
    </div>
  );
}
