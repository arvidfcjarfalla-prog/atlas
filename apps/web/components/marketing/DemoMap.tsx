"use client";

import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";

export type DemoMapPhase = "full" | "filtered" | "highlight";

const BG = "#080e1a";
const BORDER = "#1a2838";

// Saturated, crisp fills — no opacity wash
const HIGH = "#6ee0a8";   // >25 GW — vivid sage
const MID = "#2d8a58";    // 8-25 GW — deep green
const LOW = "#163828";     // <8 GW — dark green
const CTX = "#0e1420";     // context (no data)
const DIM = "#0a0e18";     // filtered out
const DK_HL = "#a0f0cc";   // Denmark highlight

const GEOJSON_URL = "/marketing/europe-wind.json";

// Europe bounds [west, south, east, north]
const BOUNDS: [number, number, number, number] = [-12, 34, 35, 72];

const fullFill: maplibregl.ExpressionSpecification = [
  "case",
  [">", ["get", "gw"], 25], HIGH,
  [">=", ["get", "gw"], 8], MID,
  [">", ["get", "gw"], 0], LOW,
  CTX,
];

const filteredFill: maplibregl.ExpressionSpecification = [
  "case",
  [">=", ["get", "gw"], 10], [
    "case", [">", ["get", "gw"], 25], HIGH, MID,
  ],
  [">", ["get", "gw"], 0], DIM,
  CTX,
];

const highlightFill: maplibregl.ExpressionSpecification = [
  "case",
  ["==", ["get", "id"], "DK"], DK_HL,
  [">=", ["get", "gw"], 10], [
    "case", [">", ["get", "gw"], 25], HIGH, MID,
  ],
  [">", ["get", "gw"], 0], DIM,
  CTX,
];

const fullOpacity: maplibregl.ExpressionSpecification = [
  "case", [">", ["get", "gw"], 0], 1, 0.7,
];

const filteredOpacity: maplibregl.ExpressionSpecification = [
  "case",
  [">=", ["get", "gw"], 10], 1,
  [">", ["get", "gw"], 0], 0.18,
  0.5,
];

const highlightOpacity: maplibregl.ExpressionSpecification = [
  "case",
  ["==", ["get", "id"], "DK"], 1,
  [">=", ["get", "gw"], 10], 1,
  [">", ["get", "gw"], 0], 0.12,
  0.4,
];

interface Props {
  phase: DemoMapPhase;
}

export function DemoMap({ phase }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const applyPhase = useCallback((map: maplibregl.Map, p: DemoMapPhase) => {
    if (!map.getLayer("countries-fill")) return;

    if (p === "full") {
      map.setPaintProperty("countries-fill", "fill-color", fullFill);
      map.setPaintProperty("countries-fill", "fill-opacity", fullOpacity);
    } else if (p === "filtered") {
      map.setPaintProperty("countries-fill", "fill-color", filteredFill);
      map.setPaintProperty("countries-fill", "fill-opacity", filteredOpacity);
    } else {
      map.setPaintProperty("countries-fill", "fill-color", highlightFill);
      map.setPaintProperty("countries-fill", "fill-opacity", highlightOpacity);
    }

    // DK marker
    if (p === "highlight") {
      if (!markerRef.current) {
        const el = document.createElement("div");
        const wrapper = document.createElement("div");
        wrapper.style.position = "relative";

        const style = document.createElement("style");
        style.textContent = "@keyframes atlas-dk-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.8);opacity:0.4}}";
        wrapper.appendChild(style);

        const dot = document.createElement("div");
        Object.assign(dot.style, {
          width: "10px", height: "10px", borderRadius: "50%",
          background: DK_HL,
          boxShadow: "0 0 14px 5px rgba(160,240,204,0.5),0 0 28px 10px rgba(160,240,204,0.2)",
          animation: "atlas-dk-pulse 2s ease-in-out infinite",
        });
        wrapper.appendChild(dot);

        const label = document.createElement("div");
        Object.assign(label.style, {
          position: "absolute", left: "16px", top: "-5px",
          fontFamily: "'Courier New',monospace", fontSize: "10px", color: DK_HL,
          background: "rgba(8,14,26,0.94)", border: "1px solid rgba(160,240,204,0.3)",
          padding: "2px 8px", borderRadius: "4px", whiteSpace: "nowrap",
          backdropFilter: "blur(6px)",
        });
        label.textContent = "DK +4.2 GW";
        wrapper.appendChild(label);

        el.appendChild(wrapper);
        markerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([9.5, 56.2])
          .addTo(map);
      }
    } else {
      markerRef.current?.remove();
      markerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": BG } }],
      },
      bounds: BOUNDS,
      fitBoundsOptions: { padding: 20 },
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      maxZoom: 5,
      minZoom: 2,
    });

    mapRef.current = map;

    map.on("load", async () => {
      let geojson;
      try {
        const res = await fetch(GEOJSON_URL);
        if (!res.ok) return;
        geojson = await res.json();
      } catch { return; }

      map.addSource("europe", { type: "geojson", data: geojson });

      map.addLayer({
        id: "countries-fill",
        type: "fill",
        source: "europe",
        paint: {
          "fill-color": fullFill,
          "fill-opacity": fullOpacity,
          "fill-opacity-transition": { duration: 700 },
          "fill-color-transition": { duration: 700 },
        },
      });

      map.addLayer({
        id: "countries-stroke",
        type: "line",
        source: "europe",
        paint: {
          "line-color": BORDER,
          "line-width": 0.6,
          "line-opacity": 0.5,
        },
      });

      // Apply current phase
      applyPhase(map, phaseRef.current);
    });

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [applyPhase]);

  useEffect(() => {
    if (mapRef.current?.isStyleLoaded()) {
      applyPhase(mapRef.current, phase);
    }
  }, [phase, applyPhase]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%", minHeight: 380 }} />;
}
