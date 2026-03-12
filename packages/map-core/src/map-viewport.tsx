"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapContext } from "./use-map";
import type { MapManifest, MaplibreMap } from "./types";

interface MapViewportProps {
  manifest: MapManifest;
  children?: React.ReactNode;
}

const BASEMAP_STYLES: Record<string, string> = {
  editorial: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  explore: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  decision: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};

export function MapViewport({ manifest, children }: MapViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLES[manifest.theme] ?? BASEMAP_STYLES.explore,
      center: manifest.defaultCenter
        ? [manifest.defaultCenter[1], manifest.defaultCenter[0]]
        : [0, 20],
      zoom: manifest.defaultZoom ?? 2,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      mapRef.current = map;
      setIsReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setIsReady(false);
    };
  }, [manifest.theme, manifest.defaultCenter, manifest.defaultZoom]);

  const handleResize = useCallback(() => {
    mapRef.current?.resize();
  }, []);

  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);

  const contextValue = useMemo(
    () => ({ map: mapRef.current, isReady }),
    [isReady],
  );

  return (
    <MapContext.Provider value={contextValue}>
      <div ref={containerRef} className="absolute inset-0" />
      {children}
    </MapContext.Provider>
  );
}
