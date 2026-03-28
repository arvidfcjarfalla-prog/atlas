"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./popup.css";
import { MapContext } from "./use-map";
import type { BasemapStyle } from "@atlas/data-models";
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

// ─── Config-driven basemap presets ──────────────────────────

const CARTO_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const CARTO_LIGHT = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

interface BasemapTransformConfig {
  sourceUrl: string;
  bg: string;
  land: string;
  water: string;
  border: string;
  landcover: string;
  lineOpacityMultiplier: number;
  textOpacity: number;
  textColor: string;
  textHaloColor: string;
}

const BASEMAP_CONFIGS: Record<BasemapStyle, BasemapTransformConfig> = {
  dark: {
    sourceUrl: CARTO_DARK,
    bg: "#080e1a",
    land: "#10141e",
    water: "#060a14",
    border: "#1e2838",
    landcover: "#161c28",
    lineOpacityMultiplier: 0.15,
    textOpacity: 0.20,
    textColor: "rgba(160, 175, 195, 1)",
    textHaloColor: "rgba(0, 0, 0, 0.9)",
  },
  paper: {
    sourceUrl: CARTO_LIGHT,
    bg: "#f0ece4",
    land: "#f5f1ea",
    water: "#d8e4ec",
    border: "#c8c0b4",
    landcover: "#e8e4da",
    lineOpacityMultiplier: 0.25,
    textOpacity: 0.35,
    textColor: "rgba(80, 70, 60, 1)",
    textHaloColor: "rgba(245, 241, 234, 0.9)",
  },
  nord: {
    sourceUrl: CARTO_DARK,
    bg: "#2e3440",
    land: "#3b4252",
    water: "#1a2030",
    border: "#4c566a",
    landcover: "#434c5e",
    lineOpacityMultiplier: 0.25,
    textOpacity: 0.30,
    textColor: "rgba(216, 222, 233, 1)",
    textHaloColor: "rgba(46, 52, 64, 0.9)",
  },
  sepia: {
    sourceUrl: CARTO_LIGHT,
    bg: "#f2e8d5",
    land: "#f5eed8",
    water: "#c8d8c8",
    border: "#c0b090",
    landcover: "#e8e0c8",
    lineOpacityMultiplier: 0.25,
    textOpacity: 0.35,
    textColor: "rgba(90, 75, 50, 1)",
    textHaloColor: "rgba(242, 232, 213, 0.9)",
  },
  stark: {
    sourceUrl: CARTO_DARK,
    bg: "#000000",
    land: "#0a0a0a",
    water: "#000000",
    border: "#1a1a1a",
    landcover: "#0f0f0f",
    lineOpacityMultiplier: 0.10,
    textOpacity: 0.15,
    textColor: "rgba(140, 140, 140, 1)",
    textHaloColor: "rgba(0, 0, 0, 0.95)",
  },
  retro: {
    sourceUrl: CARTO_LIGHT,
    bg: "#e8dcc8",
    land: "#ede2d0",
    water: "#a8c8c0",
    border: "#b8a890",
    landcover: "#ddd4c0",
    lineOpacityMultiplier: 0.30,
    textOpacity: 0.40,
    textColor: "rgba(100, 80, 55, 1)",
    textHaloColor: "rgba(232, 220, 200, 0.9)",
  },
  ocean: {
    sourceUrl: CARTO_DARK,
    bg: "#04101e",
    land: "#0a1828",
    water: "#081420",
    border: "#183050",
    landcover: "#0e1e32",
    lineOpacityMultiplier: 0.20,
    textOpacity: 0.25,
    textColor: "rgba(120, 170, 210, 1)",
    textHaloColor: "rgba(4, 16, 30, 0.9)",
  },
};

/** Get the land color for a basemap preset — used by land mask to match basemap. */
export function getBasemapLandColor(style: BasemapStyle = "dark"): string {
  return BASEMAP_CONFIGS[style].land;
}

/** Minimal inline style for choropleth maps — background color matches basemap preset. */
function getMinimalStyle(basemapStyle: BasemapStyle = "dark"): maplibregl.StyleSpecification {
  const cfg = BASEMAP_CONFIGS[basemapStyle];
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": cfg.bg },
      },
    ],
  };
}

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

/** Apply a BasemapTransformConfig to a CARTO style JSON. */
function transformBasemapStyle(
  style: maplibregl.StyleSpecification,
  config: BasemapTransformConfig,
  options?: { labelsVisible?: boolean },
): maplibregl.StyleSpecification {
  const hideLabels = options?.labelsVisible === false;

  const layers = style.layers.map((layer) => {
    if (layer.type === "background") {
      return {
        ...layer,
        paint: { ...layer.paint, "background-color": config.bg },
      };
    }

    if (layer.type === "fill" && layer.id.includes("water")) {
      return {
        ...layer,
        paint: { "fill-color": config.water, "fill-opacity": 1 },
      };
    }

    if (layer.type === "fill" && layer.id.includes("landcover")) {
      if (hideLabels) {
        return { ...layer, layout: { ...layer.layout, visibility: "none" as const } };
      }
      return {
        ...layer,
        paint: { "fill-color": config.landcover, "fill-opacity": 0.5 },
      };
    }

    if (layer.type === "fill") {
      // Replace entire paint to remove zoom-dependent stops from CARTO style
      // that cause the map to lighten at higher zoom levels
      return {
        ...layer,
        paint: { "fill-color": config.land, "fill-opacity": 1, "fill-antialias": true },
      };
    }

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
          "line-color": config.border,
          "line-opacity": base * config.lineOpacityMultiplier,
        },
      };
    }

    if (layer.type === "symbol") {
      if (hideLabels) {
        return { ...layer, layout: { ...layer.layout, visibility: "none" as const } };
      }
      const paint = layer.paint as Record<string, unknown> | undefined;
      return {
        ...layer,
        paint: {
          ...paint,
          "text-opacity": config.textOpacity,
          "text-color": config.textColor,
          "text-halo-color": config.textHaloColor,
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

    const basemapStyle: BasemapStyle = manifest.basemap?.style ?? "dark";
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
      initMap(getMinimalStyle(basemapStyle));
    } else {
      const config = BASEMAP_CONFIGS[basemapStyle];
      fetchStyleWithRetry(config.sourceUrl)
        .then((styleJson) => {
          const transformed = transformBasemapStyle(styleJson, config, {
            labelsVisible: manifest.basemap?.labelsVisible,
          });
          initMap(transformed);
        })
        .catch((err) => {
          console.error("[Atlas] Failed to load basemap style:", err);
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
  }, [manifest.theme, manifest.basemap?.style]);

  // Resize map when container size changes (window resize or sidebar drag)
  useEffect(() => {
    if (!mapInstance || !containerRef.current) return;
    const ro = new ResizeObserver(() => mapInstance.resize());
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [mapInstance]);

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
