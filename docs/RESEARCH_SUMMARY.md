<!-- last-reviewed: 2026-04-02 -->
# Atlas Research & Architecture Summary

> Condensed reference for AI assistants. Full sources in `apps/web/lib/ai/tools/` and `docs/`.

---

## What Atlas Is

AI-driven map platform. User describes a map in natural language → AI generates a MapManifest JSON → manifest compiler → MapLibre GL JS renders it. The manifest is the single source of truth — the renderer never interprets intent.

```
prompt → clarify (data resolution) → generate-map (AI → MapManifest) → compiler → MapLibre
```

14 map families: point, cluster, choropleth, heatmap, proportional-symbol, flow, isochrone, extrusion, animated-route, timeline, hexbin, hexbin-3d, screen-grid, trip.

Tech: Next.js 14, TypeScript 5.8, MapLibre GL JS 5.19, Claude Sonnet 4.5 (primary), Vercel AI SDK, Supabase (auth + storage + Postgres).

---

## 1. Data Sources (DATA_SOURCE_RESEARCH.md, ~1480 lines)

### What exists today

| Category | Sources |
|---|---|
| **PxWeb** | Sweden SCB, Norway SSB, Finland Tilastokeskus, Iceland Hagstofa, Denmark DST, Switzerland BFS, Estonia Statistikaamet, Slovenia SURS, Latvia CSP + generic fallback |
| **SDMX** | BIS, ECB, OECD, ILO, ISTAT, Eurostat, IMF, Stats Canada, ABS, Malta, Thailand |
| **Other** | World Bank v2, Data Commons v2, Eurostat Statistics API, Overpass (OSM), web dataset search |

### Critical fixes needed (existing adapters)

- ILO base URL changed: `www.ilo.org/sdmx/rest` → `sdmx.ilo.org/rest`
- Thailand NSO wrong host: `sdmx.nso.go.th` → `ns1-stathub.nso.go.th`
- ISTAT rate limit: 5 req/min, exceeding → 1-2 day IP block. Needs 15s floor.
- ECB structure queries: JSON returns 406 — must use XML for structure endpoints
- NZ Stats: old `api.stats.govt.nz` dead since Aug 2024. New: SDMX at `api.data.stats.govt.nz/rest/`

### New sources prioritized

**Tier 1 (no auth, easy):** Kolada (Sweden municipal KPIs, SCB 4-digit codes), Ireland CSO (JSON-stat 2.0), Argentina datos.gob.ar, Brazil IBGE.

**Tier 2 (API key or moderate effort):** US Census (FIPS codes), UK ONS, Netherlands CBS (OData v4), US BLS/BEA/FRED.

**Tier 3 (harder):** Spain INE, Germany Destatis, France INSEE, Japan e-Stat, South Korea KOSIS.

### Aggregator databases (Kolada-pattern)

Best new sources for subnational data: Sotkanet (Finland, ~3700 indicators), NOMIS (UK labour), Fingertips (England public health), Census Reporter (US, all ACS tables), OpenAQ (global air quality), data.police.uk (UK crime).

### Wikidata SPARQL

Covers "encyclopedic" maps no existing source handles: UNESCO sites, volcanoes, historical battles, castles, mountains, universities, airports. 5-8 pre-built SPARQL templates matched by AI, not LLM-generated SPARQL. Aggressive caching (7-30 days). Circuit breaker (3-5 failures/60s → open 5 min). Blazegraph replacement expected 2027 — design with fallback.

---

## 2. Rendering Capabilities (RENDERING_CAPABILITIES.md, ~415 lines)

### Image markers in MapLibre

**Recommended pattern:** `styleimagemissing` event + `coalesce` fallback expression. Lazy-load per-feature images (logos, avatars) into GPU texture atlas on demand. Pre-load category icons at startup.

**Scale:** <50 markers → HTML markers fine. 50-500 → symbol layer + clustering. 500+ → clustering mandatory, images only on hover/zoom-in. 2000+ → server tiles or deck.gl.

**Image source priority chain:**
1. User-provided URL → proxy → 64×64 PNG
2. Company domain → Logo.dev (free)
3. Wikidata entity → P154/P18 → Commons thumbnail
4. Country → flagcdn.com
5. Category → Maki SVG icons
6. Fallback → code-generated initials SVG

### Image proxy (mandatory)

Next.js route handler at `/api/image-proxy` + Sharp. Pipeline: validate URL → SSRF check (reject private IPs, disable redirects) → fetch with timeout → resize 64×64 → circular crop → PNG output. Cache: browser 1 day, Vercel CDN 7 days, KV 7 days. HMAC URL signing prevents abuse.

---

## 3. AI Architecture — Creative Codegen (AI_ARCHITECTURE.md, ~1186 lines)

### The problem

The MapManifest schema (~50 fields, 14 families) has a ceiling. When users ask the chat for something not expressible in the manifest (pulsing dots, particle effects, custom annotations, animated overlays), the request fails. The system needs a fallback track where AI generates JavaScript code that runs against the live MapLibre map instance.

### Two-track architecture

```
User chat message
  → classifyEditTrack(message, manifest)
    → "manifest-edit": existing flow (update manifest JSON, validate, score)
    → "code-gen": new flow (generate JS, AST validate, run in sandbox)
```

Manifest-first, codegen as fallback. Better manifest = less codegen usage.

### Track router

`classifyEditTrack()` checks: (1) does message reference a known map family? → manifest-edit. (2) codegen signal regex (animation, particle, snow, pulse, glow, etc.)? → code-gen. (3) manifest signal regex (color, size, opacity, legend, etc.)? → manifest-edit. Default: manifest-edit.

### Code generation prompt

Separate prompt from manifest generation. AI writes a JS module:
```js
export default function(ctx) {
  const { map, data, container } = ctx;
  // ... visualization code using whitelisted MapLibre API ...
  return { dispose() { /* cleanup everything */ } };
}
```

Allowed: ~30 MapLibre methods (addSource, addLayer, on/off, setPaintProperty, etc.) + requestAnimationFrame + Marker/Popup. Blocked: fetch, eval, WebSocket, localStorage, document.cookie, map.setStyle, map.remove.

### MapExtensionContext

Safe wrapper that tracks all resources (sources, layers, images, markers, popups, listeners, animations, DOM elements). `dispose()` removes everything in correct order: animations → listeners → markers → layers → sources → images → DOM. Mirrors 6 existing cleanup patterns in the Atlas codebase.

### Security — three layers

| Layer | Technique | Protects against |
|---|---|---|
| **AST validation** (Acorn) | Parse code, walk AST, block dangerous APIs, verify dispose() exists | Accidental dangerous calls |
| **Proxy wrapper** | `new Proxy(map, { get })` whitelist of ~30 methods | Direct map API abuse |
| **Cross-origin iframe sandbox** | `<iframe sandbox="allow-scripts">` without `allow-same-origin`, CSP headers block network | All client attacks (cookies, DOM, network). **Required before public deploy.** |

Iframe sandbox: route handler at `/api/sandbox` serves HTML with its own MapLibre instance (no basemap, solid background). Camera synced via `postMessage`. AI code runs in iframe, cannot access main page's cookies/DOM/localStorage.

### Self-correction loop

3 attempts, matching existing generate-map pattern. Error types: syntax error → retry with error message. Blocked API → abort immediately. Runtime error → retry with stack trace. Uses `runInSandbox()` (Promise wrapper over postMessage to iframe).

### Schema navigation (for growing manifest)

Replace ~200 lines of hardcoded schema in system prompt with ~30-line capability catalog + 4 Vercel AI SDK tools: `lookupManifestField`, `listColorSchemes`, `listMapFamilies`, `getCurrentManifest`. AI calls tools on demand instead of having entire schema in context.

### Codegen → schema promotion ("pave the cowpaths")

Log all codegen usage. Group similar requests. When a pattern appears frequently (e.g., "pulsing dot" requested 50 times), promote it to a manifest field. Codegen shrinks over time as manifest grows.

### Unblock existing features first (Priority 0, ~5h)

Before building codegen — connect features that are already implemented but disconnected from AI:
- **Mini-charts**: Remove "Atlas CANNOT do: Embedded charts" from system-prompt.ts. Add 2-3 chartOverlay examples.
- **Timeline**: Add examples to example-bank.ts. Expand system prompt guidance.
- **Terrain**: Add AI instruction for elevation data → `terrain: true`.

---

## 4. Architecture Blueprint v3.1 (architecture-blueprint-v3.md, ~1250 lines)

### Core problem

Resolution attempts are invisible (only winner remembered), learning is ephemeral (.next/cache, wiped on deploy), data has no stable identity (cache entries expire → 404s), two codepaths for resolution (clarify vs chat), no negative feedback.

### Three-tier persistence

| Tier | Role | Examples |
|---|---|---|
| **Immutable logs** | Record what happened (write-once) | `resolution_sessions`, `resolution_attempts`, `generation_records`, `map_versions` |
| **Append-only events** | Record user signals (insert-only) | `resolution_outcomes` (saved, abandoned, deleted, first_followup, re_prompted, manifest_edit) |
| **Derived aggregates** | Precomputed for fast reads (rebuildable) | `table_scores` |

### Key new tables

**`dataset_artifacts`** — Versioned, immutable data backing a map. `query_fingerprint` (what was requested) + `content_hash` (what was received) + `version` (increments when upstream changes). GeoJSON stored in Supabase Storage (permanent URL). Old maps keep working forever — each artifact row is immutable.

**`resolution_sessions`** — Immutable request log. One per clarify/search_data call. Carries `winning_source_id` and `winning_table_id` for outcome attribution (even for cached sessions).

**`resolution_attempts`** — PxWeb only. One row per table tried in the multi-table loop. Status: map_ready, tabular_only, no_geo, no_data, join_failed, wrong_level, unsupported.

**`resolution_outcomes`** — Append-only events. Idempotency via `idempotency_key` (duplicate INSERTs silently ignored). Saved + abandoned are mutually exclusive. Saved + deleted may coexist.

**`table_scores`** — Derived aggregate keyed on `(source_id, table_id, topic_group)`. Per-topic, not global — a table good for "befolkning" but bad for "utbildning" carries separate scores. Rebuilt from logs + events every 15 min + incremental on write.

**`generation_records`** — How a manifest was produced. Links map → session → artifact. Method: deterministic | ai | chat_edit | code_gen.

### Shared resolution engine

`resolveDataset()` — one function, two callers (clarify route + chat search_data tool). Writes session + attempts (PxWeb only) + artifact. Does NOT write outcomes (client writes those after user interaction).

### Ranking

Reads `table_scores` — single-table lookup, no joins at query time. Three layers: structural (attempt success/failure, always active), outcome (saved/abandoned/deleted, always active), telemetry (first-followup, weight=0 in v1 until validated).

### First-followup: unvalidated telemetry

Classifier is unverified, source comparison unimplemented, client detection has systematic bias. Collected but not acted on. Activation requires: 200+ events, 70% classifier accuracy, ≥2x correlation with negative outcomes.

### Migration plan (strict dependency order)

```
Phase 0: Formalize existing tables (005-008) — prerequisite
Phase 1: dataset_artifacts + Supabase Storage (009)
Phase 2: resolution_sessions + attempts + shared engine (010-011) — feature-flagged sub-phases
Phase 3: outcomes + generation_records (012-013)
Phase 4: table_scores + ranking (014)
Phase 5: maps → artifact_id + session_id switchover (015)
Phase 6: Telemetry validation (analysis only)
Phase 7: Cleanup (.next/cache removal)
```

---

## 5. How Everything Fits Together — Merged Timeline

The blueprint (data/learning layer) and AI architecture (creative editing layer) are mostly orthogonal. Four interaction points:

1. **Both modify `chat/route.ts`** — blueprint refactors search_data, AI arch adds codegen track + schema tools. Sequence: blueprint first.
2. **`generation_records.method`** needs `'code_gen'` value for codegen track.
3. **`resolution_outcomes.event_type`** needs `'code_extension'` for codegen usage logging.
4. **New data source adapters** (from DATA_SOURCE_RESEARCH.md) should wait for blueprint Phase 2 (`resolveDataset()`) before being built.

```
Week 1-2:   Blueprint Phase 0 (schema formalization)
            + AI Arch Priority 0 (unblock mini-charts/timeline/terrain) — no overlap

Week 3-4:   Blueprint Phase 1-2 (artifacts + resolution engine)
            + AI Arch Phase 1 (MapExtensionContext + iframe sandbox) — different files

Week 5-6:   Blueprint Phase 3 (outcomes + generation_records)
            + AI Arch Phase 2 (codegen prompt + self-correction) — coordinate

Week 7-8:   Blueprint Phase 4 (table_scores)
            + AI Arch Phase 3 (chat UX + track router) — sequence chat/route.ts changes

Week 9:     AI Arch Phase 4 (schema navigation tools)
Week 10:    Blueprint Phase 5 (maps → artifact switchover)
Week 11:    Data source critical fixes (ILO, Thailand, ISTAT URLs)
Week 12+:   New adapters (Kolada, US Census, etc.) — built against resolveDataset()
            + Blueprint Phase 6-7 (telemetry validation + cleanup)
```

---

## File Reference

| File | Lines | Content |
|---|---|---|
| `apps/web/lib/ai/tools/DATA_SOURCE_RESEARCH.md` | ~1480 | All non-PxWeb APIs: critical fixes, 40+ sources, SDMX details, aggregators, Wikidata SPARQL |
| `apps/web/lib/ai/tools/RENDERING_CAPABILITIES.md` | ~415 | Image markers, MapLibre techniques, image APIs, proxy architecture, production patterns |
| `apps/web/lib/ai/tools/AI_ARCHITECTURE.md` | ~1186 | Codegen sandbox, track router, schema navigation, iframe security, implementation plan |
| `docs/architecture-blueprint-v3.md` | ~1250 | Persistence model, resolution engine, artifact versioning, learning/ranking, migration plan |
| `CLAUDE.md` | ~250 | Project structure, commands, dev rules |
| `ROADMAP.md` | ~340 | 5-phase roadmap (smoke test → AI UI → arcs → isochrone → spec update) |
