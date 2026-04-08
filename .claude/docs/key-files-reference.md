# Key Files Reference

## Data Models & Compilation
- `packages/data-models/src/manifest.ts` — MapManifest, LayerManifest, all config types
- `packages/map-core/src/manifest-compiler.ts` — `compileLayer(layer, data) → CompiledLayer`
- `packages/map-core/src/arc-interpolator.ts` — Arc rendering (Bézier <500km, great circle ≥500km)

## AI Pipeline & Validation
- `apps/web/lib/ai/validators/` — Two-pass validation: schema + cartographic
- `apps/web/lib/ai/profiler.ts` — Dataset profiling for geometry-aware scoring
- `apps/web/lib/ai/quality-scorer.ts` — Structural quality score (0–100)
- `apps/web/app/api/ai/generate-map/route.ts` — AI generation endpoint
- `apps/web/scripts/eval-runner.ts` — Offline/online eval runner

## Geography & Geometry
- `apps/web/public/geo/se/municipalities.geojson` — Swedish municipalities with SCB 4-digit codes
- `apps/web/lib/ai/tools/geometry-registry.ts` — Geometry registry (resolves country/admin geometries)
- `apps/web/lib/ai/tools/geography-plugins.ts` — 13 per-country geography plugins (SE, NO, IS, DK, FI, EE, SI, LV, CH, Eurostat NUTS, US FIPS, PxWeb generic, country admin fallback)
- `apps/web/lib/ai/tools/pxweb-resolution.ts` — PxWeb table resolution (skip Haiku selection when plugin provides known tables)
- `apps/web/lib/ai/tools/pxweb-client.ts` — PxWeb client (wildcard threshold: URL string length >1500 chars)

## Data Sources & Resolution
- `apps/web/app/api/ai/clarify/route.ts` — Agency hint UX (short-circuit web search for unconnected sources, <5s response)
- `apps/web/lib/ai/clarify-cache.ts` — Clarify cache (DISABLED until learning phase — gated by `ATLAS_ENABLE_CLARIFY_CACHE=true`)
- `apps/web/lib/supabase/service.ts` — Supabase client with 8s request timeout + `withTimeout()` helper
- `apps/web/lib/ai/tools/official-stats-resolver.ts` — Global stats registry with crime/justice topic tags
- `apps/web/lib/ai/tools/crosswalks/` — 15 static JSON crosswalk tables (ISO2↔ISO3, M49→ISO3, FIPS, JIS, KOSIS, IBGE, INEGI, BPS, INDEC, AGS→NUTS, CCAA→NUTS, TERYT→NUTS, dept→NUTS3, NUTS2016→2021, WB aggregate blocklist)
- `apps/web/lib/ai/tools/DATA_SOURCE_RESEARCH.md` — ~50 non-PxWeb data sources (API details, auth, rate limits, codes)

## Documentation & Architecture
- `docs/source-integration-spec.md` — Source integration spec: audit, joinability matrices, adapter contract, implementation plan
- `docs/platform-plan.md` — 4-phase platform plan (begriplighet → egen data → live-data → lärande)
- `docs/architecture-blueprint-v3.md` — Architecture blueprint v3.2: immutable logs, resolution sessions, artifact versioning, migration phases

## Landing & Editorial
- `docs/landing-animation-spec.md` — AtlasRenderPipeline: as-built 5-stage progressive Sweden choropleth
- `apps/web/app/(marketing)/landing.tsx` — Main landing page
- `apps/web/components/marketing/AtlasRenderPipeline.tsx` — Sticky Sweden map + scrolling text column
- `apps/web/components/marketing/render-pipeline/` — Sub-components: StageList, MapBlueprint, StageText, stage vizualizations
- `apps/web/lib/editorial-tokens.ts` — Warm-light palette (ink, inkMuted, sage, gold, paper, contour)

## Hub Page
- `apps/web/app/app/(hub)/page.tsx` — Hub page: dark hero + warm editorial map-type section
- `apps/web/components/MapTypeBlock.tsx` — Editorial block with scroll-triggered reveal
- `apps/web/components/family-meta.tsx` — FAMILY_META, FAMILY_INFO, MAP_TYPE_ORDER, FamilyPill
- `apps/web/components/block-backgrounds.tsx` — 7 decorative topographic contour SVGs

## Generated Assets
- `apps/web/components/generated/sweden-choropleth.ts` — 279 Swedish municipalities as SVG paths (141 KB)
- `apps/web/components/generated/family-thumbnails.ts` — World/Europe outlines, cities, NUTS2, trade flows (234 KB)
- `apps/web/scripts/generate-choropleth-preview.mjs` — Regenerates sweden-choropleth.ts
- `apps/web/scripts/generate-family-thumbnails.mjs` — Regenerates family-thumbnails.ts

## Archive
- `docs/archive/data-upload-research.md` — 6 archetypes, pipeline, geocoding options
- `docs/archive/data-upload-ui-design.md` — Drag-and-drop, preview, upload+prompt combo
- `docs/archive/data-upload-debate-findings.md` — 5-perspective consensus, MVP scope
