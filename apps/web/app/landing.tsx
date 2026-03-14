"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// ─── Basemap quieting ────────────────────────────────────────
// Mirrors transformBasemapStyle from map-viewport.tsx

const STYLE_URL =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

function quietBasemap(
  style: maplibregl.StyleSpecification,
): maplibregl.StyleSpecification {
  const layers = style.layers.map((layer) => {
    if (layer.type === "background") {
      return {
        ...layer,
        paint: { ...layer.paint, "background-color": "#030508" },
      };
    }
    if (layer.type === "fill" && layer.id.includes("water")) {
      return {
        ...layer,
        paint: { "fill-color": "#040810", "fill-opacity": 1 },
      };
    }
    if (layer.type === "fill" && layer.id.includes("landcover")) {
      return {
        ...layer,
        paint: { "fill-color": "#181e28", "fill-opacity": 0.85 },
      };
    }
    if (layer.type === "fill") {
      return {
        ...layer,
        paint: { "fill-color": "#151921", "fill-opacity": 1 },
      };
    }
    if (layer.type === "line") {
      const paint = layer.paint as Record<string, unknown> | undefined;
      if (!paint) return layer;
      const existing = paint["line-opacity"];
      const base = typeof existing === "number" ? existing : 1;
      return {
        ...layer,
        paint: {
          ...paint,
          "line-color": "#1a2535",
          "line-opacity": base * 0.15,
        },
      };
    }
    if (layer.type === "symbol") {
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

// ─── Great-circle interpolation ─────────────────────────────
// Inlined haversine slerp — avoids cross-package import

function interpolateGreatCircle(
  from: [number, number],
  to: [number, number],
  numPoints: number,
): [number, number][] {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const lat1 = from[1] * toRad;
  const lng1 = from[0] * toRad;
  const lat2 = to[1] * toRad;
  const lng2 = to[0] * toRad;
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2,
      ),
    );
  if (d < 1e-10) return [from, to];
  const points: [number, number][] = [];
  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x =
      A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y =
      A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    points.push([
      Math.atan2(y, x) * toDeg,
      Math.atan2(z, Math.sqrt(x * x + y * y)) * toDeg,
    ]);
  }
  return points;
}

// ─── Scene definitions ───────────────────────────────────────

interface DemoScene {
  label: string;
  center: [number, number];
  zoom: number;
  render: (map: maplibregl.Map) => () => void;
}

function createPulsingMarker(color: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "landing-marker";
  el.style.cssText = `
    width: 12px; height: 12px; border-radius: 50%;
    background: ${color}; box-shadow: 0 0 8px ${color};
    animation: landing-pulse 2s ease-in-out infinite;
  `;
  return el;
}

function createCircleMarker(color: string, size: number): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `
    width: ${size}px; height: ${size}px; border-radius: 50%;
    background: ${color}; opacity: 0.5;
    box-shadow: 0 0 ${size / 2}px ${color};
  `;
  return el;
}

// ─── Wildfire data ───────────────────────────────────────────

const WILDFIRE_INCIDENTS: {
  name: string;
  lngLat: [number, number];
  weight: number;
}[] = [
  { name: "Catalonia", lngLat: [2.3, 41.8], weight: 0.7 },
  { name: "Attica", lngLat: [23.7, 38.0], weight: 1 },
  { name: "Algarve", lngLat: [-8.6, 37.2], weight: 0.7 },
  { name: "Calabria", lngLat: [16.2, 38.9], weight: 0.4 },
  { name: "Peloponnese", lngLat: [22.1, 37.5], weight: 1 },
];

const SCENES: DemoScene[] = [
  {
    label: "Wildfire incidents \u2014 Europe",
    center: [10, 42],
    zoom: 4,
    render: (map) => {
      const sourceId = "landing-wildfires";
      const heatLayerId = "landing-wildfires-heat";

      map.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: WILDFIRE_INCIDENTS.map((inc) => ({
            type: "Feature" as const,
            geometry: {
              type: "Point" as const,
              coordinates: inc.lngLat,
            },
            properties: { weight: inc.weight, name: inc.name },
          })),
        },
      });

      map.addLayer({
        id: heatLayerId,
        type: "heatmap",
        source: sourceId,
        paint: {
          "heatmap-weight": ["get", "weight"],
          "heatmap-intensity": 3,
          "heatmap-radius": 80,
          "heatmap-opacity": 0.9,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(0,0,0,0)",
            0.1,
            "rgba(100,0,0,0.4)",
            0.3,
            "#cc3300",
            0.5,
            "#f97316",
            0.7,
            "#fbbf24",
            1,
            "#fef3c7",
          ],
        },
      });

      // Animated fire flicker via heatmap-intensity oscillation
      let tick = 0;
      const interval = setInterval(() => {
        tick++;
        const noise = Math.sin(tick * 0.4) * 0.3 + Math.sin(tick * 1.1) * 0.2;
        const intensity = 3 + noise;
        if (map.getLayer(heatLayerId)) {
          map.setPaintProperty(heatLayerId, "heatmap-intensity", intensity);
        }
      }, 80);

      return () => {
        clearInterval(interval);
        if (map.getLayer(heatLayerId)) map.removeLayer(heatLayerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      };
    },
  },
  {
    label: "Earthquake activity \u2014 Pacific",
    center: [160, 20],
    zoom: 3,
    render: (map) => {
      const coords: [number, number][] = [
        [141, 38], [125, 10], [170, -20], [145, 35], [155, -6],
      ];
      const markers = coords.map((lngLat) =>
        new maplibregl.Marker({ element: createPulsingMarker("#ef4444") })
          .setLngLat(lngLat)
          .addTo(map),
      );
      return () => markers.forEach((m) => m.remove());
    },
  },
  {
    label: "Global shipping routes",
    center: [0, 20],
    zoom: 2,
    render: (map) => {
      const routes: { from: [number, number]; to: [number, number] }[] = [
        { from: [103.8, 1.35], to: [4.5, 51.9] },
        { from: [121.5, 31.2], to: [-118.2, 34.0] },
        { from: [55.3, 25.2], to: [10.0, 53.5] },
      ];

      const arcs = routes.map((r) =>
        interpolateGreatCircle(r.from, r.to, 60),
      );

      const sourceId = "landing-routes";
      const layerId = "landing-routes-line";

      map.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: arcs.map((coords) => ({
            type: "Feature" as const,
            geometry: {
              type: "LineString" as const,
              coordinates: coords,
            },
            properties: {},
          })),
        },
      });

      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#38bdf8",
          "line-width": 1.5,
          "line-opacity": 0.5,
        },
      });

      // Animated boat markers — white 8px dots moving along arcs
      const boatMarkers = arcs.map((arc) => {
        const el = document.createElement("div");
        el.style.cssText =
          "width:8px;height:8px;border-radius:50%;background:white;box-shadow:0 0 6px rgba(255,255,255,0.6);";
        return new maplibregl.Marker({ element: el })
          .setLngLat(arc[0])
          .addTo(map);
      });

      const DURATION = 8000;
      const TICK = 50;
      let elapsed = 0;

      const interval = setInterval(() => {
        elapsed = (elapsed + TICK) % DURATION;
        const progress = elapsed / DURATION;
        boatMarkers.forEach((marker, i) => {
          const arc = arcs[i];
          const idx = Math.floor(progress * (arc.length - 1));
          marker.setLngLat(arc[idx]);
        });
      }, TICK);

      return () => {
        clearInterval(interval);
        boatMarkers.forEach((m) => m.remove());
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      };
    },
  },
  {
    label: "Population density \u2014 EU",
    center: [10, 52],
    zoom: 4,
    render: (map) => {
      const cities: { lngLat: [number, number]; size: number }[] = [
        { lngLat: [2.35, 48.86], size: 40 },
        { lngLat: [13.4, 52.52], size: 34 },
        { lngLat: [-0.12, 51.51], size: 44 },
        { lngLat: [12.5, 41.9], size: 28 },
        { lngLat: [-3.7, 40.42], size: 30 },
        { lngLat: [4.9, 52.37], size: 20 },
        { lngLat: [21.0, 52.23], size: 22 },
        { lngLat: [16.37, 48.21], size: 22 },
        { lngLat: [18.07, 59.33], size: 18 },
      ];
      const markers = cities.map(({ lngLat, size }) =>
        new maplibregl.Marker({ element: createCircleMarker("#a855f7", size) })
          .setLngLat(lngLat)
          .addTo(map),
      );
      return () => markers.forEach((m) => m.remove());
    },
  },
];

// ─── Suggestion pills ────────────────────────────────────────

const SUGGESTIONS = [
  { emoji: "\uD83D\uDD25", label: "Wildfire incidents" },
  { emoji: "\uD83D\uDEA2", label: "Shipping routes" },
  { emoji: "\uD83C\uDF0B", label: "Earthquakes" },
];

// ─── Component ───────────────────────────────────────────────

export default function Landing() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Init map
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    fetch(STYLE_URL)
      .then((res) => {
        if (!res.ok) throw new Error("Style fetch failed");
        return res.json() as Promise<maplibregl.StyleSpecification>;
      })
      .then((styleJson) => {
        if (cancelled || !containerRef.current) return;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: quietBasemap(styleJson),
          center: SCENES[0].center,
          zoom: SCENES[0].zoom,
          pitch: 0,
          attributionControl: false,
          interactive: false,
          pixelRatio: window.devicePixelRatio,
        });

        mapRef.current = map;

        map.once("idle", () => {
          if (!cancelled) setMapReady(true);
        });
      })
      .catch(() => {
        // Style fetch failed — page still usable without map
      });

    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Scene cycling
  useEffect(() => {
    if (!mapReady) return;
    const interval = setInterval(() => {
      setSceneIndex((prev) => (prev + 1) % SCENES.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [mapReady]);

  // Apply scene
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const scene = SCENES[sceneIndex];

    cleanupRef.current?.();
    cleanupRef.current = null;

    // Check if map is already at the target position (first scene on load)
    const currentCenter = map.getCenter();
    const alreadyThere =
      Math.abs(currentCenter.lng - scene.center[0]) < 0.1 &&
      Math.abs(currentCenter.lat - scene.center[1]) < 0.1;

    if (alreadyThere) {
      cleanupRef.current = scene.render(map);
      return;
    }

    map.flyTo({
      center: scene.center,
      zoom: scene.zoom,
      duration: 3000,
      essential: true,
      easing: (t: number) => t * (2 - t),
    });

    let cancelled = false;
    const onMoveEnd = () => {
      if (!cancelled && mapRef.current) {
        cleanupRef.current = scene.render(mapRef.current);
      }
    };
    map.once("moveend", onMoveEnd);

    return () => {
      cancelled = true;
      map.off("moveend", onMoveEnd);
    };
  }, [sceneIndex, mapReady]);

  const handleSubmit = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    router.push(`/create?prompt=${encodeURIComponent(trimmed)}`);
  }, [prompt, router]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const currentLabel = SCENES[sceneIndex].label;

  return (
    <div data-theme="explore" className="h-full w-full relative overflow-hidden">
      {/* Pulsing marker animation */}
      <style>{`
        @keyframes landing-pulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.6); opacity: 0.3; }
        }
      `}</style>

      {/* Map container */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {/* Color overlays */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: [
            "radial-gradient(ellipse at 20% 50%, rgba(13,79,60,0.4) 0%, transparent 55%)",
            "radial-gradient(ellipse at 80% 20%, rgba(26,58,110,0.4) 0%, transparent 50%)",
            "radial-gradient(ellipse at 60% 80%, rgba(45,27,78,0.3) 0%, transparent 50%)",
          ].join(", "),
        }}
      />

      {/* Bottom gradient for prompt readability */}
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none"
        style={{
          height: 200,
          background: "linear-gradient(to top, #111827 0%, transparent 100%)",
        }}
      />

      {/* Header */}
      <header className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-6 h-12">
        <span className="text-sm font-semibold tracking-tight text-white/90">
          Atlas
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-sm text-white/60 hover:text-white/90 transition-colors"
          >
            Log in
          </button>
          <button
            type="button"
            className="text-sm bg-white/10 hover:bg-white/15 text-white/90 px-3 py-1.5 rounded-md transition-colors"
          >
            Get started
          </button>
        </div>
      </header>

      {/* Map type label */}
      <div className="absolute top-14 left-6 z-10">
        <span className="text-xs font-mono uppercase tracking-wider text-white/40">
          {currentLabel}
        </span>
      </div>

      {/* Prompt bar */}
      <div className="absolute bottom-8 inset-x-0 z-10 flex flex-col items-center px-4">
        {/* Suggestion pills */}
        <div className="flex gap-2 mb-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setPrompt(`${s.emoji} ${s.label}`)}
              className="text-xs px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white/80 border border-white/10 transition-colors backdrop-blur-sm"
            >
              {s.emoji} {s.label}
            </button>
          ))}
        </div>

        <div
          className="w-full max-w-[540px] flex items-center gap-2 rounded-xl px-3 py-2 border border-white/10"
          style={{
            background: "rgba(17, 24, 39, 0.85)",
            backdropFilter: "blur(16px)",
          }}
        >
          {/* Upload button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/70 transition-colors shrink-0 px-2 py-1.5 rounded-lg hover:bg-white/5"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Upload
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
          />

          {/* Prompt input */}
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Atlas to create a map of..."
            className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/30 outline-none"
          />

          {/* Send button */}
          <button
            type="button"
            onClick={handleSubmit}
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity"
            style={{ background: "#1d9e75" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
