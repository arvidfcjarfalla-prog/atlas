"use client";

import { useEffect, useRef } from "react";
import { useMap } from "./use-map";
import type { DeckLayerConfig } from "./manifest-compiler";

/**
 * Hook that resolves DeckLayerConfig[] into actual deck.gl layers
 * and renders them on a MapboxOverlay synchronized with MapLibre.
 *
 * All deck.gl imports are dynamic to avoid bloating the initial bundle (~200KB).
 */
export function useDeckOverlay(deckLayers?: DeckLayerConfig[]) {
  const { map, isReady } = useMap();
  const overlayRef = useRef<unknown>(null);
  const prevConfigRef = useRef<string>("");

  useEffect(() => {
    if (!map || !isReady || !deckLayers || deckLayers.length === 0) return;

    // Skip if config hasn't changed (avoid re-creating overlay on every render)
    const configKey = JSON.stringify(deckLayers);
    if (configKey === prevConfigRef.current) return;
    prevConfigRef.current = configKey;

    let cancelled = false;

    (async () => {
      try {
        // Dynamic import deck.gl packages
        const [{ MapboxOverlay }, { HexagonLayer, ScreenGridLayer }, deckLayers_] = await Promise.all([
          import("@deck.gl/mapbox"),
          import("@deck.gl/aggregation-layers"),
          import("@deck.gl/layers"),
        ]);

        if (cancelled) return;

        const layers = deckLayers.map((config) => {
          switch (config.type) {
            case "HexagonLayer":
              return new HexagonLayer({
                id: "hexagon-layer",
                ...config.props,
                getPosition: (d: number[]) => d as [number, number, number],
              });
            case "ScreenGridLayer":
              return new ScreenGridLayer({
                id: "screen-grid-layer",
                ...config.props,
                getPosition: (d: number[]) => d as [number, number, number],
              });
            // TripsLayer requires @deck.gl/geo-layers — dynamic import if needed
            default:
              return null;
          }
        }).filter(Boolean);

        if (layers.length === 0) return;

        // Remove previous overlay
        if (overlayRef.current) {
          try {
            (map as any).removeControl(overlayRef.current);
          } catch { /* noop */ }
        }

        const overlay = new MapboxOverlay({
          layers,
          interleaved: false,
        });

        (map as any).addControl(overlay);
        overlayRef.current = overlay;
      } catch (err) {
        console.warn("[Atlas] deck.gl overlay failed to load:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [map, isReady, deckLayers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (overlayRef.current && map) {
        try {
          (map as any).removeControl(overlayRef.current);
        } catch { /* noop */ }
        overlayRef.current = null;
      }
    };
  }, [map]);
}
