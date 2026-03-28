"use client";

import { useEffect, useState } from "react";
import { useMap } from "./use-map";

interface Coords {
  lat: number;
  lng: number;
}

/**
 * Displays live lat/lng coordinates as the user moves their mouse over the map.
 * Renders as a small pill in the bottom-right corner of the map viewport.
 * Must be rendered inside a MapShell so it has access to MapContext.
 */
export function CoordinateWidget() {
  const { map, isReady } = useMap();
  const [coords, setCoords] = useState<Coords | null>(null);

  useEffect(() => {
    if (!map || !isReady) return;

    function onMouseMove(e: { lngLat: { lat: number; lng: number } }) {
      setCoords({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    }

    function onMouseLeave() {
      setCoords(null);
    }

    map.on("mousemove", onMouseMove);
    map.on("mouseout", onMouseLeave);

    return () => {
      map.off("mousemove", onMouseMove);
      map.off("mouseout", onMouseLeave);
    };
  }, [map, isReady]);

  if (!coords) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 8,
        right: 8,
        fontFamily: "'Geist Mono', monospace",
        fontSize: 11,
        background: "rgba(12,16,24,0.75)",
        backdropFilter: "blur(8px)",
        borderRadius: 6,
        padding: "4px 8px",
        color: "rgba(200,210,225,0.6)",
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 10,
        whiteSpace: "nowrap",
      }}
    >
      {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
    </div>
  );
}
