# Atlas AI Architecture Research (2026-04-01)

Research on sandboxed code generation, schema navigation, and AI pipeline design for the Atlas map chat. Updated with concrete implementation details mapped against the Atlas codebase.

---

## Table of Contents

1. [Code Generation Prompt — design against existing architecture](#1-code-generation-prompt)
2. [MapExtensionContext — safe wrapper in the React tree](#2-mapextensioncontext)
3. [Track Router — manifest-edit vs codegen](#3-track-router)
4. [Self-correction loop — error handling with retry](#4-self-correction-loop)
5. [Schema Navigation — tool use for growing schema](#5-schema-navigation)
6. [Sandboxing — three layers of protection](#6-sandboxing)
7. [Implementation Plan](#7-implementation-plan)

---

## 1. Code Generation Prompt

### Existing prompt architecture (from codebase analysis)

`system-prompt.ts` builds the prompt in sections:

```
<role>           — cartographic AI assistant
<context>        — MapLibre + declarative manifest
<map-families>   — 14 families with geometry constraints (~200 lines)
<transforms>     — buffer, voronoi, convex-hull, centroid, simplify, dissolve
<cartographic-rules>  — 23 rules, tagged per skill (thematic/locational/flow/general)
<dataset-profile>     — injected if data exists (field names, statistics, bounds)
<available-datasets>  — data catalog OR "use attached data"
<platform-limitations> — what Atlas CANNOT do
<variation-rules>     — 6 styling guidelines
<few-shot-examples>   — 2-3 geometry-matched examples from example-bank.ts
<output-format>       — MapManifest JSON schema
```

**Skill-based trimming:** `classifyGenSkill()` (thematic/locational/flow/general) filters 23 rules down to ~8-10 relevant ones. Saves ~1000 tokens + improves focus.

**Example selection:** `selectExamples(profile, count, skill)` selects based on:
1. Geometry type (Point → point-examples, Polygon → choropleth-examples)
2. Skill match (thematic → thematic-tagged examples)
3. Family coverage (maximize breadth, avoid duplication)

### Code generation prompt — new section to build

The codegen prompt should be a **parallel prompt**, not an extension of the manifest prompt. It is activated by the track router (section 3) when the manifest schema is insufficient.

```typescript
// New file: apps/web/lib/ai/codegen-prompt.ts

export function buildCodegenPrompt(
  currentManifest: MapManifest,
  dataProfile?: DatasetProfile,
): string {
  return `
<role>
You are a MapLibre GL JS visualization expert. Generate JavaScript code that extends a live map.
</role>

<context>
The user has an existing map rendered from a MapManifest. They want a visual feature
that cannot be expressed in the manifest schema. Your code will run in a sandboxed
environment with access to the map instance and GeoJSON data.
</context>

<module-format>
Your output MUST be a single JavaScript function:

export default function(ctx) {
  const { map, data, container } = ctx;
  // ctx.map = MapLibre GL JS Map instance (proxied, safe subset)
  // ctx.data = GeoJSON FeatureCollection (current map data)
  // ctx.container = HTMLElement (map container for DOM overlays)

  // ... your visualization code ...

  return {
    dispose() {
      // MANDATORY: clean up ALL layers, sources, listeners, animations, DOM elements
    }
  };
}
</module-format>

<allowed-apis>
// Map methods (proxied — only these work):
map.addSource(id, spec)        map.removeSource(id)       map.getSource(id)
map.addLayer(spec, beforeId?)  map.removeLayer(id)        map.getLayer(id)
map.addImage(id, data, opts?)  map.removeImage(id)        map.hasImage(id)
map.loadImage(url)             map.updateImage(id, data)
map.on(event, handler)         map.off(event, handler)
map.on(event, layerId, handler) map.off(event, layerId, handler)
map.setPaintProperty(layerId, prop, value)
map.setLayoutProperty(layerId, prop, value)
map.setFilter(layerId, filter)
map.setFeatureState({source, id}, state)
map.queryRenderedFeatures(point, {layers})
map.project(lngLat)            map.unproject(point)
map.getZoom()                  map.getCenter()            map.getBounds()
map.triggerRepaint()

// Browser APIs:
requestAnimationFrame, cancelAnimationFrame, performance.now()
document.createElement, console.log, Math.*, crypto.randomUUID()
new maplibregl.Marker(opts)    new maplibregl.Popup(opts)

// NOT ALLOWED (blocked by sandbox):
fetch, XMLHttpRequest, WebSocket, eval, new Function, importScripts
localStorage, sessionStorage, indexedDB, document.cookie
map.setStyle, map.remove, map.setTerrain, window, navigator
</allowed-apis>

<cleanup-rules>
1. Every map.addSource() MUST have a matching removeSource() in dispose()
2. Every map.addLayer() MUST have a matching removeLayer() in dispose() — remove layers BEFORE sources
3. Every map.on() MUST have a matching map.off() with the SAME function reference
4. Every requestAnimationFrame() MUST be cancelled in dispose()
5. Every DOM element added to container MUST be removed in dispose()
6. Every maplibregl.Marker MUST call .remove() in dispose()
7. Always guard removals: if (map.getLayer(id)) map.removeLayer(id)
8. Use unique IDs: const PREFIX = 'ext-' + crypto.randomUUID().slice(0,8)
</cleanup-rules>

<current-map>
${JSON.stringify(summarizeManifest(currentManifest), null, 2)}
</current-map>

<examples>
${CODEGEN_EXAMPLES.map(e => `USER: ${e.prompt}\nCODE:\n${e.code}`).join('\n---\n')}
</examples>
`;
}
```

```typescript
// TODO: Implement — produces compact JSON summary for AI context
function summarizeManifest(manifest: MapManifest): object {
  return {
    layers: manifest.layers.map(l => ({
      family: l.family,
      colorField: l.colorField,
      sizeField: l.sizeField,
      hasTimeline: !!l.timeline,
      hasChartOverlay: !!l.chartOverlay,
    })),
    basemap: manifest.basemap,
  };
}
```

### Few-shot examples for codegen (5 items, graduated)

```typescript
// New file: apps/web/lib/ai/codegen-examples.ts

export const CODEGEN_EXAMPLES = [
  {
    id: "pulsing-dot",
    prompt: "Add a pulsing dot at Stockholm",
    code: `export default function(ctx) {
  const { map } = ctx;
  const ID = 'ext-pulse-' + crypto.randomUUID().slice(0,8);
  const size = 80;

  const pulsingDot = {
    width: size, height: size,
    data: new Uint8Array(size * size * 4),
    onAdd() {
      this.canvas = document.createElement('canvas');
      this.canvas.width = size; this.canvas.height = size;
      this.ctx = this.canvas.getContext('2d');
    },
    render() {
      const t = (performance.now() % 1500) / 1500;
      const ctx = this.ctx;
      ctx.clearRect(0, 0, size, size);
      ctx.beginPath();
      ctx.arc(size/2, size/2, (size/2) * t, 0, Math.PI * 2);
      ctx.fillStyle = \`rgba(59, 130, 246, \${1 - t})\`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(size/2, size/2, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#3b82f6';
      ctx.fill();
      this.data = ctx.getImageData(0, 0, size, size).data;
      map.triggerRepaint();
      return true;
    }
  };

  map.addImage(ID + '-img', pulsingDot, { pixelRatio: 2 });
  map.addSource(ID, { type: 'geojson', data: {
    type: 'Feature', geometry: { type: 'Point', coordinates: [18.07, 59.33] }, properties: {}
  }});
  map.addLayer({ id: ID + '-layer', type: 'symbol', source: ID,
    layout: { 'icon-image': ID + '-img', 'icon-allow-overlap': true }
  });

  return {
    dispose() {
      if (map.getLayer(ID + '-layer')) map.removeLayer(ID + '-layer');
      if (map.getSource(ID)) map.removeSource(ID);
      if (map.hasImage(ID + '-img')) map.removeImage(ID + '-img');
    }
  };
}`
  },
  // ... 4 more: hover-tooltip, animated-route, html-overlay-legend, data-filter-animation
];
```

---

## 2. MapExtensionContext

### Where the wrapper plugs in (codebase analysis)

The map instance is created in `MapViewport` → shared via `MapContext` → consumed by `useMap()`:

```
MapShell
  └─ MapViewport (creates MapContext.Provider)
      └─ MapExtensionProvider  ← NEW — plug in HERE
          └─ children (MapContent, useManifestRenderer, etc.)
```

**Why here:** MapViewport owns the map instance lifecycle (created in useEffect, destroyed in cleanup). The extension wrapper gets the same lifecycle automatically.

### Existing cleanup patterns in the codebase (6 items)

All hooks in `map-core` already follow these patterns — the wrapper formalizes them:

| Pattern | Example in codebase | Extension wrapper variant |
|---|---|---|
| Layer/source with existence check | `use-manifest-renderer.ts:108-120` | `ctx.addLayer()` tracks automatically |
| Event listener on/off | `use-manifest-renderer.ts:412-424` | `ctx.on()` saves the reference |
| RAF cancellation | `use-route-animation.ts:187,195` | `ctx.startAnimation()` returns stop function |
| Async cancellation flag | `use-deck-overlay.ts:26-82` | `disposed` flag in the wrapper |
| Popup.remove() | `use-manifest-renderer.ts:422-423` | `ctx.addPopup()` tracks |
| ResizeObserver.disconnect() | `map-viewport.tsx:342-347` | Not relevant (wrapper creates no observers) |

### Concrete implementation

```typescript
// New file: packages/map-core/src/map-extension-context.ts

import type { Map as MaplibreMap } from "maplibre-gl";
import maplibregl from "maplibre-gl";

export interface ExtensionHandle {
  dispose: () => void;
}

export function createMapExtensionContext(map: MaplibreMap, container: HTMLElement): MapExtensionContext {
  const PREFIX = `ext-${crypto.randomUUID().slice(0, 8)}`;
  let counter = 0;
  const genId = (type: string) => `${PREFIX}-${type}-${counter++}`;

  // Tracking registries
  const sources: string[] = [];
  const layers: string[] = [];
  const images: string[] = [];
  const markers: maplibregl.Marker[] = [];
  const popups: maplibregl.Popup[] = [];
  const listeners: Array<{ type: string; layerId?: string; handler: Function }> = [];
  const animStoppers: Array<() => void> = [];
  const domElements: Array<{ parent: HTMLElement; el: HTMLElement }> = [];

  const ctx: MapExtensionContext = {
    addGeoJSONSource(id, data) {
      const sid = id || genId("src");
      if (!map.getSource(sid)) map.addSource(sid, { type: "geojson", data });
      sources.push(sid);
      const source = map.getSource(sid) as maplibregl.GeoJSONSource;
      return {
        setData: (d) => source?.setData(d),
        remove: () => { if (map.getSource(sid)) map.removeSource(sid); },
      };
    },

    addLayer(spec, beforeId) {
      if (!map.getLayer(spec.id)) map.addLayer(spec, beforeId);
      layers.push(spec.id);
      return {
        setPaintProperty: (p, v) => map.setPaintProperty(spec.id, p, v),
        setLayoutProperty: (p, v) => map.setLayoutProperty(spec.id, p, v),
        setFilter: (f) => map.setFilter(spec.id, f),
        setVisibility: (v) => map.setLayoutProperty(spec.id, "visibility", v ? "visible" : "none"),
        remove: () => { if (map.getLayer(spec.id)) map.removeLayer(spec.id); },
      };
    },

    addMarker(lngLat, options) {
      const m = new maplibregl.Marker(options).setLngLat(lngLat).addTo(map);
      markers.push(m);
      return { setPosition: (ll) => m.setLngLat(ll), remove: () => m.remove() };
    },

    addPopup(lngLat, html) {
      const p = new maplibregl.Popup().setLngLat(lngLat).setHTML(html).addTo(map);
      popups.push(p);
      return { remove: () => p.remove() };
    },

    on(event, handler) {
      map.on(event, handler);
      listeners.push({ type: event, handler });
      return () => map.off(event, handler);
    },

    onLayer(event, layerId, handler) {
      map.on(event, layerId, handler);
      listeners.push({ type: event, layerId, handler });
      return () => map.off(event, layerId, handler);
    },

    startAnimation(fn) {
      let running = true;
      let rafId: number | null = null;
      function tick(ts: number) {
        if (!running) return;
        fn(ts);
        rafId = requestAnimationFrame(tick);
      }
      rafId = requestAnimationFrame(tick);
      const stop = () => { running = false; if (rafId) cancelAnimationFrame(rafId); };
      animStoppers.push(stop);
      return stop;
    },

    project: (ll) => map.project(ll),
    getZoom: () => map.getZoom(),
    getBounds: () => map.getBounds(),
    queryFeatures: (layerIds, point) =>
      map.queryRenderedFeatures(point, { layers: layerIds }),

    createOverlayElement(opts) {
      const el = document.createElement("div");
      el.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:${opts?.pointerEvents ? "auto" : "none"}`;
      container.appendChild(el);
      domElements.push({ parent: container, el });
      return el;
    },

    dispose() {
      // 1. Stop animations
      animStoppers.forEach((stop) => stop());
      // 2. Remove event listeners
      listeners.forEach(({ type, layerId, handler }) => {
        try { layerId ? map.off(type, layerId, handler) : map.off(type, handler); } catch {}
      });
      // 3. Remove markers + popups
      markers.forEach((m) => m.remove());
      popups.forEach((p) => p.remove());
      // 4. Remove layers (before sources!)
      layers.reverse().forEach((id) => {
        try { if (map.getLayer(id)) map.removeLayer(id); } catch {}
      });
      // 5. Remove sources
      sources.forEach((id) => {
        try { if (map.getSource(id)) map.removeSource(id); } catch {}
      });
      // 6. Remove images
      images.forEach((id) => {
        try { if (map.hasImage(id)) map.removeImage(id); } catch {}
      });
      // 7. Remove DOM elements
      domElements.forEach(({ parent, el }) => {
        try { if (el.parentNode === parent) parent.removeChild(el); } catch {}
      });
    },
  };

  return ctx;
}
```

### React integration

```typescript
// New file: packages/map-core/src/use-map-extension.ts

export function useMapExtension(
  code: string | null,
  data: GeoJSON.FeatureCollection | null,
): { active: boolean; error: string | null; dispose: () => void } {
  const { map, isReady } = useMap();
  const handleRef = useRef<ExtensionHandle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!map || !isReady || !code) return;

    const container = map.getCanvasContainer();
    const ctx = createMapExtensionContext(map, container);

    try {
      // Blob URL → dynamic import (same pattern as use-deck-overlay.ts)
      const blob = new Blob([code], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);

      import(/* webpackIgnore: true */ url).then((mod) => {
        URL.revokeObjectURL(url);
        const result = mod.default({ map: createProxiedMap(map), data, container });
        handleRef.current = { dispose: () => { result?.dispose?.(); ctx.dispose(); } };
        setError(null);
      }).catch((err) => {
        setError(err.message);
        ctx.dispose();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      ctx.dispose();
    }

    return () => {
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [map, isReady, code, data]);

  return {
    active: handleRef.current !== null,
    error,
    dispose: () => { handleRef.current?.dispose(); handleRef.current = null; },
  };
}
```

```typescript
// TODO: Implement — creates a Proxy<Map> exposing only the allowed API surface
function createProxiedMap(map: MaplibreMap): MaplibreMap {
  const ALLOWED = new Set([
    'addSource','removeSource','getSource','addLayer','removeLayer','getLayer',
    'addImage','removeImage','hasImage','loadImage','updateImage',
    'on','off','setPaintProperty','setLayoutProperty','setFilter',
    'setFeatureState','queryRenderedFeatures','project','unproject',
    'getZoom','getCenter','getBounds','triggerRepaint',
  ]);
  return new Proxy(map, {
    get(target, prop: string) {
      if (ALLOWED.has(prop)) return target[prop].bind(target);
      throw new Error(`Blocked: map.${prop} is not available in extensions`);
    },
  });
}
```

---

## 3. Track Router

### Existing routing (codebase analysis)

Atlas already has three routing levels:

| Level | Function | Result |
|---|---|---|
| `classifyGenSkill()` | thematic / locational / flow / general | Selects which cartographic rules + examples |
| `classifyChatSkill()` | style / data / insight / general | Selects which tools in the chat |
| `classifyIntent()` | statistics / poi / entity_search / general | Selects data source in the clarify step |

**New level:** `classifyEditTrack()` — selects manifest-edit vs codegen.

### Implementation

```typescript
// New function in: apps/web/lib/ai/skills/router.ts

export type EditTrack = "manifest-edit" | "code-gen";

const MAP_FAMILIES = new Set([
  'point','cluster','choropleth','heatmap','proportional-symbol','flow',
  'isochrone','extrusion','animated-route','timeline','hexbin','hexbin-3d',
  'screen-grid','trip',
]);

const CODEGEN_SIGNALS = /\banimation\b|\banimate\b|particl|partikel|snow|snö|rain|regn|pulse|custom.*marker|draw|rita|annotation|3d.*effect|shader|glow|ripple|confetti|firework|sparkle/i;

const MANIFEST_EDIT_SIGNALS = /färg|color|colour|storlek|size|opacity|zoom|center|title|rubrik|legend|label|etikett|theme|tema|family|typ|klassificering|classification|scheme|palette|filter|tooltip|hover|click/i;

export function classifyEditTrack(
  message: string,
  currentManifest: MapManifest,
): EditTrack {
  const lower = message.toLowerCase();

  // If message references a known map family → manifest-edit
  for (const family of MAP_FAMILIES) {
    if (lower.includes(family)) return "manifest-edit";
  }

  // Strong codegen signals → route to codegen
  if (CODEGEN_SIGNALS.test(lower)) return "code-gen";

  // Strong manifest signals → route to manifest
  if (MANIFEST_EDIT_SIGNALS.test(lower)) return "manifest-edit";

  // Fallback: if the message references a field in the schema → manifest
  // Otherwise → codegen (better to generate working code than to fail manifest-edit)
  return "manifest-edit"; // default — safest
}
```

### Where it plugs in

In `chat/route.ts` after the existing `classifyChatSkill()`:

```typescript
// Existing:
const chatSkill = classifyChatSkill(message, !!dataProfile);
const enabledTools = getChatSkillTools(chatSkill);

// New:
const editTrack = classifyEditTrack(message, currentManifest);

if (editTrack === "code-gen") {
  // Use the codegen prompt instead of the manifest prompt
  const system = buildCodegenPrompt(currentManifest, dataProfile);
  // ... streamText with codegen-specific tools
} else {
  // Existing manifest-edit flow
}
```

---

## 4. Self-correction loop

### Existing pattern (codebase analysis)

The generate route already has a 3-attempt loop:

```
Attempt 1-3:
  generateText(Sonnet) → extractJSON → validateSchema → scoreQuality
    → JSON parse fail? → retry: "return valid JSON"
    → Schema errors? → retry: errors + available fields
    → Quality < 60? → retry: deductions list
    → Quality ≥ 60 OR attempt == 3? → accept

  If all 3 fail + quality < 60 + AI_FALLBACK_ENABLED:
    → Single attempt with Opus 4.5
```

The chat route has quality gating: manifests with score < 50 are rejected in tool execution.

### Codegen self-correction — same pattern, new error types

```typescript
// In chat/route.ts or new codegen-route.ts

const MAX_CODEGEN_ATTEMPTS = 3;

for (let attempt = 1; attempt <= MAX_CODEGEN_ATTEMPTS; attempt++) {
  const { text: code } = await generateText({
    model: MODELS.primary(),
    system: buildCodegenPrompt(manifest, profile),
    messages,
  });

  // 1. Extract code (find export default function)
  const extracted = extractCodeBlock(code);
  if (!extracted) {
    messages.push(
      { role: "assistant", content: code },
      { role: "user", content: "Your response must contain a JavaScript function starting with 'export default function'. Return only the code." },
    );
    continue;
  }

  // 2. AST validation
  const astResult = validateCodeAST(extracted);
  if (!astResult.valid) {
    if (astResult.blockedAPIs.length > 0) {
      // Blocked API — abort, explain why
      return { error: `Blocked API: ${astResult.blockedAPIs.join(", ")}` };
    }
    messages.push(
      { role: "assistant", content: code },
      { role: "user", content: `Syntax error: ${astResult.error}\nFix and return corrected code.` },
    );
    continue;
  }

  // 3. Run in iframe sandbox
  try {
    await runInSandbox(sandboxRef, extracted, geojson);
    return { code: extracted }; // Success
  } catch (err) {
    messages.push(
      { role: "assistant", content: code },
      { role: "user", content: `Runtime error: ${err.message}\nFix the error and return corrected code.` },
    );
    continue;
  }
}

return { error: "Could not generate working code after 3 attempts." };
```

```typescript
// TODO: Implement — extracts code from AI output, stripping markdown fences
function extractCodeBlock(text: string): string | null {
  // Try markdown code fence first
  const fenceMatch = text.match(/```(?:javascript|js|typescript|ts)?\n([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  // Try raw export default
  const exportMatch = text.match(/(export\s+default\s+function[\s\S]*)/);
  return exportMatch ? exportMatch[1].trim() : null;
}
```

```typescript
// Bridge between self-correction loop and iframe sandbox (section 6)
function runInSandbox(
  sandboxRef: React.RefObject<HTMLIFrameElement>,
  code: string,
  geojson: GeoJSON.FeatureCollection | null,
): Promise<void> {
  return new Promise((resolve, reject) => {
    function onMessage(e: MessageEvent) {
      if (e.source !== sandboxRef.current?.contentWindow) return;
      if (e.data.type === 'success') { cleanup(); resolve(); }
      if (e.data.type === 'error') { cleanup(); reject(new Error(e.data.message)); }
    }
    function cleanup() { window.removeEventListener('message', onMessage); }
    window.addEventListener('message', onMessage);
    sandboxRef.current?.contentWindow?.postMessage({ type: 'run', code, geojson }, '*');
    // Timeout after 10s
    setTimeout(() => { cleanup(); reject(new Error('Sandbox execution timed out')); }, 10_000);
  });
}
```

### AST validation (Acorn)

```typescript
// New file: apps/web/lib/ai/codegen-validator.ts

import * as acorn from "acorn";
import * as walk from "acorn-walk";

const BLOCKED = new Set([
  "fetch", "XMLHttpRequest", "WebSocket", "importScripts",
  "eval", "Function", "localStorage", "sessionStorage",
  "indexedDB", "navigator", "location", "history", "Worker",
]);

export function validateCodeAST(code: string): {
  valid: boolean;
  error?: string;
  blockedAPIs: string[];
} {
  let ast;
  try {
    ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: "module" });
  } catch (err) {
    return { valid: false, error: err.message, blockedAPIs: [] };
  }

  const blocked: string[] = [];

  walk.simple(ast, {
    Identifier(node) {
      if (BLOCKED.has(node.name)) blocked.push(node.name);
    },
    MemberExpression(node) {
      if (node.property.type === "Identifier" && BLOCKED.has(node.property.name)) {
        blocked.push(node.property.name);
      }
    },
  });

  // Check that the default export returns an object with dispose()
  let hasDispose = false;
  walk.ancestor(ast, {
    ReturnStatement(node: any, ancestors: any[]) {
      // Only check returns inside the default export function
      if (node.argument?.type === 'ObjectExpression') {
        for (const prop of node.argument.properties) {
          if (
            prop.key?.name === 'dispose' || prop.key?.value === 'dispose'
          ) {
            hasDispose = true;
          }
        }
      }
    },
  });

  if (!hasDispose) {
    return { valid: false, error: "Missing dispose() function in return object", blockedAPIs: blocked };
  }

  return { valid: blocked.length === 0, blockedAPIs: blocked };
}
```

---

## 5. Schema Navigation

### Where schema knowledge lives (codebase analysis)

| Knowledge | File | Format | How the AI sees it today |
|---|---|---|---|
| 14 map families | `manifest.ts:9` | TS union | Hardcoded in system prompt (~200 lines) |
| 21 color schemes | `manifest.ts:167` + `palettes.ts` | TS union + hex arrays | Mentioned in rules + examples |
| Classification methods | `manifest.ts:150` | TS union | In cartographic rules |
| Basemap styles | `manifest.ts:237` | TS union | In variation rules |
| All config interfaces | `manifest.ts` | 22+ interfaces | Output format section in prompt |
| Pattern templates | `patterns/*.ts` | MapPattern objects | **Not exposed** — validation only |
| Data catalog | `data-catalog.ts` | CatalogEntry[] | `catalogContext()` → text block |
| Palette colors (hex) | `palettes.ts` | COLOR_PALETTES | **Not exposed** — AI only sees scheme names |

**Key insight:** The schema is entirely hardcoded in the prompt. No tool use definitions exist in the generate route. The chat route uses Vercel AI SDK tools (`search_data`, `search_poi`, `update_manifest`, etc.) but no schema lookup tools.

### Concrete tool implementation (Vercel AI SDK)

```typescript
// New file: apps/web/lib/ai/tools/schema-lookup.ts

import { tool } from "ai";
import { z } from "zod";
import { COLOR_PALETTES, getColors } from "@atlas/data-models";
import type { MapFamily, ColorScheme } from "@atlas/data-models";
import { PATTERNS, findPattern } from "../patterns";

// --- Tool 1: Look up a manifest field ---
export const lookupManifestField = tool({
  description: "Get full schema details, valid values, and an example for any MapManifest field",
  parameters: z.object({
    fieldName: z.string().describe("Field name, e.g. 'chartOverlay', 'timeline', 'color'"),
  }),
  execute: async ({ fieldName }) => {
    return FIELD_REGISTRY[fieldName] ?? { error: `Unknown field: ${fieldName}` };
  },
});

// --- Tool 2: List all color schemes ---
export const listColorSchemes = tool({
  description: "List all 21 supported color schemes with type and colorblind safety",
  parameters: z.object({}),
  execute: async () => ({
    sequential: ["viridis","magma","plasma","inferno","cividis","blues","greens","reds","oranges","purples","greys"],
    diverging: ["blue-red","blue-yellow-red","spectral"],
    categorical: ["set1","set2","paired"],
    recommendation: "Use sequential for magnitude data, diverging for deviation from midpoint, categorical for distinct groups.",
  }),
});

// --- Tool 3: List all map families ---
export const listMapFamilies = tool({
  description: "List all 14 map families with geometry constraints and use cases",
  parameters: z.object({}),
  execute: async () =>
    Object.fromEntries(
      PATTERNS.map((p) => [
        p.family,
        {
          validGeometry: p.validGeometry,
          validTasks: p.validTasks,
          antiPatterns: p.antiPatterns.slice(0, 2),
        },
      ]),
    ),
});

// --- Tool 4: Inspect current manifest ---
export const getCurrentManifest = tool({
  description: "Get a summary of the current map's manifest (layers, families, fields)",
  parameters: z.object({}),
  // execute is injected at runtime with the current manifest
  execute: async () => ({ error: "Must be initialized with current manifest" }),
});

// WARNING: Manually maintained — must match manifest.ts interfaces.
// TODO: Auto-generate from TypeScript types or add a sync test.
const FIELD_REGISTRY: Record<string, object> = {
  chartOverlay: {
    type: "ChartOverlayConfig",
    fields: { type: "bar|pie|sparkline", fields: "string[]", labels: "string[]?", size: "number (default 40)", minZoom: "number (default 3)", maxVisible: "number (default 50)", labelField: "string?" },
    example: { type: "pie", fields: ["male", "female"], labels: ["Male", "Female"], size: 40 },
  },
  timeline: {
    type: "TimelineConfig",
    fields: { timeField: "string (required)", cumulative: "boolean (default true)", playSpeed: "number ms (default 1000)" },
    example: { timeField: "year", cumulative: true, playSpeed: 1000 },
  },
  imageFill: {
    type: "ImageFillConfig",
    fields: { imageField: "string (required)", fallbackUrl: "string?", opacity: "number 0-1 (default 0.85)", resolution: "number px (default 256)" },
    example: { imageField: "flag_url", opacity: 0.8 },
  },
  transform: {
    type: "TransformConfig | TransformConfig[]",
    variants: ["buffer", "voronoi", "convex-hull", "centroid", "simplify", "dissolve"],
    example: { type: "buffer", distance: 1, units: "kilometers" },
  },
  classification: {
    type: "ClassificationConfig",
    fields: { method: "quantile|equal-interval|natural-breaks|manual|categorical", classes: "number 2-9", breaks: "number[]? (for manual)" },
    example: { method: "quantile", classes: 5 },
  },
  color: {
    type: "ColorConfig",
    fields: { scheme: "ColorScheme (21 options)", colorblindSafe: "boolean (default true)", customColors: "string[]?" },
    example: { scheme: "blues", colorblindSafe: true },
  },
  normalization: {
    type: "NormalizationConfig",
    fields: { field: "string (denominator)", method: "per-capita|per-area|percentage|none", multiplier: "number?" },
    example: { field: "population", method: "per-capita" },
  },
  interaction: {
    type: "InteractionConfig",
    fields: { tooltipFields: "string[]?", clickBehavior: "detail-panel|popup|fly-to|none", hoverEffect: "highlight|enlarge|none" },
    example: { tooltipFields: ["name", "value"], clickBehavior: "popup", hoverEffect: "highlight" },
  },
  basemap: {
    type: "BasemapConfig",
    fields: { style: "dark|paper|nord|sepia|stark|retro|ocean", hillshade: "boolean", nightlights: "boolean", terrain: "boolean|{exaggeration}", landMask: "boolean", tectonic: "boolean", contourLines: "boolean|{interval,majorInterval,opacity}", labelsVisible: "boolean (default true)" },
    example: { style: "dark", hillshade: true, terrain: { exaggeration: 1.5 } },
  },
};
```

### How tools are activated in the chat route

```typescript
// In chat/route.ts — add schema tools alongside existing tools

import { lookupManifestField, listColorSchemes, listMapFamilies } from "../tools/schema-lookup";

const tools = {
  // Existing:
  ...(enabledTools.has("update_manifest") ? { update_manifest: updateManifestTool } : {}),
  ...(enabledTools.has("search_data") ? { search_data: searchDataTool } : {}),

  // New — always available:
  lookup_manifest_field: lookupManifestField,
  list_color_schemes: listColorSchemes,
  list_map_families: listMapFamilies,
  get_current_manifest: tool({
    description: "Get summary of current map manifest",
    parameters: z.object({}),
    execute: async () => summarizeManifest(currentManifest),
  }),
};
```

### Compact catalog in the system prompt

Replaces ~200 lines of hardcoded schema with ~30 lines:

```typescript
// In system-prompt.ts — new section replacing detailed schema

const CAPABILITY_CATALOG = `
CAPABILITIES (use lookup_manifest_field(name) for details):
- Families: point, cluster, choropleth, heatmap, proportional-symbol, flow, isochrone, extrusion, animated-route, timeline, hexbin, hexbin-3d, screen-grid, trip
- Styling: colorField, sizeField, fillOpacity, strokeColor, strokeWidth, labelField, labelFormat
- Color: 21 schemes (sequential/diverging/categorical) — use list_color_schemes()
- Classification: quantile, equal-interval, natural-breaks, manual, categorical (2-9 classes)
- Normalization: per-capita, per-area, percentage, none
- Overlays: chartOverlay (pie/bar/sparkline per feature), imageFill (images in polygons)
- Transforms: buffer, voronoi, convex-hull, centroid, simplify, dissolve (chainable)
- Basemap: style (7 presets), hillshade, nightlights, terrain, contourLines, landMask, tectonic
- Interaction: tooltipFields, clickBehavior (popup/detail-panel/fly-to), hoverEffect (highlight/enlarge)
- Legend: title, type (gradient/categorical/proportional/flow)
- Performance: simplifyTolerance, featureThreshold
- Code extensions: for visual features not listed above, use code generation track
`;
```

---

## 6. Sandboxing — Iframe Isolation

### Three security levels

| Level | Technique | Protects against | When |
|---|---|---|---|
| **Step 1** | AST validation (Acorn) + Proxy wrapper | Unintentional dangerous calls | Start here |
| **Step 2** | Cross-origin iframe sandbox | All client attacks (cookies, DOM, network leaks) | Before public deploy |
| **Step 3** | QuickJS-WASM | Pure data processing without DOM access | Specific data-transform use cases |

**Step 1 is sufficient for internal users** (they run AI-generated code against their own map). **Step 2 is required** before maps are shared publicly or embedded — a malicious user could otherwise create a map with harmful code that others open.

### Step 2: Iframe sandbox — concrete implementation

#### Architecture

```
┌─ Main page (atlas.app) ──────────────────────────┐
│  MapViewport                                      │
│    ├─ <canvas> (main map's MapLibre)              │
│    └─ <iframe src="/api/sandbox"                  │
│         sandbox="allow-scripts"                   │
│         style="position:absolute;inset:0">        │
│         ├─ Own MapLibre instance (no basemap)     │
│         └─ AI-generated layers render here        │
│       </iframe>                                   │
│  Sidebar, legend, controls (on top of iframe)     │
└───────────────────────────────────────────────────┘
```

The iframe sits on top of the main map. It has its own MapLibre instance but no basemap (solid background color). AI code draws data layers in the iframe. Camera is synced via `postMessage`.

#### Deployment: Next.js route handler (zero extra infrastructure)

```typescript
// New file: apps/web/app/api/sandbox/route.ts

import { NextResponse } from "next/server";

const SANDBOX_HTML = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; script-src 'self' 'unsafe-eval'; style-src 'unsafe-inline'; worker-src 'self'">
<link rel="stylesheet" href="/maplibre-gl.css">
<script src="/maplibre-gl-csp.js"></script>
<script src="/maplibre-gl-csp-worker.js"></script>
<style>body{margin:0}#map{width:100%;height:100vh}</style>
</head><body>
<div id="map"></div>
<script>
maplibregl.setWorkerUrl('/maplibre-gl-csp-worker.js');
let map = null;

window.addEventListener('message', async (e) => {
  const msg = e.data;

  if (msg.type === 'init') {
    map = new maplibregl.Map({
      container: 'map',
      style: { version: 8, sources: {}, layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': msg.bgColor || '#1a2030' } }
      ]},
      center: msg.center,
      zoom: msg.zoom,
      pitch: msg.pitch || 0,
      bearing: msg.bearing || 0,
      attributionControl: false,
    });
    map.on('load', () => parent.postMessage({ type: 'ready' }, '*'));
    // Camera sync: forward changes to parent
    map.on('moveend', () => {
      const c = map.getCenter();
      parent.postMessage({ type: 'camera', center: [c.lng, c.lat], zoom: map.getZoom(),
        pitch: map.getPitch(), bearing: map.getBearing() }, '*');
    });
  }

  if (msg.type === 'camera' && map) {
    map.jumpTo({ center: msg.center, zoom: msg.zoom, pitch: msg.pitch, bearing: msg.bearing });
  }

  if (msg.type === 'run' && map) {
    try {
      // Create GeoJSON source with posted data
      if (msg.geojson && !map.getSource('ext-data')) {
        map.addSource('ext-data', { type: 'geojson', data: msg.geojson });
      }
      // Run AI-generated code
      const blob = new Blob([msg.code], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const mod = await import(url);
      URL.revokeObjectURL(url);
      const result = mod.default({ map, data: msg.geojson, container: document.getElementById('map') });
      window._currentHandle = result;
      parent.postMessage({ type: 'success' }, '*');
    } catch (err) {
      parent.postMessage({ type: 'error', message: err.message, stack: err.stack }, '*');
    }
  }

  if (msg.type === 'dispose') {
    try { window._currentHandle?.dispose?.(); } catch {}
    window._currentHandle = null;
  }
});
</script>
</body></html>`;

export async function GET() {
  return new NextResponse(SANDBOX_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; script-src 'self' 'unsafe-eval'; style-src 'unsafe-inline'; worker-src 'self'",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
```

**Important detail:** The iframe element uses `sandbox="allow-scripts"` WITHOUT `allow-same-origin`. This makes the browser treat the iframe as a foreign origin — it cannot read cookies, localStorage, or access the main page's DOM. Even if the code inside tries to.

#### React component: SandboxFrame

```typescript
// New file: packages/map-core/src/sandbox-frame.tsx

"use client";
import { useRef, useEffect, useCallback } from "react";
import { useMap } from "./use-map";

interface SandboxFrameProps {
  code: string | null;
  geojson: GeoJSON.FeatureCollection | null;
  onReady?: () => void;
  onError?: (msg: string) => void;
}

export function SandboxFrame({ code, geojson, onReady, onError }: SandboxFrameProps) {
  const { map, isReady } = useMap();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const initedRef = useRef(false);

  // Listen for messages from sandbox
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data.type === "ready") { initedRef.current = true; onReady?.(); }
      if (e.data.type === "error") onError?.(e.data.message);
      if (e.data.type === "camera" && map) {
        map.jumpTo({ center: e.data.center, zoom: e.data.zoom,
          pitch: e.data.pitch, bearing: e.data.bearing });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [map, onReady, onError]);

  // Initialize sandbox map when iframe has loaded
  const handleLoad = useCallback(() => {
    if (!map || !isReady) return;
    const center = map.getCenter();
    iframeRef.current?.contentWindow?.postMessage({
      type: "init",
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
      bgColor: "#1a2030", // match explore theme
    }, "*");
  }, [map, isReady]);

  // Sync camera from main map → sandbox
  useEffect(() => {
    if (!map || !isReady) return;
    let syncing = false;
    function syncCamera() {
      if (syncing) return;
      syncing = true;
      const c = map.getCenter();
      iframeRef.current?.contentWindow?.postMessage({
        type: "camera",
        center: [c.lng, c.lat],
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      }, "*");
      requestAnimationFrame(() => { syncing = false; });
    }
    map.on("move", syncCamera);
    return () => { map.off("move", syncCamera); };
  }, [map, isReady]);

  // Send code to sandbox when it changes
  useEffect(() => {
    if (!code || !initedRef.current) return;
    iframeRef.current?.contentWindow?.postMessage({
      type: "run",
      code,
      geojson,
    }, "*");
    return () => {
      iframeRef.current?.contentWindow?.postMessage({ type: "dispose" }, "*");
    };
  }, [code, geojson]);

  return (
    <iframe
      ref={iframeRef}
      src="/api/sandbox"
      sandbox="allow-scripts"
      onLoad={handleLoad}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        border: "none",
        pointerEvents: "none", // clicks pass through to main map
        zIndex: 1,
      }}
    />
  );
}
```

#### postMessage protocol

```
Main page → Sandbox:
  { type: 'init', center, zoom, pitch, bearing, bgColor }
  { type: 'run', code: string, geojson: FeatureCollection }
  { type: 'camera', center, zoom, pitch, bearing }
  { type: 'dispose' }

Sandbox → Main page:
  { type: 'ready' }
  { type: 'success' }
  { type: 'error', message: string, stack?: string }
  { type: 'camera', center, zoom, pitch, bearing }
```

#### Performance considerations

| Aspect | Impact | Mitigation |
|---|---|---|
| **GeoJSON serialization** | <5ms at <100KB, ~100ms at 5MB | Use `Transferable ArrayBuffer` for >500KB |
| **Camera sync latency** | 1-3ms per message | Throttle `move` events to 30fps |
| **Two WebGL contexts** | Double GPU memory | Sandbox renders without basemap (data layers only) |
| **Mobile (older iPhone)** | Risk of tab reload at low memory | Detect `navigator.deviceMemory < 4` → run in main thread instead |
| **60fps animation** | No issues — iframe has its own rendering pipeline | Nothing extra needed |

#### Known gotchas

1. **MapLibre workers + sandbox:** The standard bundle uses `blob:` workers which are blocked in a sandboxed iframe. Solution: `maplibre-gl-csp.js` + `setWorkerUrl()` with a file served from `/public/`.

2. **Basemap style:** `connect-src 'none'` blocks tile loading. The sandbox has no basemap — just a solid background color. AI code draws data layers on top. Visually it looks like an extra transparent layer.

3. **Pointer events:** `pointer-events: none` on the iframe makes clicks/drags pass through to the main map. AI-generated features in the sandbox are **not clickable** in MVP. Hover tooltips require a forwarding mechanism (future phase).

4. **`map-viewport.tsx` code dependency:** The function `transformBasemapStyle()` currently discards its result after `initMap()`. If the sandbox should display the same basemap color, it needs to be saved in state. Minimal change.

#### Estimated effort

| Task | Hours |
|---|---|
| Sandbox route handler + CSP + HTML | 4h |
| postMessage protocol + TypeScript types | 2h |
| `SandboxFrame` React component | 3h |
| `useSandboxBridge` with camera sync | 6h |
| Integration in MapViewport | 4h |
| Safari testing + MapLibre CSP worker fix | 4h |
| GeoJSON ArrayBuffer optimization (>500KB) | 2h |
| Debug + edge cases | 5h |
| **Total** | **~30h (~4 work days)** |

With Claude Code writing the code and you reviewing/testing: **~8-10 sessions, roughly one week.**

**MVP limitations (deliberately accepted):**
- No clickable features in the sandbox (pointer-events: none)
- No basemap in the sandbox (solid background color)
- No feature interaction (hover/click forwarding is a future phase)
- Mobile risk on older devices (fallback to main thread)

---

## 7. Implementation Plan

> **Highest-ROI action:** Unblock existing features (mini-charts, timeline, terrain) before
> building codegen. ~5 hours of manifest fixes that immediately expand what users can do.
> See Priority 0 below.

### Priority 0: Unblock existing features (Week 1-2)

Before codegen — connect what is already built to the AI:

**Mini-charts:**
- Remove "Atlas CANNOT do: Embedded charts" from `system-prompt.ts`
- Add 2-3 chartOverlay examples in `example-bank.ts`
- Estimate: 2h

**Timeline:**
- Add 2-3 timeline examples in `example-bank.ts`
- Expand system prompt guidance (currently a one-liner)
- Estimate: 2h

**Terrain:**
- Add AI instruction: "if data has elevation/height → `terrain: true`"
- Add example with terrain
- Estimate: 1h

**Compare view:**
- Requires more work (the AI currently generates one manifest, compare needs two)
- Defer until after codegen

### Phase 1: MapExtensionContext + iframe sandbox (Week 3)

Build securely from the start — AST + Proxy + iframe in parallel:

**New file:** `packages/map-core/src/map-extension-context.ts`
- `createMapExtensionContext(map, container)` with dispose tracking
- All 6 cleanup patterns from the codebase formalized

**New file:** `packages/map-core/src/sandbox-frame.tsx`
- React component with iframe `sandbox="allow-scripts"` (without `allow-same-origin`)
- postMessage bridge with camera sync

**New file:** `apps/web/app/api/sandbox/route.ts`
- Serves sandbox HTML with CSP headers
- MapLibre CSP bundle + `setWorkerUrl()`

**New file:** `apps/web/lib/ai/codegen-validator.ts`
- Acorn parse + blocklist walk + dispose() check

**Dep:** `pnpm add acorn acorn-walk`

**Modify:** `map-viewport.tsx`
- Save transformed basemap style in state (currently discarded)

**Test:** Safari + Chrome + Firefox, hardcoded extension module.

### Phase 2: Codegen prompt + self-correction (Week 4-5)

**New file:** `apps/web/lib/ai/codegen-prompt.ts`
- `buildCodegenPrompt(manifest, profile)` — parallel prompt

**New file:** `apps/web/lib/ai/codegen-examples.ts`
- 5 few-shot examples (pulsing dot, hover tooltip, animated route, html legend, data filter)

**Modify:** `apps/web/app/api/ai/chat/route.ts`
- New SSE event type: `code-extension` with `{ code, description }`
- 3-attempt self-correction loop

### Phase 3: Chat UX + track router (Week 6)

**Modify:** `apps/web/components/ChatPanel.tsx` (or equivalent)
- New message type: `CodeExtensionMessage`
- "Apply to map" button, "Show code" expandable, "Undo" button
- Error messages inline

**Modify:** `apps/web/lib/ai/skills/router.ts`
- New `classifyEditTrack(message, manifest)` → "manifest-edit" | "code-gen"

### Phase 4: Schema navigation (Week 7)

**New file:** `apps/web/lib/ai/tools/schema-lookup.ts`
- 4 Vercel AI SDK tools (lookup_field, list_colors, list_families, get_manifest)

**Modify:** `apps/web/app/api/ai/chat/route.ts`
- Integrate schema tools (always available)

**Modify:** `apps/web/lib/ai/system-prompt.ts`
- Replace 200 lines of hardcoded schema with 30-line capability catalog
- Keep cartographic rules (skill-trimmed)

### Timeline overview

```
Week 1-2:  Unblock mini-charts, timeline, terrain (manifest fixes, ~5h)
Week 3:    MapExtensionContext + iframe sandbox + AST validator (~30h)
Week 4-5:  Codegen prompt + examples + self-correction loop (~25h)
Week 6:    Chat UX + track router (~15h)
Week 7:    Schema navigation tools (~10h)
```

**Total: ~85h of work, ~7 weeks at 1-2 sessions/day.**
Week 1-2 delivers immediate value (existing features). Week 3+ builds codegen with security baked in from day 1.

---

## Summary

| Component | File (new/modified) | Builds on |
|---|---|---|
| MapExtensionContext | `map-core/src/map-extension-context.ts` (new) | Existing 6 cleanup patterns |
| React hook | `map-core/src/use-map-extension.ts` (new) | `useMap()` context |
| Proxy wrapper | `apps/web/lib/map/proxied-map.ts` (new) | MapLibre API surface |
| AST validator | `apps/web/lib/ai/codegen-validator.ts` (new) | Acorn |
| Codegen prompt | `apps/web/lib/ai/codegen-prompt.ts` (new) | Existing `buildSystemPrompt()` pattern |
| Codegen examples | `apps/web/lib/ai/codegen-examples.ts` (new) | Existing `example-bank.ts` pattern |
| Schema lookup tools | `apps/web/lib/ai/tools/schema-lookup.ts` (new) | manifest.ts + palettes.ts + patterns |
| Track router | `skills/router.ts` (modified) | Existing `classifyChatSkill()` |
| Chat route | `chat/route.ts` (modified) | Existing streaming + tool use |
| System prompt | `system-prompt.ts` (modified) | Existing skill trimming |
