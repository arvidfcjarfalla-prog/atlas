"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./popup.css";
import { MapContext } from "./use-map";
import type { CameraPadding, MapManifest, MaplibreMap } from "./types";

interface MapViewportProps {
  manifest: MapManifest;
  children?: React.ReactNode;
  /**
   * Pixel insets describing UI chrome that obscures the map (e.g. sidebar).
   * Applied via map.setPadding() so fitBounds/flyTo automatically account for
   * the obscured area. This means defaultCenter/defaultZoom and any subsequent
   * camera moves will be centred within the *visible* portion of the viewport.
   */
  cameraPadding?: CameraPadding;
  /** Called with the MapLibre instance once the map is loaded. Used for camera sync in compare views. */
  onMapReady?: (map: MaplibreMap) => void;
}

const BASEMAP_STYLES: Record<string, string> = {
  editorial: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  explore: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  decision: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};

/**
 * Minimal inline style for choropleth maps — no external basemap tiles.
 * Just a dark background so the choropleth polygons are the only visual.
 */
const MINIMAL_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#080e1a" },
    },
  ],
};

/** Check if every layer in the manifest is a filled-polygon family. */
function isChoroplethOnly(manifest: MapManifest): boolean {
  const layers = manifest.layers;
  if (!layers || layers.length === 0) return false;
  return layers.every(
    (l) => l.style?.mapFamily === "choropleth" || l.style?.mapFamily === "isochrone",
  );
}

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
  const LAND_COLOR = "#1a2030";
  const WATER_COLOR = "#0a1020";
  const BG_COLOR = "#080e1a";
  const BORDER_COLOR = "#2a3548";

  const layers = style.layers.map((layer) => {
    // Background — dark navy
    if (layer.type === "background") {
      return {
        ...layer,
        paint: { ...layer.paint, "background-color": BG_COLOR },
      };
    }

    // Water fills — distinctly darker than land for clear contrast
    if (layer.type === "fill" && layer.id.includes("water")) {
      return {
        ...layer,
        paint: { "fill-color": WATER_COLOR, "fill-opacity": 1 },
      };
    }

    // Landcover layers — subtle texture on land
    if (layer.type === "fill" && layer.id.includes("landcover")) {
      if (hideLabels) {
        return { ...layer, layout: { ...layer.layout, visibility: "none" as const } };
      }
      return {
        ...layer,
        paint: { "fill-color": "#222a38", "fill-opacity": 0.5 },
      };
    }

    // All other fills — visible land color
    if (layer.type === "fill") {
      return {
        ...layer,
        paint: { "fill-color": LAND_COLOR, "fill-opacity": 1 },
      };
    }

    // Structural lines — visible borders between countries
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
          "line-color": BORDER_COLOR,
          "line-opacity": base * 0.4,
        },
      };
    }

    // Labels — readable but not dominant
    if (layer.type === "symbol") {
      if (hideLabels) {
        return { ...layer, layout: { ...layer.layout, visibility: "none" as const } };
      }
      const paint = layer.paint as Record<string, unknown> | undefined;
      return {
        ...layer,
        paint: {
          ...paint,
          "text-opacity": 0.45,
          "text-color": "rgba(180, 195, 210, 1)",
          "text-halo-color": "rgba(0, 0, 0, 0.8)",
          "text-halo-width": 1.5,
          "text-halo-blur": 1,
        },
      };
    }

    return layer;
  });

  return { ...style, layers };
}

export function MapViewport({ manifest, children, cameraPadding, onMapReady }: MapViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<MaplibreMap | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    let mapRef: MaplibreMap | null = null;

    const useMinimal = isChoroplethOnly(manifest);

    const initMap = (style: maplibregl.StyleSpecification) => {
      if (cancelled || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: manifest.defaultCenter
          ? [manifest.defaultCenter[1], manifest.defaultCenter[0]]
          : [0, 20],
        zoom: manifest.defaultZoom ?? 2,
        pitch: manifest.defaultPitch ?? 0,
        maxPitch: 45,
        attributionControl: { compact: true },
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });

      mapRef = map;

      const onReady = () => {
        if (!cancelled) {
          if (cameraPadding) {
            map.setPadding({
              top: cameraPadding.top ?? 0,
              right: cameraPadding.right ?? 0,
              bottom: cameraPadding.bottom ?? 0,
              left: cameraPadding.left ?? 0,
            });
          }
          setMapInstance(map);
          onMapReady?.(map);
        }
      };

      if (map.loaded()) {
        onReady();
      } else {
        map.on("load", onReady);
      }
    };

    if (useMinimal) {
      initMap(MINIMAL_STYLE);
    } else {
      const styleUrl = BASEMAP_STYLES[manifest.theme] ?? BASEMAP_STYLES.explore;
      fetchStyleWithRetry(styleUrl)
        .then((styleJson) => {
          initMap(
            transformBasemapStyle(styleJson, {
              labelsVisible: manifest.basemap?.labelsVisible,
            }),
          );
        })
        .catch(() => {
          // Style fetch failed after retries — map won't render
        });
    }

    return () => {
      cancelled = true;
      setMapInstance(null);
      mapRef?.remove();
    };
  // cameraPadding intentionally excluded — it's consumed once at init inside
  // onReady via closure. Re-creating the map on padding change would be wrong.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
