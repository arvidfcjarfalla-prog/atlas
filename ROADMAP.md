# Atlas Roadmap

## Planning Summary

Atlas is an AI-driven mapping platform where users describe a map in natural language and receive a rendered interactive map. The architecture enforces a strict pipeline:

```
user prompt → dataset profiling → Claude → MapManifest JSON
    → schema validation → cartographic validation → self-correction loop
    → manifest compiler → MapLibre layer specs → dumb renderer
```

The manifest is the single source of truth. The renderer never interprets intent — it applies compiled MapLibre specs. This separation is the core architectural constraint.

**Current state:** All 7 map families have schema types, validators, compiler functions, and pattern templates. The AI pipeline (prompt → Claude → validation → self-correction) exists as API routes. The manifest compiler produces MapLibre layer specs. Basemap hooks, legends, and the renderer hook are implemented.

**What's missing:** Nothing has been tested end-to-end. There is no UI for the AI flow. Two families (flow, isochrone) have deferred rendering features. The platform spec is outdated.

These 5 phases address the gaps in dependency order — each phase builds on the previous.

---

## Phase 1 — E2E Smoke Test

### Goal
Create a test page that hardcodes a manifest per map family, runs it through the compiler, and renders the result on an actual MapLibre map. Verifies the full path: `LayerManifest → compileLayer() → useManifestRenderer() → visual output + legend`.

### Why this matters now
We have ~850 lines of compiler code producing MapLibre expressions that have never been visually verified. The compiler could output invalid layer specs, broken color expressions, or misaligned legends — we would not know until someone tries to render. Every subsequent phase assumes the compiler works correctly.

### Files/modules involved
| File | Role |
|------|------|
| `apps/web/app/(maps)/smoke-test/page.tsx` | **New.** Test page with family selector |
| `packages/map-core/src/manifest-compiler.ts` | Consumer — compiled output rendered |
| `packages/map-core/src/use-manifest-renderer.ts` | Consumer — hook under test |
| `packages/map-core/src/use-basemap-layers.ts` | Consumer — basemap rendering |
| `packages/map-modules/src/legend/` | Consumer — legend rendering |
| `packages/data-models/src/manifest.ts` | Types for hardcoded manifests |

### Technical approach

1. **Create `/smoke-test` page** under `(maps)` route group. Dropdown to select map family (point, cluster, choropleth, heatmap, proportional-symbol, flow, isochrone).

2. **Hardcode one manifest + GeoJSON per family:**
   - `point` — 15 cities (Point geometry, categorical color by region)
   - `cluster` — 300 random events (Point, clustered)
   - `choropleth` — 10 polygons (Polygon, numeric colorField)
   - `heatmap` — 200 random points (Point, weighted)
   - `proportional-symbol` — 20 cities with population (Point, sizeField)
   - `flow` — 8 OD pairs (LineString, weightField)
   - `isochrone` — 3 concentric polygons (Polygon, breakpoint values)

3. **Render using existing hooks:**
   ```
   MapShell → MapViewport → useBasemapLayers + useManifestRenderer
   ```
   Display legend below/beside the map. Show raw compiled output in a collapsible `<pre>` block for debugging.

4. **Visual checklist per family:**
   - Layers appear on map
   - Colors match expected palette
   - Legend items match layer styling
   - Hover highlight works
   - Click interaction fires
   - No console errors

5. **No new packages or dependencies.** Pure test page using existing infrastructure.

### Risks / edge cases
- MapLibre may reject expressions the compiler produces (e.g. `["sqrt", ...]` — not all expressions are supported in all contexts). Catch errors in the renderer hook.
- GeoJSON with zero features: compiler must handle gracefully (already returns empty legend).
- `useManifestRenderer` mounts layers on `load` — race condition if map isn't ready. The hook already guards with `isReady`.

### Definition of done
- [ ] `/smoke-test` renders all 7 families without console errors
- [ ] Each family shows correct layer type (circle/fill/line/heatmap)
- [ ] Legends render with correct colors and labels
- [ ] Hover highlight works on at least point, choropleth, and flow
- [ ] `npx tsc --noEmit` passes

---

## Phase 2 — AI Flow in UI

### Goal
Wire the existing API routes (`/api/ai/upload-data`, `/api/ai/generate-map`) into a user-facing page where someone can upload a CSV, describe what they want, and see the generated map rendered.

### Why this matters now
The AI infrastructure exists but is inaccessible — there's no UI. The upload route, profiler, system prompt, validators, and generate-map route are all implemented but have no frontend consumer. This phase makes Atlas usable as a product.

### Files/modules involved
| File | Role |
|------|------|
| `apps/web/app/(maps)/create/page.tsx` | **New.** Upload + prompt + render page |
| `apps/web/lib/ai/types.ts` | DatasetProfile type for client use |
| `apps/web/app/api/ai/upload-data/route.ts` | Existing — CSV → GeoJSON + profile |
| `apps/web/app/api/ai/generate-map/route.ts` | Existing — prompt → manifest |
| `apps/web/app/page.tsx` | Update — add "Create Map" card |
| `packages/map-core/src/use-manifest-renderer.ts` | Renders generated manifest |

### Technical approach

1. **Create `/create` page** with three states:
   - **Upload** — file input for CSV, optional GeoJSON URL. Calls `/api/ai/upload-data`. Shows profile summary (feature count, geometry type, attributes).
   - **Prompt** — text input for natural language description. Shows dataset profile as context. Calls `/api/ai/generate-map` with prompt + profile.
   - **Render** — displays the generated map using `useManifestRenderer`. Shows legend, validation warnings, and manifest metadata (confidence, assumptions, attempts).

2. **State machine:**
   ```
   idle → uploading → profiled → generating → rendered
                                             → error (retry)
   ```

3. **Key UX decisions:**
   - Show a loading state during generation (1–5 seconds typical).
   - Display validation warnings as dismissable banners.
   - Allow editing the prompt and re-generating without re-uploading.
   - Show the raw manifest in a collapsible panel for debugging.

4. **Data flow:**
   ```
   CSV file → upload-data API → { geojson, profile }
   prompt + profile → generate-map API → { manifest, validation }
   manifest + geojson → useManifestRenderer → MapLibre layers
   ```

5. **Add "Create Map" card** to the homepage (`page.tsx`).

### Risks / edge cases
- The generate-map API requires `ANTHROPIC_API_KEY` — page must handle 500 gracefully with a "server not configured" message.
- Large CSV files (50MB limit in API) — show upload progress.
- Generated manifest may reference a `sourceUrl` that doesn't exist (AI hallucination) — the renderer should handle missing data gracefully.
- Self-correction loop can take 3 attempts × ~3s = 9s total. Need a progress indicator.

### Definition of done
- [ ] User can upload a CSV and see a profile summary
- [ ] User can enter a prompt and get a generated manifest
- [ ] Generated manifest renders visually on the map
- [ ] Legend displays correctly from generated manifest
- [ ] Validation warnings are surfaced to the user
- [ ] Error states handled (no API key, rate limit, parse failure)
- [ ] "Create Map" link accessible from homepage
- [ ] `npx tsc --noEmit` passes

---

## Phase 3 — Flow Arc Rendering

### Goal
Implement curved arc rendering for flow maps so origin-destination lines are visually distinguishable from each other and don't overlap. Currently all flow lines render as straight segments.

### Why this matters now
Flow maps with many OD pairs become unreadable with straight lines — overlapping segments create visual spaghetti. Arc rendering is the standard cartographic solution. The schema already has `flow.arc: boolean` as a config option; we just need the rendering implementation.

### Files/modules involved
| File | Role |
|------|------|
| `packages/map-core/src/manifest-compiler.ts` | `compileFlow()` — add arc geometry transformation |
| `packages/map-core/src/arc-interpolator.ts` | **New.** Pure function: LineString → curved LineString |
| `apps/web/lib/ai/validators/cartographic.ts` | Remove "arc deferred" warning |
| `packages/data-models/src/manifest.ts` | No changes — `arc` field already exists |
| `apps/web/lib/ai/system-prompt.ts` | Update to remove deferred note |

### Technical approach

1. **Arc interpolation as a pure data transform** — not a rendering trick. Convert each 2-point LineString into a multi-point LineString with an arc shape, *before* passing to MapLibre. This keeps the renderer dumb.

2. **Arc algorithm:**
   - Great circle interpolation for long-distance flows (> 500km).
   - Quadratic Bézier with control point offset perpendicular to the midpoint for short-distance flows.
   - Offset direction: always curve to the right (clockwise) to create visual separation for bidirectional flows.
   - Interpolation resolution: 32 points per arc (sufficient for smooth curves at any zoom).

3. **Integration point:** In `compileFlow()`, before creating the MapLibre line layers, check `layer.flow?.arc`. If true, transform the GeoJSON data by replacing each LineString with its arc equivalent.

4. **No changes to MapLibre layer specs.** The line layers already render whatever geometry they receive. We just give them curved LineStrings instead of straight ones.

5. **Performance:** Arc interpolation runs once at compile time. 1000 lines × 32 points = 32,000 coordinates — acceptable for MapLibre.

### Risks / edge cases
- Flows crossing the antimeridian (Pacific crossing) need special handling — great circle arcs must wrap correctly.
- Very short flows (same city) produce near-zero-length arcs — apply minimum offset.
- Bidirectional flows between the same OD pair overlap even with arcs — consider alternating offset direction.
- `arc: false` (or undefined) must keep existing straight-line behavior.

### Definition of done
- [ ] `flow.arc: true` renders curved lines in the smoke test
- [ ] Arcs are visually smooth at zoom levels 3–12
- [ ] Short-distance and long-distance flows render correctly
- [ ] `arc: false` still renders straight lines (backwards compatible)
- [ ] "Arc deferred" warning removed from validators and system prompt
- [ ] `npx tsc --noEmit` passes

---

## Phase 4 — Isochrone Routing Integration

### Goal
Add a server-side proxy that calls a routing engine (Valhalla or OSRM) to compute isochrone polygons, so the AI can generate isochrone maps from just an origin point and breakpoints.

### Why this matters now
Isochrone maps currently require pre-computed polygon data. The AI generates manifests with `sourceUrl: "/api/isochrone?origin=..."` but that endpoint doesn't exist. Without it, isochrone is the only map family that can't work end-to-end.

### Files/modules involved
| File | Role |
|------|------|
| `apps/web/app/api/isochrone/route.ts` | **New.** Proxy route to routing API |
| `apps/web/lib/ai/types.ts` | Possibly extend for routing response types |
| `packages/data-models/src/manifest.ts` | No changes — schema already supports isochrone |
| `packages/map-core/src/manifest-compiler.ts` | No changes — compiler already handles isochrone polygons |

### Technical approach

1. **API route** at `/api/isochrone`:
   ```
   GET /api/isochrone?origin=55.61,13.00&mode=cycling&breaks=10,20,30&unit=minutes
   ```
   Returns a GeoJSON FeatureCollection with one polygon per breakpoint, ordered largest-to-smallest. Each feature has a `value` property matching the breakpoint.

2. **Routing backend priority:**
   - **Option A: OpenRouteService** — free tier, hosted API, supports isochrone natively. Limited to 40 req/min.
   - **Option B: Valhalla** — self-hosted or Mapbox-hosted. More control, no rate limits if self-hosted.
   - **Option C: OSRM** — self-hosted only, requires custom isochrone calculation from distance matrix.
   - **Recommendation:** Start with OpenRouteService (simplest integration, no infra needed). Make the backend swappable via environment variable.

3. **Response normalization:** Different routing engines return different formats. The proxy normalizes to:
   ```json
   {
     "type": "FeatureCollection",
     "features": [
       { "type": "Feature", "geometry": { "type": "Polygon", ... }, "properties": { "value": 30 } },
       { "type": "Feature", "geometry": { "type": "Polygon", ... }, "properties": { "value": 20 } },
       { "type": "Feature", "geometry": { "type": "Polygon", ... }, "properties": { "value": 10 } }
     ]
   }
   ```

4. **Caching:** Cache isochrone responses by origin + mode + breaks hash. Isochrones don't change frequently. Use in-memory LRU cache initially.

5. **The manifest compiler and renderer require zero changes.** They already handle isochrone polygon data correctly. This phase only adds the data source.

### Risks / edge cases
- Routing API downtime — return a clear error, not a broken map.
- Rate limiting on free tier — implement request queuing or fallback.
- Large breakpoints (e.g. 120 minutes driving) produce massive polygons that can be slow to render — set a max breakpoint limit.
- Origin points in the ocean or remote areas return empty results — handle gracefully.
- API key management — routing API keys should not be exposed to the client.

### Definition of done
- [ ] `/api/isochrone` returns valid GeoJSON for a test request
- [ ] Response contains correct number of polygons matching breakpoints
- [ ] Polygons render correctly in the smoke test isochrone panel
- [ ] Error handling for invalid origins, rate limits, and timeouts
- [ ] API key configured via environment variable
- [ ] At least one routing backend works end-to-end
- [ ] `npx tsc --noEmit` passes

---

## Phase 5 — Platform Spec Update

### Goal
Update `docs/map-platform-spec.md` to reflect the current architecture, including the AI pipeline, manifest v2 schema, compiler, validation system, and pattern templates.

### Why this matters now
The spec is the canonical reference for building on Atlas. It currently describes v1 (manual manifests, 8 point layers, severity-based markers) but not v2 (7 map families, AI generation, classification, color schemes, flow/isochrone). Any new contributor or AI agent working from the spec will produce incorrect code.

### Files/modules involved
| File | Role |
|------|------|
| `docs/map-platform-spec.md` | Update with v2 architecture |

### Technical approach

1. **Add new sections:**
   - **AI Pipeline** — prompt → profiler → Claude → validation → self-correction → manifest
   - **Map Families** — the 7 families with their geometry requirements and compiler behavior
   - **Manifest v2 Schema** — full LayerManifest with flow, isochrone, classification, color, normalization
   - **Compiler Architecture** — `compileLayer()` entry point, per-family compilation, legend generation
   - **Validation System** — two-pass validation (schema + cartographic), error vs warning levels
   - **Pattern System** — how patterns guide AI generation with antiPatterns and validation rules
   - **Basemap Layers** — terrain, hillshade, nightlights, land mask, tectonic

2. **Update existing sections:**
   - **Key Primitives table** — add manifest-compiler, use-manifest-renderer, use-basemap-layers, validators, profiler
   - **Rendering Flow** — add the manifest-driven path alongside the v1 path
   - **How to Add a New Map** — add the AI-generated path (upload CSV → prompt → render)
   - **Layer Rendering Order** — document that compiled layers replace the hardcoded 8-layer stack

3. **Keep v1 sections** for backwards compatibility — the disasters page still uses the v1 flow.

4. **Mark deferred items explicitly** — arc rendering, routing integration (if not yet complete).

### Risks / edge cases
- Spec drift: the spec must be updated whenever the implementation changes. Consider adding a note about this.
- Over-documentation: keep the spec operational (how to use it) rather than explanatory (how it works internally).

### Definition of done
- [ ] Spec accurately describes the AI pipeline end-to-end
- [ ] All 7 map families documented with geometry requirements
- [ ] Manifest v2 schema documented with all new fields
- [ ] Compiler and validation architecture explained
- [ ] "How to Add a New Map" includes the AI flow
- [ ] Deferred items clearly marked
- [ ] No contradictions between spec and implementation

---

## Execution Plan

### Recommended order

```
Phase 1 (E2E smoke test)
    ↓
Phase 2 (AI flow in UI)
    ↓
Phase 3 (Flow arc rendering)     ← can run in parallel with Phase 4
Phase 4 (Isochrone routing)      ← can run in parallel with Phase 3
    ↓
Phase 5 (Spec update)            ← last, after implementation stabilizes
```

### Parallelism
- **Phase 3 and 4** are independent — flow arcs and isochrone routing touch different files and can be developed concurrently.
- **Phase 5** must wait until Phases 1–4 are done (or nearly done) to avoid documenting things that change.
- **Phases 1 and 2** are strictly sequential — Phase 2 assumes the compiler output is verified by Phase 1.

### What stays deferred
- **3D extrusion rendering** — not in any map family schema, no current use case.
- **PMTiles / vector tile sources** — `sourceType: "pmtiles"` exists in the schema but has no compiler support. Add when needed for large datasets.
- **Real-time data streaming** — `refreshIntervalMs` exists but no WebSocket or SSE infrastructure.
- **Multi-layer manifests** — the compiler handles one layer at a time. Multi-layer composition (e.g. choropleth + proportional symbol overlay) needs design work.
- **User authentication / saved maps** — no auth system exists. Required before maps can be persisted.
