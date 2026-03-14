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

/** Fetch a style URL with retries to handle transient 503s from CARTO CDN. */
async function fetchStyleWithRetry(
  url: string,
  retries = 3,
  delayMs = 800,
): Promise<maplibregl.StyleSpecification> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json() as Promise<maplibregl.StyleSpecification>;
    if (attempt < retries) await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
  }
  throw new Error(`Failed to fetch basemap style after ${retries + 1} attempts`);
}

/**
 * Mutate the CARTO Dark Matter style JSON before it reaches the Map constructor.
 *
 * CARTO Dark Matter structure:
 *   background  #0e0e0e  (near-black)
 *   land fills  #0e0e0e  (same as bg, uses zoom-stops)
 *   water fill  #2C353C  (blue-grey, lighter than land)
 *   56 line layers, 27 symbol layers
 *
 * This transform:
 *   - Shifts background + land toward blue-black (#080b10 / #10141a)
 *   - Makes water distinctly colder and deeper (#0c1520)
 *   - Quiets lines and labels so data layers dominate
 *   - Eliminates flash-of-unquieted-basemap (pre-constructor, not post-load)
 */
function transformBasemapStyle(
  style: maplibregl.StyleSpecification,
  options?: { labelsVisible?: boolean },
): maplibregl.StyleSpecification {
  const hideLabels = options?.labelsVisible === false;
  const LAND_COLOR = "#151921";
  const WATER_COLOR = "#040810";

  const layers = style.layers.map((layer) => {
    // Background — deep blue-black night
    if (layer.type === "background") {
      return {
        ...layer,
        paint: { ...layer.paint, "background-color": "#030508" },
      };
    }

    // Water fills — cold deep ocean, materially different from land
    if (layer.type === "fill" && layer.id.includes("water")) {
      return {
        ...layer,
        paint: { "fill-color": WATER_COLOR, "fill-opacity": 1 },
      };
    }

    // Landcover layers — hide when labels hidden (choropleth), otherwise subtle
    if (layer.type === "fill" && layer.id.includes("landcover")) {
      if (hideLabels) {
        return { ...layer, layout: { ...layer.layout, visibility: "none" as const } };
      }
      return {
        ...layer,
        paint: { "fill-color": "#181e28", "fill-opacity": 0.6 },
      };
    }

    // All other fills — solid LAND_COLOR
    if (layer.type === "fill") {
      return {
        ...layer,
        paint: { "fill-color": LAND_COLOR, "fill-opacity": 1 },
      };
    }

    // Structural lines — hide when labels hidden (choropleth), otherwise subtle
    if (layer.type === "line") {
      if (hideLabels) {
        return { ...layer, layout: { ...layer.layout, visibility: "none" as const } };
      }
      const paint = layer.paint as Record<string, unknown> | undefined;
      if (!paint) return layer;
      const existingOpacity = paint["line-opacity"];
      const base = typeof existingOpacity === "number" ? existingOpacity : 1;
      return {
        ...layer,
        paint: {
          ...paint,
          "line-color": "#1a2535",
          "line-opacity": base * 0.2,
        },
      };
    }

    // Labels — hide completely or quiet down
    if (layer.type === "symbol") {
      if (hideLabels) {
        return { ...layer, layout: { ...layer.layout, visibility: "none" as const } };
      }
      const paint = layer.paint as Record<string, unknown> | undefined;
      return {
        ...layer,
        paint: {
          ...paint,
          "text-opacity": 0.25,
          "text-color": "rgba(160, 175, 190, 1)",
          "text-halo-color": "rgba(0, 0, 0, 0.7)",
          "text-halo-blur": 2,
        },
      };
    }

    return layer;
  });

  return { ...style, layers };
}

export function MapViewport({ manifest, children }: MapViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<MaplibreMap | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    let mapRef: MaplibreMap | null = null;

    const styleUrl = BASEMAP_STYLES[manifest.theme] ?? BASEMAP_STYLES.explore;

    fetchStyleWithRetry(styleUrl)
      .then((styleJson) => {
        if (cancelled || !containerRef.current) return;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: transformBasemapStyle(styleJson, {
            labelsVisible: manifest.basemap?.labelsVisible,
          }),
          center: manifest.defaultCenter
            ? [manifest.defaultCenter[1], manifest.defaultCenter[0]]
            : [0, 20],
          zoom: manifest.defaultZoom ?? 2,
          pitch: manifest.defaultPitch ?? 0,
          maxPitch: 45,
          attributionControl: { compact: true },
        });

        mapRef = map;

        const onReady = () => {
          if (!cancelled) {
            setMapInstance(map);
          }
        };

        if (map.loaded()) {
          onReady();
        } else {
          map.on("load", onReady);
        }

        map.once("idle", onReady);
      })
      .catch(() => {
        // Style fetch failed after retries — map won't render
      });

    return () => {
      cancelled = true;
      setMapInstance(null);
      mapRef?.remove();
    };
  }, [manifest.theme]);

  const handleResize = useCallback(() => {
    mapInstance?.resize();
  }, [mapInstance]);

  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);

  const contextValue = useMemo(
    () => ({ map: mapInstance, isReady: mapInstance !== null }),
    [mapInstance],
  );

  return (
    <MapContext.Provider value={contextValue}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {children}
    </MapContext.Provider>
  );
}
