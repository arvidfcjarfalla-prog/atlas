"use client";

import { useEffect, useRef } from "react";
import { useMap } from "./use-map";
import type { DeckLayerConfig } from "./manifest-compiler";

function readPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function toLinePath(value: unknown): [number, number][] {
  if (!Array.isArray(value) || value.length === 0) return [];

  // LineString coordinates: [[lng, lat], ...]
  if (
    Array.isArray(value[0]) &&
    Array.isArray((value[0] as unknown[])[0]) === false &&
    typeof (value[0] as unknown[])[0] === "number"
  ) {
    return value as [number, number][];
  }

  // MultiLineString coordinates: pick the first segment with points.
  if (Array.isArray(value[0]) && Array.isArray((value[0] as unknown[])[0])) {
    const firstLine = (value as unknown[][][]).find(
      (segment) => Array.isArray(segment) && segment.length > 0,
    );
    return (firstLine ?? []) as [number, number][];
  }

  return [];
}

function toTimestampSeries(value: unknown, length: number): number[] {
  if (length <= 0) return [];
  if (Array.isArray(value)) {
    const parsed = value
      .map((v) => (typeof v === "number" ? v : Number(v)))
      .filter((v) => Number.isFinite(v));
    if (parsed.length >= length) return parsed.slice(0, length);
    if (parsed.length > 0) {
      const start = parsed[parsed.length - 1] ?? 0;
      return parsed.concat(
        Array.from({ length: length - parsed.length }, (_, i) => start + i + 1),
      );
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Array.from({ length }, (_, i) => value + i);
  }
  return Array.from({ length }, (_, i) => i);
}

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
        const [{ MapboxOverlay }, { HexagonLayer, ScreenGridLayer }, { TripsLayer }] = await Promise.all([
          import("@deck.gl/mapbox"),
          import("@deck.gl/aggregation-layers"),
          import("@deck.gl/geo-layers"),
        ]);

        if (cancelled) return;

        const layers = deckLayers.map((config, index) => {
          switch (config.type) {
            case "HexagonLayer":
              return new HexagonLayer({
                id: `hexagon-layer-${index}`,
                ...config.props,
                getPosition: (d: number[]) => d as [number, number, number],
              });
            case "ScreenGridLayer":
              return new ScreenGridLayer({
                id: `screen-grid-layer-${index}`,
                ...config.props,
                getPosition: (d: number[]) => d as [number, number, number],
              });
            case "TripsLayer": {
              const pathAccessor =
                typeof config.props.getPath === "string" ? config.props.getPath : null;
              const timestampAccessor =
                typeof config.props.getTimestamps === "string" ? config.props.getTimestamps : null;
              const props = { ...config.props } as Record<string, unknown>;
              delete props.getPath;
              delete props.getTimestamps;
              return new TripsLayer({
                id: `trips-layer-${index}`,
                ...props,
                getPath: (d: unknown) => {
                  if (!pathAccessor) return [];
                  return toLinePath(readPath(d, pathAccessor));
                },
                getTimestamps: (d: unknown) => {
                  if (!pathAccessor) return [];
                  const line = toLinePath(readPath(d, pathAccessor));
                  const raw = timestampAccessor ? readPath(d, timestampAccessor) : undefined;
                  return toTimestampSeries(raw, line.length);
                },
              });
            }
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
