"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { decideClarifyAction } from "../lib/ai/clarify-action";
import type { ClarifyResponse, DatasetProfile } from "../lib/ai/types";
import type { MapManifest } from "@atlas/data-models";
import { getColors, classify } from "@atlas/data-models";
import { createClient } from "../lib/supabase/client";
import type { User } from "@supabase/supabase-js";

// ─── Basemap quieting ────────────────────────────────────────

const STYLE_URL =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

function quietBasemap(
  style: maplibregl.StyleSpecification,
): maplibregl.StyleSpecification {
  const layers = style.layers.map((layer) => {
    if (layer.type === "background") {
      return { ...layer, paint: { ...layer.paint, "background-color": "#0a0d14" } };
    }
    if (layer.type === "fill" && layer.id.includes("water")) {
      return { ...layer, paint: { "fill-color": "#060b14", "fill-opacity": 1 } };
    }
    if (layer.type === "fill" && layer.id.includes("landcover")) {
      return { ...layer, paint: { "fill-color": "#111827", "fill-opacity": 0.8 } };
    }
    if (layer.type === "fill") {
      return { ...layer, paint: { "fill-color": "#0d1220", "fill-opacity": 1 } };
    }
    if (layer.type === "line") {
      const paint = layer.paint as Record<string, unknown> | undefined;
      if (!paint) return layer;
      const existing = paint["line-opacity"];
      const base = typeof existing === "number" ? existing : 1;
      return { ...layer, paint: { ...paint, "line-color": "#1a2535", "line-opacity": base * 0.12 } };
    }
    if (layer.type === "symbol") {
      const paint = layer.paint as Record<string, unknown> | undefined;
      return { ...layer, paint: { ...paint, "text-opacity": 0.18, "text-color": "rgba(140,160,180,1)", "text-halo-color": "rgba(0,0,0,0.8)", "text-halo-blur": 2 } };
    }
    return layer;
  });
  return { ...style, layers };
}

// ─── Great-circle interpolation ─────────────────────────────

function interpolateGreatCircle(
  from: [number, number],
  to: [number, number],
  numPoints: number,
): [number, number][] {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const lat1 = from[1] * toRad, lng1 = from[0] * toRad;
  const lat2 = to[1] * toRad,   lng2 = to[0] * toRad;
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2,
  ));
  if (d < 1e-10) return [from, to];
  const points: [number, number][] = [];
  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    points.push([Math.atan2(y, x) * toDeg, Math.atan2(z, Math.sqrt(x * x + y * y)) * toDeg]);
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
  el.style.cssText = `width:10px;height:10px;border-radius:50%;background:${color};box-shadow:0 0 6px ${color};animation:landing-pulse 2s ease-in-out infinite;`;
  return el;
}

function createCircleMarker(color: string, size: number): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${color};opacity:0.45;box-shadow:0 0 ${size / 2}px ${color};`;
  return el;
}

const WILDFIRE_INCIDENTS = [
  { name: "Catalonia",   lngLat: [2.3,  41.8] as [number, number], weight: 0.7 },
  { name: "Attica",      lngLat: [23.7, 38.0] as [number, number], weight: 1   },
  { name: "Algarve",     lngLat: [-8.6, 37.2] as [number, number], weight: 0.7 },
  { name: "Calabria",    lngLat: [16.2, 38.9] as [number, number], weight: 0.4 },
  { name: "Peloponnese", lngLat: [22.1, 37.5] as [number, number], weight: 1   },
];

const SCENES: DemoScene[] = [
  {
    label: "Wildfire incidents — Europe",
    center: [10, 42],
    zoom: 4,
    render: (map) => {
      const src = "landing-wildfires", heat = "landing-wildfires-heat";
      map.addSource(src, { type: "geojson", data: { type: "FeatureCollection", features: WILDFIRE_INCIDENTS.map((inc) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: inc.lngLat }, properties: { weight: inc.weight } })) } });
      map.addLayer({ id: heat, type: "heatmap", source: src, paint: { "heatmap-weight": ["get", "weight"], "heatmap-intensity": 3, "heatmap-radius": 80, "heatmap-opacity": 0.85, "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.1, "rgba(100,0,0,0.4)", 0.3, "#cc3300", 0.5, "#f97316", 0.7, "#fbbf24", 1, "#fef3c7"] } });
      let tick = 0;
      const iv = setInterval(() => { tick++; const n = Math.sin(tick * 0.4) * 0.3 + Math.sin(tick * 1.1) * 0.2; if (map.getLayer(heat)) map.setPaintProperty(heat, "heatmap-intensity", 3 + n); }, 80);
      return () => { clearInterval(iv); if (map.getLayer(heat)) map.removeLayer(heat); if (map.getSource(src)) map.removeSource(src); };
    },
  },
  {
    label: "Earthquake activity — Pacific",
    center: [160, 20],
    zoom: 3,
    render: (map) => {
      const coords: [number, number][] = [[141, 38], [125, 10], [170, -20], [145, 35], [155, -6]];
      const markers = coords.map((c) => new maplibregl.Marker({ element: createPulsingMarker("#ef4444") }).setLngLat(c).addTo(map));
      return () => markers.forEach((m) => m.remove());
    },
  },
  {
    label: "Global shipping routes",
    center: [0, 20],
    zoom: 2,
    render: (map) => {
      const routes = [{ from: [103.8, 1.35] as [number, number], to: [4.5, 51.9] as [number, number] }, { from: [121.5, 31.2] as [number, number], to: [-118.2, 34.0] as [number, number] }, { from: [55.3, 25.2] as [number, number], to: [10.0, 53.5] as [number, number] }];
      const arcs = routes.map((r) => interpolateGreatCircle(r.from, r.to, 60));
      const src = "landing-routes", lyr = "landing-routes-line";
      map.addSource(src, { type: "geojson", data: { type: "FeatureCollection", features: arcs.map((c) => ({ type: "Feature" as const, geometry: { type: "LineString" as const, coordinates: c }, properties: {} })) } });
      map.addLayer({ id: lyr, type: "line", source: src, paint: { "line-color": "#38bdf8", "line-width": 1.5, "line-opacity": 0.45 } });
      const boats = arcs.map((arc) => { const el = document.createElement("div"); el.style.cssText = "width:7px;height:7px;border-radius:50%;background:white;box-shadow:0 0 5px rgba(255,255,255,0.5);"; return new maplibregl.Marker({ element: el }).setLngLat(arc[0]).addTo(map); });
      const DUR = 8000, TICK = 50; let el = 0;
      const iv = setInterval(() => { el = (el + TICK) % DUR; const p = el / DUR; boats.forEach((b, i) => { const arc = arcs[i]; b.setLngLat(arc[Math.floor(p * (arc.length - 1))]); }); }, TICK);
      return () => { clearInterval(iv); boats.forEach((b) => b.remove()); if (map.getLayer(lyr)) map.removeLayer(lyr); if (map.getSource(src)) map.removeSource(src); };
    },
  },
  {
    label: "Population density — EU",
    center: [10, 52],
    zoom: 4,
    render: (map) => {
      const cities = [{ l: [2.35, 48.86] as [number, number], s: 40 }, { l: [13.4, 52.52] as [number, number], s: 34 }, { l: [-0.12, 51.51] as [number, number], s: 44 }, { l: [12.5, 41.9] as [number, number], s: 28 }, { l: [-3.7, 40.42] as [number, number], s: 30 }, { l: [4.9, 52.37] as [number, number], s: 20 }, { l: [21.0, 52.23] as [number, number], s: 22 }, { l: [16.37, 48.21] as [number, number], s: 22 }, { l: [18.07, 59.33] as [number, number], s: 18 }];
      const markers = cities.map(({ l, s }) => new maplibregl.Marker({ element: createCircleMarker("#a855f7", s) }).setLngLat(l).addTo(map));
      return () => markers.forEach((m) => m.remove());
    },
  },
];

// ─── Style preferences ───────────────────────────────────────

interface StylePrefs {
  scheme: string;
  classes: number;
}

const SCHEME_OPTIONS: { key: string; label: string; stops: string[] }[] = [
  { key: "blues",   label: "Blue",    stops: ["#eff3ff", "#6baed6", "#084594"] },
  { key: "viridis", label: "Viridis", stops: ["#440154", "#21918c", "#fde725"] },
  { key: "greens",  label: "Green",   stops: ["#edf8e9", "#41ab5d", "#005a32"] },
  { key: "plasma",  label: "Plasma",  stops: ["#0d0887", "#cb4679", "#f0f921"] },
  { key: "blue-red",label: "Diverge", stops: ["#2166ac", "#f7f7f7", "#b2182b"] },
];

const DEFAULT_PREFS: StylePrefs = { scheme: "blues", classes: 5 };

// ─── Prompt chips ────────────────────────────────────────────

const CHIPS = [
  "GDP per capita, Europe",
  "Earthquake activity, Japan",
  "Coffee shop density, Stockholm",
  "Migration flows, 2023",
];

// ─── Pipeline stage labels ───────────────────────────────────

const PIPELINE_STAGES = [
  { key: "searching",  label: "Searching data sources" },
  { key: "matching",   label: "Matching geometry"       },
  { key: "joining",    label: "Joining statistics"      },
  { key: "compiling",  label: "Compiling map"           },
  { key: "rendering",  label: "Rendering"               },
] as const;

type PipelineStageKey = typeof PIPELINE_STAGES[number]["key"];

// ─── Typewriter helper ───────────────────────────────────────

function typeIntoInput(
  text: string,
  setter: (v: string) => void,
  onDone: () => void,
  intervalMs = 12,
): () => void {
  let i = 0;
  setter("");
  const id = setInterval(() => {
    i++;
    setter(text.slice(0, i));
    if (i >= text.length) { clearInterval(id); onDone(); }
  }, intervalMs);
  return () => clearInterval(id);
}

// ─── Map rendering helper ────────────────────────────────────
// Applies a generated MapManifest to the existing MapLibre instance.
// Returns a cleanup function.

function applyManifestToMap(
  map: maplibregl.Map,
  manifest: MapManifest,
  geojson: GeoJSON.FeatureCollection,
): () => void {
  const layer = manifest.layers[0];
  if (!layer) return () => {};

  const sourceId = "landing-result-source";
  const layerIds: string[] = [];

  // All pending timers — cancelled on cleanup so they never fire into a dead map
  const timers: ReturnType<typeof setTimeout>[] = [];
  const intervals: ReturnType<typeof setInterval>[] = [];

  // Safe helpers — no-ops if the map has already been removed
  const safeGetLayer = (id: string) => {
    try { return map.getLayer(id); } catch { return undefined; }
  };
  const safeGetSource = (id: string) => {
    try { return map.getSource(id); } catch { return undefined; }
  };
  const safeSetPaint = (id: string, prop: string, val: unknown) => {
    try { if (safeGetLayer(id)) map.setPaintProperty(id, prop, val); } catch { /* map gone */ }
  };

  // ── Camera fit ──────────────────────────────────────────────
  // Stop any in-progress demo flyTo, then fit to data bounds after a short
  // delay so the darkening overlay animation has started first.
  if (geojson.features.length > 0) {
    try { map.stop(); } catch { /* non-fatal */ }
    const cameraTimer = setTimeout(() => {
      try {
        const coords: [number, number][] = [];
        geojson.features.forEach((f) => {
          if (!f.geometry) return;
          const g = f.geometry as { type: string; coordinates: unknown };
          if (g.type === "Point") {
            coords.push(g.coordinates as [number, number]);
          } else if (g.type === "MultiPoint" || g.type === "LineString") {
            (g.coordinates as [number, number][]).forEach((c) => coords.push(c));
          } else if (g.type === "Polygon") {
            ((g.coordinates as [number, number][][])[0] ?? []).forEach((c) => coords.push(c));
          } else if (g.type === "MultiPolygon") {
            (g.coordinates as [number, number][][][]).forEach((poly) => (poly[0] ?? []).forEach((c) => coords.push(c)));
          }
        });
        if (coords.length > 0) {
          const lngs = coords.map((c) => c[0]);
          const lats = coords.map((c) => c[1]);
          map.fitBounds(
            [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
            { padding: 100, duration: 1800, essential: true },
          );
        }
      } catch { /* non-fatal */ }
    }, 400);
    timers.push(cameraTimer);
  }

  const family = layer.style.mapFamily;

  // ── Phase 1: geometry outlines ───────────────────────────────
  // Polygon families get white outlines that fade in immediately, revealing
  // the shape of the data before the colour fill appears.
  const outlineId = "landing-result-outline";
  if (family === "choropleth" || family === "proportional-symbol" || family === "isochrone") {
    // Tag each feature with a numeric id so setFeatureState works
    const taggedFeatures = geojson.features.map((f, i) => ({ ...f, id: i }));
    const taggedGeojson = { ...geojson, features: taggedFeatures };

    try {
      map.addSource(sourceId, { type: "geojson", data: taggedGeojson, promoteId: undefined });
    } catch { return () => {}; }

    try {
      map.addLayer({
        id: outlineId,
        type: "line",
        source: sourceId,
        paint: { "line-color": "rgba(255,255,255,0.25)", "line-width": 0.75, "line-opacity": 0 },
      });
      layerIds.push(outlineId);
      let op = 0;
      const fadeOutline = setInterval(() => {
        op = Math.min(op + 0.05, 1);
        safeSetPaint(outlineId, "line-opacity", op);
        if (op >= 1) clearInterval(fadeOutline);
      }, 30);
      intervals.push(fadeOutline);
    } catch { /* non-fatal */ }

    // ── Phase 2: staggered choropleth fill (land-for-land wave) ──
    // Each feature fades in individually with 90ms stagger, total ~2-3s.
    const fillTimer = setTimeout(() => {
      if (!safeGetSource(sourceId)) return;
      const fillLayerId = "landing-result-fill";
      const colorProp = layer.style.colorField ?? "";
      const colorScheme = layer.style.color?.scheme ?? "viridis";
      const classCount = layer.style.classification?.classes ?? 5;
      const classMethod = layer.style.classification?.method ?? "quantile";
      const fillOpacity = layer.style.fillOpacity ?? 0.85;

      // Extract numeric values — same as compiler's numericValues()
      const values: number[] = [];
      geojson.features.forEach((f) => {
        const v = f.properties?.[colorProp];
        if (typeof v === "number" && isFinite(v)) values.push(v);
      });

      let fillColor: unknown = "#2196d8";
      if (values.length > 0 && colorProp) {
        const breaks = classify(values, classMethod, classCount);
        const palette = getColors(colorScheme, classCount);
        const expr: unknown[] = ["step", ["get", colorProp], palette[0]];
        breaks.breaks.forEach((b, i) => {
          expr.push(b);
          expr.push(palette[Math.min(i + 1, palette.length - 1)]);
        });
        fillColor = expr;
      }

      try {
        map.addLayer({
          id: fillLayerId,
          type: "fill",
          source: sourceId,
          paint: {
            // Use feature-state "op" to drive per-feature opacity
            "fill-opacity": ["coalesce", ["feature-state", "op"], 0] as unknown as maplibregl.ExpressionSpecification,
            "fill-color": fillColor as maplibregl.ExpressionSpecification,
          },
        });
        layerIds.push(fillLayerId);
      } catch { return; }

      // Stagger: reveal each feature after (index * STAGGER_MS) delay
      // Cap total duration to ~2.5s regardless of feature count.
      const STAGGER_MS = 90;
      const maxFeatures = taggedFeatures.length;
      const cappedStagger = maxFeatures > 28 ? Math.round(2400 / maxFeatures) : STAGGER_MS;

      taggedFeatures.forEach((f, i) => {
        const t = setTimeout(() => {
          // Animate this feature's opacity from 0 → fillOpacity over 400ms
          let op = 0;
          const step = fillOpacity / 20; // 20 frames × 20ms = 400ms per feature
          const iv = setInterval(() => {
            op = Math.min(op + step, fillOpacity);
            try { map.setFeatureState({ source: sourceId, id: f.id }, { op }); } catch { /* map gone */ }
            if (op >= fillOpacity) clearInterval(iv);
          }, 20);
          intervals.push(iv);
        }, i * cappedStagger);
        timers.push(t);
      });

    }, 700);
    timers.push(fillTimer);

  } else {
    // Non-choropleth families — add source normally (no feature IDs needed)
    try { map.addSource(sourceId, { type: "geojson", data: geojson }); } catch { return () => {}; }

    const fillTimer = setTimeout(() => {
      if (!safeGetSource(sourceId)) return;
      let fillLayerId = "landing-result-fill";

      try {
        if (family === "heatmap") {
          fillLayerId = "landing-result-heat";
          map.addLayer({
            id: fillLayerId,
            type: "heatmap",
            source: sourceId,
            paint: {
              "heatmap-intensity": 1.5,
              "heatmap-radius": 30,
              "heatmap-opacity": 0,
              "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"],
                0, "rgba(0,0,0,0)", 0.2, "#1d6fa5", 0.5, "#2196d8", 0.8, "#64c4f0", 1, "#b3e6ff"],
            },
          });
          let op = 0;
          const fadeFill = setInterval(() => {
            op = Math.min(op + 0.025, 0.85);
            safeSetPaint(fillLayerId, "heatmap-opacity", op);
            if (op >= 0.85) clearInterval(fadeFill);
          }, 20);
          intervals.push(fadeFill);

        } else if (family === "point" || family === "cluster") {
          fillLayerId = "landing-result-circle";
          map.addLayer({
            id: fillLayerId,
            type: "circle",
            source: sourceId,
            paint: {
              "circle-radius": 5,
              "circle-color": "#4F8EF7",
              "circle-opacity": 0,
              "circle-stroke-width": 1,
              "circle-stroke-color": "rgba(255,255,255,0.3)",
            },
          });
          let op = 0;
          const fadeFill = setInterval(() => {
            op = Math.min(op + 0.025, 0.85);
            safeSetPaint(fillLayerId, "circle-opacity", op);
            if (op >= 0.85) clearInterval(fadeFill);
          }, 20);
          intervals.push(fadeFill);

        } else {
          // flow / proportional-symbol / fallback — line
          fillLayerId = "landing-result-line";
          map.addLayer({
            id: fillLayerId,
            type: "line",
            source: sourceId,
            paint: { "line-color": "#4F8EF7", "line-width": 2, "line-opacity": 0 },
          });
          let op = 0;
          const fadeFill = setInterval(() => {
            op = Math.min(op + 0.025, 0.85);
            safeSetPaint(fillLayerId, "line-opacity", op);
            if (op >= 0.85) clearInterval(fadeFill);
          }, 20);
          intervals.push(fadeFill);
        }
      } catch { return; /* addLayer failed — map may be gone */ }

      layerIds.push(fillLayerId);
    }, 700);
    timers.push(fillTimer);
  }

  return () => {
    // Cancel all pending timers first so nothing fires after cleanup
    timers.forEach(clearTimeout);
    intervals.forEach(clearInterval);
    // Remove layers/source — wrapped in try/catch in case map was already destroyed
    try {
      [...layerIds].reverse().forEach((id) => { if (safeGetLayer(id)) map.removeLayer(id); });
      if (safeGetSource(sourceId)) map.removeSource(sourceId);
    } catch { /* map already removed — nothing to do */ }
  };
}

// ─── Component ───────────────────────────────────────────────

type HeroStage =
  | "idle"         // normal hero
  | "departing"    // chrome fading out
  | "searching"    // clarify API call
  | "generating"   // generate-map API call
  | "fetching"     // fetching GeoJSON
  | "rendering"    // applying layers to map
  | "done"         // map visible, edit nudge shown
  | "editing"      // editor chrome folded in — no navigation
  | "error";       // something failed

// Editor legend colour item
interface LegendEntry {
  color: string;
  label: string;
}

export default function Landing() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const sceneCleanupRef = useRef<(() => void) | null>(null);
  const resultCleanupRef = useRef<(() => void) | null>(null);
  const rotationRef = useRef<number | null>(null);
  const typewriterRef = useRef<(() => void) | null>(null);
  const autoSubmitRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sceneIndex, setSceneIndex] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  // Detect mobile on mount — used to suppress autoFocus (prevents keyboard pop-up)
  // and reduce chip count. SSR-safe: defaults false, set after hydration.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => { setIsMobile(window.innerWidth < 768); }, []);

  // Auth state — loaded once on mount, drives nav + save button
  const [user, setUser] = useState<User | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedMapId, setSavedMapId] = useState<string | null>(null);
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Generation state
  const [heroStage, setHeroStage] = useState<HeroStage>("idle");
  const [pipelineStage, setPipelineStage] = useState<PipelineStageKey>("searching");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generatedManifest, setGeneratedManifest] = useState<MapManifest | null>(null);
  const [generatedGeojson, setGeneratedGeojson] = useState<GeoJSON.FeatureCollection | null>(null);

  // Editor state (in-place, no navigation)
  const [editorVisible, setEditorVisible] = useState(false);
  const [legendEntries, setLegendEntries] = useState<LegendEntry[]>([]);

  // Style preferences chosen during the generation loading phase.
  // stylePrefsRef mirrors state so runPipeline (async) always reads the latest value.
  const [stylePrefs, setStylePrefs] = useState<StylePrefs>(DEFAULT_PREFS);
  const stylePrefsRef = useRef<StylePrefs>(DEFAULT_PREFS);
  const updateStylePrefs = useCallback((patch: Partial<StylePrefs>) => {
    setStylePrefs((prev) => {
      const next = { ...prev, ...patch };
      stylePrefsRef.current = next;
      return next;
    });
  }, []);

  // Scroll detection
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Init map
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    fetch(STYLE_URL)
      .then((r) => { if (!r.ok) throw new Error("style fetch failed"); return r.json() as Promise<maplibregl.StyleSpecification>; })
      .then((json) => {
        if (cancelled || !containerRef.current) return;
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: quietBasemap(json),
          center: SCENES[0].center,
          zoom: SCENES[0].zoom,
          pitch: 0,
          attributionControl: false,
          interactive: false,
          pixelRatio: window.devicePixelRatio,
        });
        mapRef.current = map;
        map.once("idle", () => { if (!cancelled) setMapReady(true); });
      })
      .catch(() => { /* map unavailable — page still usable */ });

    return () => {
      cancelled = true;
      // Clean up layers before destroying the map instance —
      // layer cleanup functions call map.getLayer() which throws on a removed map.
      sceneCleanupRef.current?.();
      sceneCleanupRef.current = null;
      resultCleanupRef.current?.();
      resultCleanupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Slow bearing rotation (idle only)
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;
    const rotate = () => {
      map.setBearing((map.getBearing() + 0.015) % 360);
      rotationRef.current = requestAnimationFrame(rotate);
    };
    rotationRef.current = requestAnimationFrame(rotate);
    return () => { if (rotationRef.current) cancelAnimationFrame(rotationRef.current); };
  }, [mapReady]);

  // Stop rotation when generating
  useEffect(() => {
    if (heroStage !== "idle" && rotationRef.current) {
      cancelAnimationFrame(rotationRef.current);
      rotationRef.current = null;
    }
  }, [heroStage]);

  // Scene cycling (idle only)
  useEffect(() => {
    if (!mapReady || heroStage !== "idle") return;
    const iv = setInterval(() => setSceneIndex((p) => (p + 1) % SCENES.length), 7000);
    return () => clearInterval(iv);
  }, [mapReady, heroStage]);

  // Apply scene
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || heroStage !== "idle") return;

    const scene = SCENES[sceneIndex];
    sceneCleanupRef.current?.();
    sceneCleanupRef.current = null;

    const cur = map.getCenter();
    const alreadyThere = Math.abs(cur.lng - scene.center[0]) < 0.1 && Math.abs(cur.lat - scene.center[1]) < 0.1;

    if (alreadyThere) {
      sceneCleanupRef.current = scene.render(map);
      return;
    }

    map.flyTo({ center: scene.center, zoom: scene.zoom, duration: 2800, essential: true, easing: (t) => t * (2 - t) });
    let cancelled = false;
    const onEnd = () => { if (!cancelled && mapRef.current) sceneCleanupRef.current = scene.render(mapRef.current); };
    map.once("moveend", onEnd);
    return () => { cancelled = true; map.off("moveend", onEnd); };
  }, [sceneIndex, mapReady, heroStage]);

  // ── Build legend entries when manifest + geojson are ready ──
  useEffect(() => {
    if (!generatedManifest || !generatedGeojson) return;
    const layer = generatedManifest.layers[0];
    if (!layer) return;

    const colorProp = layer.style.colorField ?? "";
    const colorScheme = layer.style.color?.scheme ?? "viridis";
    const classCount = layer.style.classification?.classes ?? 5;
    const classMethod = layer.style.classification?.method ?? "quantile";

    const values: number[] = [];
    generatedGeojson.features.forEach((f) => {
      const v = f.properties?.[colorProp];
      if (typeof v === "number" && isFinite(v)) values.push(v);
    });

    if (values.length === 0 || !colorProp) {
      setLegendEntries([]);
      return;
    }

    const breaks = classify(values, classMethod, classCount);
    const palette = getColors(colorScheme, classCount);
    const entries: LegendEntry[] = palette.map((color, i) => {
      const lo = i === 0 ? Math.min(...values) : breaks.breaks[i - 1];
      const hi = i < breaks.breaks.length ? breaks.breaks[i] : Math.max(...values);
      const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n.toFixed(0);
      return { color, label: `${fmt(lo)} – ${fmt(hi)}` };
    });
    setLegendEntries(entries);
  }, [generatedManifest, generatedGeojson]);

  // ── Pipeline ────────────────────────────────────────────────

  const runPipeline = useCallback(async (promptText: string) => {
    const map = mapRef.current;
    if (!map) return;

    // Clear demo scene
    sceneCleanupRef.current?.();
    sceneCleanupRef.current = null;

    try {
      // Stage 1: Clarify
      setPipelineStage("searching");
      const clarifyRes = await fetch("/api/ai/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText }),
      });
      if (!clarifyRes.ok) throw new Error("Data search failed");
      const clarifyData: ClarifyResponse = await clarifyRes.json();

      const action = decideClarifyAction(clarifyData, promptText);

      if (action.kind === "tabular_warning" || action.kind === "ask_questions") {
        // Can't auto-generate — route to create page for user input
        router.push(`/create?prompt=${encodeURIComponent(promptText)}`);
        return;
      }
      if (action.kind === "auto_answer") {
        // Re-run clarify with auto answers — route to create for simplicity
        router.push(`/create?prompt=${encodeURIComponent(promptText)}`);
        return;
      }

      // action.kind === "generate"
      const { resolvedPrompt, dataUrl, dataProfile } = action;

      // Stage 2: Generate manifest
      setPipelineStage("matching");
      setHeroStage("generating");

      const generateRes = await fetch("/api/ai/generate-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: resolvedPrompt,
          ...(dataUrl ? { sourceUrl: dataUrl, dataUrl } : {}),
          ...(dataProfile ? { dataProfile } : {}),
        }),
      });
      if (!generateRes.ok) throw new Error("Map generation failed");
      const generateData = await generateRes.json();
      const manifest: MapManifest = generateData.manifest;
      if (!manifest) throw new Error("No manifest returned");

      // Apply user's style preferences chosen during the loading phase.
      const currentPrefs = stylePrefsRef.current;
      const layer0 = manifest.layers[0];
      if (layer0?.style) {
        const s = layer0.style;
        // Only override colour for polygon/data-driven families
        if (s.mapFamily === "choropleth" || s.mapFamily === "isochrone" || s.mapFamily === "proportional-symbol") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          s.color = { ...(s.color ?? {} as any), scheme: currentPrefs.scheme, colorblindSafe: true };
          s.classification = { method: s.classification?.method ?? "quantile", classes: currentPrefs.classes };
        }
      }

      setGeneratedManifest(manifest);

      // Stage 3: Fetch GeoJSON
      setPipelineStage("joining");
      const sourceUrl = dataUrl ?? manifest.layers[0]?.sourceUrl;
      if (!sourceUrl) throw new Error("No data source URL");

      const geoRes = await fetch(sourceUrl);
      if (!geoRes.ok) throw new Error("Failed to fetch map data");
      const geojson: GeoJSON.FeatureCollection = await geoRes.json();
      if (!geojson?.features) throw new Error("Invalid GeoJSON");

      setGeneratedGeojson(geojson);

      // Stage 4: Render layer by layer on the existing map
      setPipelineStage("rendering");
      setHeroStage("rendering");

      const cleanup = applyManifestToMap(map, manifest, geojson);
      resultCleanupRef.current = cleanup;

      // Stash result so the editor can open without re-generating
      try {
        sessionStorage.setItem(
          "atlas:landing-result",
          JSON.stringify({ manifest, geojson, prompt: promptText }),
        );
      } catch { /* storage unavailable — editor will re-run pipeline */ }

      // Wait for outlines (700ms) + staggered fill wave to complete.
      // Max stagger at 90ms × 30 features = 2700ms + 400ms fade = ~3.1s.
      // We wait 2400ms which catches most datasets and feels snappy.
      await new Promise((r) => setTimeout(r, 2400));

      setHeroStage("done");

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setErrorMsg(msg);
      setHeroStage("error");
    }
  }, [router]);

  // ── Submit ──────────────────────────────────────────────────

  const handleSubmit = useCallback(
    (overridePrompt?: string) => {
      const trimmed = (overridePrompt ?? prompt).trim();
      if (!trimmed || heroStage !== "idle") return;

      setHeroStage("departing");
      setPipelineStage("searching");
      setErrorMsg(null);

      // Start pipeline after departure animation completes
      setTimeout(() => {
        setHeroStage("searching");
        runPipeline(trimmed);
      }, 500);
    },
    [prompt, heroStage, runPipeline],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        typewriterRef.current?.();
        autoSubmitRef.current && clearTimeout(autoSubmitRef.current);
        setIsTyping(false);
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleChipClick = useCallback(
    (text: string) => {
      if (heroStage !== "idle") return;
      typewriterRef.current?.();
      autoSubmitRef.current && clearTimeout(autoSubmitRef.current);
      setIsTyping(true);

      typewriterRef.current = typeIntoInput(text, setPrompt, () => {
        setIsTyping(false);
        autoSubmitRef.current = setTimeout(() => handleSubmit(text), 500);
      });
    },
    [heroStage, handleSubmit],
  );

  // ── Save map to DB ──────────────────────────────────────────
  const handleSaveMap = useCallback(async () => {
    if (!generatedManifest || !prompt.trim()) return;
    if (!user) { window.location.href = `/login?redirect=/dashboard`; return; }

    setSaveState("saving");
    try {
      const body = {
        title: generatedManifest.title ?? prompt.trim().slice(0, 60),
        prompt: prompt.trim(),
        manifest: generatedManifest as unknown as Record<string, unknown>,
        geojson_url: generatedManifest.layers[0]?.sourceUrl ?? null,
        is_public: false,
      };
      const res = await fetch("/api/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Save failed");
      const json = await res.json();
      setSavedMapId(json.map?.id ?? null);
      setSaveState("saved");
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    }
  }, [generatedManifest, prompt, user]);

  const handleReset = useCallback(() => {
    resultCleanupRef.current?.();
    resultCleanupRef.current = null;
    setHeroStage("idle");
    setPrompt("");
    setErrorMsg(null);
    setGeneratedManifest(null);
    setGeneratedGeojson(null);
    setLegendEntries([]);
    setEditorVisible(false);
    setSaveState("idle");
    setSavedMapId(null);
    setPipelineStage("searching");
    updateStylePrefs(DEFAULT_PREFS);
    // Restart scene cycling
    setSceneIndex(0);
    // Re-enable map interaction for editor mode
    mapRef.current?.dragPan.disable();
  }, [updateStylePrefs]);

  // ── Open editor in-place (no navigation) ────────────────────
  // The map stays mounted. Editor chrome slides in on top of it.
  // URL is updated for bookmarkability but no page reload occurs.
  const handleOpenEditor = useCallback(() => {
    if (!generatedManifest) return;
    // Enable map interaction so the user can pan/zoom inside the editor
    try {
      mapRef.current?.dragPan.enable();
      mapRef.current?.scrollZoom.enable();
      mapRef.current?.doubleClickZoom.enable();
      mapRef.current?.touchZoomRotate.enable();
    } catch { /* non-fatal */ }
    setHeroStage("editing");
    // Delay the panel slide-in by one frame so the state transition paints first
    requestAnimationFrame(() => setEditorVisible(true));
    // Update URL without navigation so the address is shareable
    const encoded = encodeURIComponent(prompt.trim());
    window.history.pushState(null, "", `/create?prompt=${encoded}`);
  }, [generatedManifest, prompt]);

  // ── Close editor — back to done state ───────────────────────
  const handleCloseEditor = useCallback(() => {
    setEditorVisible(false);
    // Disable map interaction again (landing map is passive)
    try {
      mapRef.current?.dragPan.disable();
      mapRef.current?.scrollZoom.disable();
      mapRef.current?.doubleClickZoom.disable();
      mapRef.current?.touchZoomRotate.disable();
    } catch { /* non-fatal */ }
    setTimeout(() => {
      setHeroStage("done");
      window.history.pushState(null, "", "/");
    }, 320);
  }, []);

  // ── Go to full editor (from editor panel) ───────────────────
  const handleGoToFullEditor = useCallback(() => {
    const encoded = encodeURIComponent(prompt.trim());
    // Exit curtain + navigate
    setHeroStage("editing"); // keep editing visuals while we leave
    window.location.href = `/create?prompt=${encoded}`;
  }, [prompt]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      typewriterRef.current?.();
      autoSubmitRef.current && clearTimeout(autoSubmitRef.current);
      resultCleanupRef.current?.();
    };
  }, []);

  // ── Derived ─────────────────────────────────────────────────

  const currentLabel = SCENES[sceneIndex].label;
  const hasInput = prompt.trim().length > 0;
  const isActive = heroStage !== "idle";
  // "rendering" and "done" excluded — overlay lifts during those stages
  const isGenerating = heroStage === "searching" || heroStage === "generating" || heroStage === "fetching";
  const isRendering = heroStage === "rendering";
  const isEditing = heroStage === "editing";

  const currentStageLabel = PIPELINE_STAGES.find((s) => s.key === pipelineStage)?.label ?? "";

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-[#0a0d14]">
      <style>{`
        @keyframes landing-pulse { 0%,100%{transform:scale(1);opacity:.8} 50%{transform:scale(1.5);opacity:.25} }
        @keyframes chevron-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(4px)} }
        @keyframes fade-up { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes status-swap { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes save-slide { from{transform:translateY(52px)} to{transform:translateY(0)} }
        @keyframes editor-slide-in { from{transform:translateX(-100%)} to{transform:translateX(0)} }
        @keyframes editor-slide-out { from{transform:translateX(0)} to{transform:translateX(-100%)} }
        .animate-fade-up        { animation: fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both }
        .animate-fade-up-d1     { animation: fade-up 0.5s 0.08s cubic-bezier(0.16,1,0.3,1) both }
        .animate-fade-up-d2     { animation: fade-up 0.5s 0.16s cubic-bezier(0.16,1,0.3,1) both }
        .chevron-bounce         { animation: chevron-bounce 2s ease-in-out infinite }
        .status-text            { animation: status-swap 0.25s ease both }
        .spin-slow              { animation: spin 1.5s linear infinite }
        .save-slide             { animation: save-slide 0.3s cubic-bezier(0.4,0,0.2,1) both }
        .editor-panel-in        { animation: editor-slide-in 0.36s cubic-bezier(0.16,1,0.3,1) both }
        .editor-panel-out       { animation: editor-slide-out 0.28s cubic-bezier(0.4,0,1,1) both }
        input::placeholder      { color: rgba(248,249,251,0.38) }
      `}</style>

      {/* ── Layer 1: Map ── */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0, zIndex: 0 }} />

      {/* ── Layer 2: Overlays ── */}

      {/* Idle bottom vignette — fades out when pipeline starts */}
      <div className="absolute inset-0 pointer-events-none" style={{
        zIndex: 1,
        transition: "opacity 600ms ease",
        opacity: heroStage === "idle" ? 1 : 0,
        background: "linear-gradient(to top,rgba(10,13,20,.90) 0%,rgba(10,13,20,.55) 35%,rgba(10,13,20,.15) 60%,transparent 100%)",
      }} />

      {/* Generation blackout — fades in when pipeline starts, stays dark while generating */}
      <div className="absolute inset-0 pointer-events-none" style={{
        zIndex: 1,
        transition: "opacity 500ms ease",
        opacity: isGenerating ? 0.88 : 0,
        background: "rgba(10,13,20,1)",
      }} />

      {/* Rendering veil — lighter scrim that lifts as the map reveals (rendering → done) */}
      <div className="absolute inset-0 pointer-events-none" style={{
        zIndex: 1,
        transition: isRendering ? "opacity 1200ms ease" : "opacity 2000ms cubic-bezier(0.4,0,0.2,1)",
        opacity: isRendering ? 0.60 : (heroStage === "done" || isEditing) ? 0.25 : 0,
        background: "rgba(10,13,20,1)",
      }} />

      {/* Top bar fade — always present */}
      <div className="absolute inset-x-0 top-0 pointer-events-none" style={{
        zIndex: 1,
        height: 120,
        background: "linear-gradient(to bottom,rgba(10,13,20,.65) 0%,transparent 100%)",
      }} />

      {/* ── Layer 3: Idle nav ── */}
      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-4 sm:px-6 md:px-8"
        style={{ zIndex: 2, height: isMobile ? 56 : 64, transition: "opacity 300ms ease", opacity: heroStage === "idle" ? 1 : 0, pointerEvents: heroStage === "idle" ? "auto" : "none" }}>
        <span className="text-[18px] font-medium tracking-[-0.01em] text-[#F8F9FB]" style={{ fontFamily: "'Geist',sans-serif" }}>atlas</span>
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <a href="/dashboard" style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, fontWeight: 400, color: "rgba(248,249,251,0.55)", textDecoration: "none", transition: "color 150ms ease" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(248,249,251,0.85)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(248,249,251,0.55)"; }}>
                Mina kartor
              </a>
            </>
          ) : (
            <a href="/login" style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, fontWeight: 400, color: "rgba(248,249,251,0.55)", textDecoration: "none", transition: "color 150ms ease" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(248,249,251,0.85)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(248,249,251,0.55)"; }}>
              Logga in
            </a>
          )}
          <button type="button" className="text-[14px] font-medium text-white px-4 py-2 rounded-lg transition-colors duration-150" style={{ fontFamily: "'Geist',sans-serif", background: "#1D4ED8" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#2563EB"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#1D4ED8"; }}>
            Start →
          </button>
        </div>
      </header>

      {/* ── Layer 3: Active top bar ── */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 sm:px-6"
        style={{ zIndex: 3, height: 56, background: "rgba(10,13,20,0.92)", borderBottom: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)", transition: "transform 400ms cubic-bezier(0.4,0,0.2,1), opacity 400ms ease", transform: (isActive && !isEditing) ? "translateY(0)" : "translateY(-100%)", opacity: (isActive && !isEditing) ? 1 : 0, pointerEvents: (isActive && !isEditing) ? "auto" : "none" }}>
        {/* Logo */}
        <span className="text-[14px] font-medium shrink-0" style={{ fontFamily: "'Geist',sans-serif", color: "rgba(248,249,251,0.40)" }}>atlas</span>

        {/* Prompt — constrained so it never overlaps logo or right buttons */}
        <span className="absolute left-1/2 -translate-x-1/2 truncate text-center text-[13px] sm:text-[14px]" style={{ fontFamily: "'Geist',sans-serif", fontWeight: 400, color: "rgba(248,249,251,0.70)", maxWidth: "min(480px, calc(100vw - 160px))" }}>{prompt}</span>

        {/* Right: status or done actions */}
        <div className="flex items-center gap-3 shrink-0">
          {(isGenerating || isRendering) && (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="spin-slow" style={{ opacity: isRendering ? 0.4 : 1, transition: "opacity 600ms ease" }}>
                <circle cx="12" cy="12" r="10" stroke="rgba(248,249,251,0.12)" strokeWidth="2.5" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="#4F8EF7" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <span key={pipelineStage} className="status-text text-[11px]" style={{ fontFamily: "'Geist Mono',monospace", color: "rgba(248,249,251,0.38)" }}>{currentStageLabel}</span>
            </>
          )}
          {heroStage === "done" && (
            <>
              <button onClick={handleReset} className="text-[12px] transition-colors duration-150" style={{ fontFamily: "'Geist',sans-serif", color: "rgba(248,249,251,0.40)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,249,251,0.70)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,249,251,0.40)"; }}>
                New map
              </button>
            </>
          )}
          {heroStage === "error" && (
            <button onClick={handleReset} className="text-[12px]" style={{ fontFamily: "'Geist Mono',monospace", color: "#C94F4F" }}>
              Try again
            </button>
          )}
        </div>
      </div>

      {/* ── Layer 4: Hero content (idle) ── */}
      <div className="absolute inset-x-0 flex flex-col items-center"
        style={{ zIndex: 2, top: "50%", transform: "translateY(-42%)", transition: "opacity 400ms ease", opacity: heroStage === "idle" ? 1 : 0, pointerEvents: heroStage === "idle" ? "auto" : "none" }}>

        <h1 className="animate-fade-up text-center text-[#F8F9FB] select-none"
          style={{ fontFamily: "'Geist',sans-serif", fontSize: "clamp(28px,5vw,54px)", fontWeight: 500, lineHeight: 1.1, letterSpacing: "-0.03em", marginBottom: "clamp(16px,3vw,32px)" }}>
          Make maps worth publishing.
        </h1>

        {/* Input — max-width capped at 600px on desktop, full-width on mobile */}
        <div className="animate-fade-up-d1 w-full max-w-[600px] px-4">
          <div className="relative flex items-center"
            style={{ height: 56, background: "rgba(12,14,18,0.55)", border: inputFocused ? "1px solid rgba(255,255,255,0.30)" : "1px solid rgba(255,255,255,0.14)", borderRadius: 14, backdropFilter: "blur(12px)", transition: "border-color 150ms ease" }}>
            <input
              type="text"
              value={prompt}
              onChange={(e) => { typewriterRef.current?.(); autoSubmitRef.current && clearTimeout(autoSubmitRef.current); setIsTyping(false); setPrompt(e.target.value); }}
              onKeyDown={handleKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Describe a map..."
              autoFocus={!isMobile}
              disabled={heroStage !== "idle"}
              className="flex-1 bg-transparent outline-none"
              style={{ fontFamily: "'Geist',sans-serif", fontSize: 17, fontWeight: 400, color: "#F8F9FB", paddingLeft: 20, paddingRight: hasInput ? 56 : 20 }}
            />
            <button type="button" onClick={() => { typewriterRef.current?.(); autoSubmitRef.current && clearTimeout(autoSubmitRef.current); setIsTyping(false); handleSubmit(); }} aria-label="Generate map"
              className="absolute right-3 flex items-center justify-center rounded-[9px] transition-opacity duration-150"
              style={{ width: 32, height: 32, background: "#1D4ED8", opacity: hasInput ? 1 : 0, pointerEvents: hasInput ? "auto" : "none" }}>
              {isTyping
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="spin-slow"><circle cx="12" cy="12" r="10" stroke="white" strokeWidth="2.5" strokeOpacity="0.25" /><path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" /></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              }
            </button>
          </div>
        </div>

        {/* Chips — 2 on mobile, 4 on desktop; same max-width cap as input */}
        <div className="animate-fade-up-d2 flex flex-wrap justify-center gap-2 mt-4 px-4 max-w-[600px]">
          {CHIPS.slice(0, isMobile ? 2 : 4).map((chip) => (
            <button key={chip} type="button" onClick={() => handleChipClick(chip)}
              className="transition-all duration-150"
              style={{ fontFamily: "'Geist',sans-serif", fontSize: 13, fontWeight: 400, color: "rgba(248,249,251,0.65)", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 14px", height: 36, lineHeight: 1, cursor: "pointer", whiteSpace: "nowrap" }}
              onMouseEnter={(e) => { const el = e.currentTarget; el.style.background = "rgba(255,255,255,0.13)"; el.style.color = "rgba(248,249,251,0.95)"; el.style.borderColor = "rgba(255,255,255,0.25)"; }}
              onMouseLeave={(e) => { const el = e.currentTarget; el.style.background = "rgba(255,255,255,0.07)"; el.style.color = "rgba(248,249,251,0.65)"; el.style.borderColor = "rgba(255,255,255,0.12)"; }}>
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* ── Style picker — visible while the AI is running ── */}
      {/* Shows during searching/generating so the dead time is productive.
          The chosen scheme + classes are applied to the manifest after it arrives. */}
      <div className="absolute inset-x-0 flex justify-center px-4"
        style={{ zIndex: 4, bottom: "max(48px, env(safe-area-inset-bottom, 48px))", transition: "opacity 350ms ease, transform 350ms cubic-bezier(0.16,1,0.3,1)", opacity: isGenerating ? 1 : 0, transform: isGenerating ? "translateY(0)" : "translateY(12px)", pointerEvents: isGenerating ? "auto" : "none" }}>
        <div style={{ background: "rgba(10,13,20,0.88)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 16, backdropFilter: "blur(16px)", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14, minWidth: "min(320px, calc(100vw - 32px))", maxWidth: "min(420px, calc(100vw - 32px))" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "'Geist',sans-serif", fontSize: 12, fontWeight: 500, color: "rgba(248,249,251,0.45)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Style while you wait</span>
            <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, color: "rgba(248,249,251,0.25)" }}>applied at render</span>
          </div>

          {/* Colour scheme swatches */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontFamily: "'Geist',sans-serif", fontSize: 11, color: "rgba(248,249,251,0.40)" }}>Colour scheme</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {SCHEME_OPTIONS.map((opt) => {
                const selected = stylePrefs.scheme === opt.key;
                return (
                  <button key={opt.key} type="button" onClick={() => updateStylePrefs({ scheme: opt.key })}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", padding: 0, opacity: selected ? 1 : 0.55, transition: "opacity 120ms ease" }}>
                    {/* Gradient swatch */}
                    <div style={{ width: 48, height: 10, borderRadius: 4, background: `linear-gradient(to right, ${opt.stops[0]}, ${opt.stops[1]}, ${opt.stops[2]})`, outline: selected ? "2px solid rgba(255,255,255,0.70)" : "2px solid transparent", outlineOffset: 2 }} />
                    <span style={{ fontFamily: "'Geist',sans-serif", fontSize: 10, color: selected ? "rgba(248,249,251,0.90)" : "rgba(248,249,251,0.45)" }}>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Class count */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontFamily: "'Geist',sans-serif", fontSize: 11, color: "rgba(248,249,251,0.40)" }}>Classes</span>
            <div style={{ display: "flex", gap: 6 }}>
              {[3, 4, 5, 6, 7].map((n) => {
                const selected = stylePrefs.classes === n;
                return (
                  <button key={n} type="button" onClick={() => updateStylePrefs({ classes: n })}
                    style={{ width: 32, height: 28, borderRadius: 7, border: selected ? "1px solid rgba(255,255,255,0.45)" : "1px solid rgba(255,255,255,0.12)", background: selected ? "rgba(255,255,255,0.12)" : "transparent", fontFamily: "'Geist',sans-serif", fontSize: 12, color: selected ? "rgba(248,249,251,0.95)" : "rgba(248,249,251,0.40)", cursor: "pointer", transition: "all 120ms ease" }}>
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Done: floating Edit CTA ── */}
      {/* Slides up from bottom-right when map finishes rendering.
          Replaces the old top-bar Edit button — more prominent, spatial context. */}
      <div className="absolute"
        style={{
          zIndex: 4,
          right: isMobile ? 16 : 32,
          bottom: isMobile ? "max(24px, env(safe-area-inset-bottom, 24px))" : "max(40px, env(safe-area-inset-bottom, 40px))",
          transition: "opacity 400ms ease, transform 400ms cubic-bezier(0.16,1,0.3,1)",
          opacity: heroStage === "done" ? 1 : 0,
          transform: heroStage === "done" ? "translateY(0) scale(1)" : "translateY(16px) scale(0.96)",
          pointerEvents: heroStage === "done" ? "auto" : "none",
        }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          {/* Map title chip */}
          {generatedManifest && (
            <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, color: "rgba(248,249,251,0.35)", letterSpacing: "0.04em", textAlign: "right", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {generatedManifest.title}
            </span>
          )}
          {/* Action row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={handleReset}
              style={{ fontFamily: "'Geist',sans-serif", fontSize: 13, color: "rgba(248,249,251,0.45)", background: "rgba(10,13,20,0.70)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: "8px 14px", backdropFilter: "blur(8px)", cursor: "pointer", transition: "color 150ms ease, background 150ms ease" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,249,251,0.75)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(10,13,20,0.85)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,249,251,0.45)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(10,13,20,0.70)"; }}>
              New map
            </button>
            <button
              type="button"
              onClick={handleOpenEditor}
              style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, fontWeight: 500, color: "#fff", background: "#1D4ED8", border: "none", borderRadius: 10, padding: "9px 20px", cursor: "pointer", boxShadow: "0 4px 20px rgba(29,78,216,0.45)", transition: "background 150ms ease, box-shadow 150ms ease" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#2563EB"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 24px rgba(37,99,235,0.55)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#1D4ED8"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 20px rgba(29,78,216,0.45)"; }}>
              Edit map →
            </button>
          </div>
        </div>
      </div>

      {/* ── Editor panel — slides in from left, no page navigation ── */}
      {/* Rendered whenever heroStage === "editing" so it can animate out too */}
      {(heroStage === "editing" || (heroStage === "done" && editorVisible)) && (
        <div
          className={editorVisible ? "editor-panel-in" : "editor-panel-out"}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            zIndex: 5,
            width: isMobile ? "100vw" : 320,
            background: "rgba(8,10,16,0.96)",
            borderRight: isMobile ? "none" : "1px solid rgba(255,255,255,0.07)",
            backdropFilter: "blur(20px)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}>

          {/* Panel header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: 56, borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
            <span style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, fontWeight: 500, color: "rgba(248,249,251,0.90)" }}>atlas</span>
            <button
              type="button"
              onClick={handleCloseEditor}
              aria-label="Close editor"
              style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 7, cursor: "pointer", color: "rgba(248,249,251,0.55)", transition: "background 120ms ease" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Panel body — scrollable */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>

            {/* Map title + description */}
            {generatedManifest && (
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontFamily: "'Geist',sans-serif", fontSize: 16, fontWeight: 500, color: "rgba(248,249,251,0.92)", marginBottom: 6, lineHeight: 1.3 }}>
                  {generatedManifest.title}
                </h2>
                {generatedManifest.description && (
                  <p style={{ fontFamily: "'Geist',sans-serif", fontSize: 13, color: "rgba(248,249,251,0.45)", lineHeight: 1.5 }}>
                    {generatedManifest.description}
                  </p>
                )}
              </div>
            )}

            {/* Legend */}
            {legendEntries.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <span style={{ fontFamily: "'Geist',sans-serif", fontSize: 11, fontWeight: 500, color: "rgba(248,249,251,0.35)", letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 10 }}>Legend</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {[...legendEntries].reverse().map((entry, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 28, height: 10, borderRadius: 3, background: entry.color, flexShrink: 0 }} />
                      <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: "rgba(248,249,251,0.55)" }}>{entry.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prompt display */}
            <div style={{ marginBottom: 24 }}>
              <span style={{ fontFamily: "'Geist',sans-serif", fontSize: 11, fontWeight: 500, color: "rgba(248,249,251,0.35)", letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Prompt</span>
              <p style={{ fontFamily: "'Geist',sans-serif", fontSize: 13, color: "rgba(248,249,251,0.60)", lineHeight: 1.5, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.07)" }}>
                {prompt}
              </p>
            </div>

            {/* Map family + layer info */}
            {generatedManifest?.layers[0] && (
              <div style={{ marginBottom: 24 }}>
                <span style={{ fontFamily: "'Geist',sans-serif", fontSize: 11, fontWeight: 500, color: "rgba(248,249,251,0.35)", letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Layer</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "'Geist',sans-serif", fontSize: 12, color: "rgba(248,249,251,0.40)" }}>Type</span>
                    <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "rgba(248,249,251,0.65)" }}>{generatedManifest.layers[0].style.mapFamily}</span>
                  </div>
                  {generatedManifest.layers[0].style.colorField && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontFamily: "'Geist',sans-serif", fontSize: 12, color: "rgba(248,249,251,0.40)" }}>Color field</span>
                      <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "rgba(248,249,251,0.65)" }}>{generatedManifest.layers[0].style.colorField}</span>
                    </div>
                  )}
                  {generatedGeojson && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontFamily: "'Geist',sans-serif", fontSize: 12, color: "rgba(248,249,251,0.40)" }}>Features</span>
                      <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "rgba(248,249,251,0.65)" }}>{generatedGeojson.features.length}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Panel footer — actions */}
          <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Save button — shows auth nudge if not logged in */}
            {saveState === "saved" && savedMapId ? (
              <a href="/dashboard"
                style={{ width: "100%", display: "block", textAlign: "center", fontFamily: "'Geist',sans-serif", fontSize: 14, fontWeight: 500, color: "#34d399", background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.25)", borderRadius: 10, padding: "11px 0", textDecoration: "none", transition: "background 150ms ease", boxSizing: "border-box" }}>
                ✓ Sparad — se i Mina kartor
              </a>
            ) : (
              <button
                type="button"
                onClick={handleSaveMap}
                disabled={saveState === "saving"}
                style={{ width: "100%", fontFamily: "'Geist',sans-serif", fontSize: 14, fontWeight: 500, color: saveState === "error" ? "#C94F4F" : "rgba(248,249,251,0.85)", background: saveState === "error" ? "rgba(201,79,79,0.10)" : "rgba(255,255,255,0.07)", border: `1px solid ${saveState === "error" ? "rgba(201,79,79,0.25)" : "rgba(255,255,255,0.12)"}`, borderRadius: 10, padding: "11px 0", cursor: saveState === "saving" ? "default" : "pointer", opacity: saveState === "saving" ? 0.6 : 1, transition: "all 150ms ease" }}
                onMouseEnter={(e) => { if (saveState === "idle") { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)"; (e.currentTarget as HTMLButtonElement).style.color = "#F8F9FB"; } }}
                onMouseLeave={(e) => { if (saveState === "idle") { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.07)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,249,251,0.85)"; } }}>
                {saveState === "saving" ? "Sparar…" : saveState === "error" ? "Misslyckades — försök igen" : user ? "Spara karta" : "Logga in för att spara"}
              </button>
            )}

            <button
              type="button"
              onClick={handleGoToFullEditor}
              style={{ width: "100%", fontFamily: "'Geist',sans-serif", fontSize: 14, fontWeight: 500, color: "#fff", background: "#1D4ED8", border: "none", borderRadius: 10, padding: "11px 0", cursor: "pointer", boxShadow: "0 4px 16px rgba(29,78,216,0.35)", transition: "background 150ms ease" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#2563EB"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#1D4ED8"; }}>
              Öppna editor →
            </button>
            <button
              type="button"
              onClick={handleReset}
              style={{ width: "100%", fontFamily: "'Geist',sans-serif", fontSize: 13, color: "rgba(248,249,251,0.40)", background: "none", border: "none", padding: "8px 0", cursor: "pointer", transition: "color 150ms ease" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,249,251,0.70)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,249,251,0.40)"; }}>
              Börja om
            </button>
          </div>
        </div>
      )}

      {/* ── Error state (centered, over map) ── */}
      {heroStage === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ zIndex: 3, pointerEvents: "none" }}>
          <p className="text-[13px] text-center max-w-[320px]" style={{ fontFamily: "'Geist Mono',monospace", color: "#C94F4F" }}>{errorMsg ?? "Generation failed"}</p>
        </div>
      )}

      {/* ── Idle chrome: scene label, dots, chevron ── */}
      {/* paddingBottom accounts for iOS home indicator (safe-area-inset-bottom) */}
      <div className="absolute bottom-0 left-4 sm:left-6 md:left-8" style={{ zIndex: 2, paddingBottom: "max(32px, env(safe-area-inset-bottom, 32px))", transition: "opacity 300ms ease", opacity: heroStage === "idle" ? 1 : 0 }}>
        <span className="text-[11px] uppercase tracking-widest" style={{ fontFamily: "'Geist Mono',monospace", color: "rgba(248,249,251,0.30)" }}>{currentLabel}</span>
      </div>

      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex items-center gap-[6px]" style={{ zIndex: 2, paddingBottom: "max(32px, env(safe-area-inset-bottom, 32px))", transition: "opacity 300ms ease", opacity: heroStage === "idle" ? 1 : 0 }}>
        {SCENES.map((_, i) => (
          <button key={i} type="button" aria-label={`Scene ${i + 1}`} onClick={() => setSceneIndex(i)}
            className="transition-all duration-300 rounded-full"
            style={{ width: i === sceneIndex ? 16 : 4, height: 4, background: i === sceneIndex ? "rgba(248,249,251,0.70)" : "rgba(248,249,251,0.25)", padding: 0, border: "none", cursor: "pointer" }} />
        ))}
      </div>

      <div className="absolute bottom-0 right-4 sm:right-6 md:right-8 chevron-bounce" style={{ zIndex: 2, paddingBottom: "max(32px, env(safe-area-inset-bottom, 32px))", opacity: heroStage !== "idle" ? 0 : scrolled ? 0 : 0.30, transition: "opacity 300ms ease", pointerEvents: "none" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(248,249,251,1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </div>
  );
}
