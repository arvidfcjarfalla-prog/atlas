"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useMap } from "./use-map";
import type { MapLayerMouseEvent, GeoJSONSource, LngLat } from "maplibre-gl";

const SOURCE_ID = "atlas-measure-source";
const LINE_LAYER_ID = "atlas-measure-line";
const POINT_LAYER_ID = "atlas-measure-points";

interface MeasureResult {
  distance: number; // km
  area: number | null; // km², null if not a closed polygon
  points: [number, number][];
}

/**
 * Click-to-measure tool for distance and area.
 * Uses turf/length and turf/area for calculations.
 * Renders measurement line/polygon on the map.
 */
export function MeasureControl() {
  const { map, isReady } = useMap();
  const [active, setActive] = useState(false);
  const [result, setResult] = useState<MeasureResult | null>(null);
  const pointsRef = useRef<[number, number][]>([]);
  const addedRef = useRef(false);

  const updateSource = useCallback(() => {
    if (!map) return;
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;

    const pts = pointsRef.current;
    const features: GeoJSON.Feature[] = [];

    // Line or polygon
    if (pts.length >= 2) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: pts },
        properties: {},
      });
    }

    // Points
    for (const p of pts) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: p },
        properties: {},
      });
    }

    source.setData({ type: "FeatureCollection", features });
  }, [map]);

  const computeResult = useCallback(async () => {
    const pts = pointsRef.current;
    if (pts.length < 2) {
      setResult(null);
      return;
    }

    try {
      const turfLength = (await import("@turf/length")).default;
      const turfArea = (await import("@turf/area")).default;
      const { lineString, polygon } = await import("@turf/helpers");

      const line = lineString(pts);
      const distance = turfLength(line, { units: "kilometers" });

      let area: number | null = null;
      if (pts.length >= 3) {
        const closed = [...pts, pts[0]];
        const poly = polygon([closed]);
        area = turfArea(poly) / 1_000_000; // m² → km²
      }

      setResult({ distance, area, points: [...pts] });
    } catch {
      setResult(null);
    }
  }, []);

  // Set up map layers
  useEffect(() => {
    if (!map || !isReady || !active || addedRef.current) return;

    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }

    if (!map.getLayer(LINE_LAYER_ID)) {
      map.addLayer({
        id: LINE_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": "#8ecba0",
          "line-width": 2,
          "line-dasharray": [4, 2],
        },
        filter: ["==", "$type", "LineString"],
      });
    }

    if (!map.getLayer(POINT_LAYER_ID)) {
      map.addLayer({
        id: POINT_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-color": "#8ecba0",
          "circle-radius": 4,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#fff",
        },
        filter: ["==", "$type", "Point"],
      });
    }

    addedRef.current = true;

    return () => {
      try {
        if (map.getLayer(POINT_LAYER_ID)) map.removeLayer(POINT_LAYER_ID);
        if (map.getLayer(LINE_LAYER_ID)) map.removeLayer(LINE_LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch { /* noop */ }
      addedRef.current = false;
    };
  }, [map, isReady, active]);

  // Handle clicks
  useEffect(() => {
    if (!map || !isReady || !active) return;

    const canvas = map.getCanvas();
    const prevCursor = canvas.style.cursor;
    canvas.style.cursor = "crosshair";

    const handleClick = (e: MapLayerMouseEvent) => {
      pointsRef.current.push([e.lngLat.lng, e.lngLat.lat]);
      updateSource();
      computeResult();
    };

    map.on("click", handleClick);

    return () => {
      map.off("click", handleClick);
      canvas.style.cursor = prevCursor;
    };
  }, [map, isReady, active, updateSource, computeResult]);

  const handleToggle = useCallback(() => {
    if (active) {
      // Deactivate — clear measurement
      pointsRef.current = [];
      setResult(null);
      if (map) {
        const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
        source?.setData({ type: "FeatureCollection", features: [] });
      }
    }
    setActive(!active);
  }, [active, map]);

  const handleClear = useCallback(() => {
    pointsRef.current = [];
    setResult(null);
    updateSource();
  }, [updateSource]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 12,
        right: 12,
        zIndex: 5,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 6,
        fontFamily: "'Geist',system-ui,sans-serif",
      }}
    >
      {active && result && (
        <div
          style={{
            background: "rgba(12,16,24,0.85)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 12,
            color: "rgba(240,245,250,0.9)",
            lineHeight: 1.6,
          }}
        >
          <div>
            <span style={{ color: "rgba(200,210,225,0.5)" }}>Distance: </span>
            {result.distance < 1
              ? `${(result.distance * 1000).toFixed(0)} m`
              : `${result.distance.toFixed(2)} km`}
          </div>
          {result.area != null && (
            <div>
              <span style={{ color: "rgba(200,210,225,0.5)" }}>Area: </span>
              {result.area < 1
                ? `${(result.area * 1_000_000).toFixed(0)} m\u00B2`
                : `${result.area.toFixed(2)} km\u00B2`}
            </div>
          )}
          <button
            onClick={handleClear}
            style={{
              marginTop: 4,
              background: "none",
              border: "none",
              color: "rgba(200,210,225,0.4)",
              fontSize: 11,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Clear
          </button>
        </div>
      )}
      <button
        onClick={handleToggle}
        style={{
          background: active ? "rgba(142,203,160,0.2)" : "rgba(12,16,24,0.75)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          border: `1px solid ${active ? "rgba(142,203,160,0.4)" : "rgba(255,255,255,0.08)"}`,
          borderRadius: 6,
          padding: "6px 12px",
          fontSize: 11,
          color: active ? "#8ecba0" : "rgba(200,210,225,0.7)",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
        title={active ? "Stop measuring" : "Measure distance/area"}
      >
        {active ? "Stop measure" : "Measure"}
      </button>
    </div>
  );
}
