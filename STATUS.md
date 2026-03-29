# Atlas — Project Status

Last updated: 2026-03-29

## Vision

Atlas is an AI-driven map platform. Users describe what they want in natural language, and the platform generates interactive, publication-quality maps. Think "Figma for maps" powered by Claude.

**Core loop:** Prompt → AI generates MapManifest → Compiler → MapLibre rendering

**Target users:** Journalists, researchers, analysts, storytellers — anyone who needs a map but doesn't want to learn GIS.

---

## What's Built

### Marketing & Landing
- [x] Landing page (`/`) — hero with city lights canvas + prompt input
- [x] Use cases page (`/use-cases`)
- [x] Pricing page (`/pricing`) — Free / Pro / Enterprise tiers
- [x] Enterprise page (`/enterprise`)

### Auth
- [x] Login (`/auth/login`) — Email magic link + Google + GitHub OAuth
- [x] Signup (`/auth/signup`)
- [x] OAuth callback (`/auth/callback`)
- [x] Auth context with session management
- [x] Auth modal for upsell

### App Shell
- [x] Hub home (`/app`) — sidebar with recents + prompt bar
- [x] Gallery (`/app/gallery`) — grid of user maps
- [x] Profile (`/app/profile`)
- [x] Sidebar navigation with recents

### Editor
- [x] Saved map editor (`/app/map/[id]`) — full editor with chat, layers, export
- [x] New map editor (`/app/map/new`) — prompt → generate → edit flow
- [x] Map persistence (Supabase) — CRUD, auto-save, versions
- [x] Export: PNG 1x/2x/4x, SVG, PDF (with title/attribution), GeoJSON
- [x] Sharing: public slugs (`/m/[slug]`), embed (`/m/[slug]/embed`)
- [x] Duplicate maps
- [x] Thumbnails (auto-generated)
- [x] Geocoder — Nominatim place search overlay on map
- [x] Measure tool — click-to-measure distance (km) and area (km²)
- [x] Compare view — side-by-side maps with draggable divider

### AI Pipeline
- [x] Map generation (`/api/ai/generate-map`) — Claude Sonnet 4.5, 14 map families
- [x] Streaming chat agent (`/api/ai/chat`) — conversational editing with tools
- [x] Prompt enhancement (`/api/ai/enhance-prompt`)
- [x] Clarification flow (`/api/ai/clarify`)
- [x] Edit map API (`/api/ai/edit-map`)
- [x] Agent prompt (`agent-prompt.ts`)
- [x] Client hook (`use-agent-chat.ts`) — SSE streaming, tool call UI
- [x] ChatPanel — streaming text, tool chips, stop button
- [x] Chat history persistence (JSONB column on maps table)

### AI Tools (agent can call these)
- [x] `update_manifest` — apply manifest changes
- [x] `search_data` — search Eurostat, World Bank, PxWeb catalogs
- [x] `search_poi` — Overpass API for POIs
- [x] `search_web` — web dataset search
- [x] `fetch_url` — download + cache arbitrary URLs
- [x] `parse_dataset` — profile cached datasets
- [x] `snap_to_roads` — OSRM Match API for road-snapped routes

### Data Sources
- [x] Geometry registry — 190+ country GeoJSON files (municipalities, districts, admin2)
- [x] Eurostat, PxWeb, Data Commons, World Bank adapters
- [x] SDMX client
- [x] Web dataset search
- [x] Official stats resolver
- [x] Geography plugins (per-country geometry resolution)

### Map Rendering
- [x] Manifest compiler — 14 families: point, cluster, choropleth, heatmap, proportional-symbol, flow, isochrone, extrusion, animated-route, timeline, hexbin, hexbin-3d, screen-grid, trip
- [x] Turf transforms — buffer, voronoi, convex-hull, centroid, simplify, dissolve (preprocessing step before compilation)
- [x] Basemap layers — hillshade, nightlights, land mask, terrain, tectonic plates, contour lines
- [x] H3 hexagonal binning — points → H3 cells → polygon fill layers with aggregation (count/sum/mean/max/min)
- [x] deck.gl overlay — HexagonLayer (3D), ScreenGridLayer, TripsLayer via dynamic import (~200KB on demand)
- [x] Timeline playback (`use-timeline-playback.ts`) — play/pause/scrub, variable speed (0.5x–4x), keyboard shortcuts
- [x] Route animation (`use-route-animation.ts`) — animated marker along LineString
- [x] Image fills (`use-image-fills.ts`) — fill polygons with images (flags, logos)
- [x] Chart overlays — mini bar/pie/sparkline charts at feature centroids
- [x] Playback bar UI (`timeline-playback-bar.tsx`) — speed selector, range slider, step counter
- [x] Arc interpolator — Bezier <500km, great circle ≥500km
- [x] Contour lines — maplibre-contour with AWS Terrain Tiles DEM source

### Showcase Maps
- [x] Disasters/earthquakes (`/disasters`) — live USGS feed
- [x] Explore page (`/explore`) — public map discovery

### Data APIs
- [x] Earthquakes, flights, citybikes, heritage, ISS, volcanoes, wildfires
- [x] Isochrone (OpenRouteService)
- [x] World cities, world countries, admin1, SE municipalities
- [x] Overpass API proxy
- [x] Cached geo proxy

### Infrastructure
- [x] Supabase: profiles, maps, versions, RLS policies
- [x] Middleware: auth session refresh, protected routes
- [x] Cron: cleanup stale data (`/api/cron/cleanup`)
- [x] Vercel deployment config

---

## What's Not Built Yet

### High Priority
- [ ] **Onboarding flow** — first-time user experience, guided tour
- [ ] **Error states** — empty states, error boundaries, offline handling
- [ ] **Mobile responsive** — editor and hub are desktop-only
- [ ] **Real usage analytics** — track map creation, sharing, user retention
- [ ] **Rate limiting** — AI endpoints lack production-grade rate limits
- [ ] **Billing integration** — Stripe for Pro tier (pricing page exists but no checkout)

### Medium Priority
- [ ] **Docs site** (`/docs`) — user documentation, API reference
- [ ] **Blog** (`/blog`) — content marketing
- [ ] **Team workspaces** — Enterprise multi-user collaboration
- [ ] **SSO/SAML** — Enterprise auth
- [ ] **Custom data connectors** — Enterprise feature
- [x] **Map templates** — pre-built starting points (gallery for one-click map creation)
- [ ] **Undo/redo** — editor history beyond auto-save versions
- [ ] **Keyboard shortcuts** — editor-wide shortcuts (timeline has Space/arrows/+/- already)

### Lower Priority
- [ ] **Map comments/annotations** — collaborative review
- [ ] **Scheduled data refresh** — auto-update map data on interval
- [ ] **Custom basemap styles** — beyond the 3 themes
- [ ] **3D terrain** — MapLibre terrain exaggeration (contour lines already available as basemap overlay)
- [ ] **Print layout** — designed-for-print map export

---

## Design Principles

### UI/UX
1. **Dark, editorial aesthetic** — dark backgrounds, muted tones, serif headlines, monospace data. Think Bloomberg Terminal meets National Geographic.
2. **Data is the hero** — basemaps are quieted (labels 25%, borders 15%, fills 60%). Map data layers dominate visually.
3. **Progressive disclosure** — landing page is simple (just a prompt bar). Complexity reveals itself as you go deeper.
4. **Glassmorphism** — sidebar and overlays use translucent backgrounds with blur.
5. **Minimal chrome** — no toolbar bloat. Most actions through the AI chat.

### Color System
- Sage green (`#8ecba0`) — primary brand color, CTAs
- Gold (`#d4a574`) — enterprise/premium accent
- Dark backgrounds (`#0d1217` → `#111820`)
- Light text (`#e4e0d8`), muted (`#908c85`), faint (`#5a5752`)

### Typography
- Georgia/serif for headlines and marketing copy
- Courier New/monospace for labels, data, and UI chrome
- Sans-serif for body text in the app (via Tailwind)
- 6 strict type utilities in map UI: `text-heading`, `text-title`, `text-body`, `text-caption`, `text-label`, `text-data`

### Interaction Model
- **Chat-first editing** — primary interaction is natural language via ChatPanel
- **Direct manipulation** — legend, timeline, zoom as secondary controls
- **Sidebar ↔ Map** — bidirectional: click sidebar item → fly to location; click map feature → highlight in sidebar

---

## Architecture Quick Reference

```
apps/web/              Next.js 14 App Router
├── app/
│   ├── (marketing)/   Landing, pricing, use-cases, enterprise
│   ├── (maps)/        Disasters, create, smoke-test
│   ├── app/
│   │   ├── (hub)/     Home, gallery, profile
│   │   └── (editor)/  Map editor (new + saved)
│   ├── m/             Public shared maps
│   ├── auth/          Login, signup, callback
│   ├── explore/       Public map discovery
│   └── api/           All API routes
├── components/        Shared React components
├── lib/
│   ├── ai/            AI pipeline, system prompt, validators, tools
│   ├── auth/          Auth context, helpers
│   └── hooks/         Custom hooks (use-agent-chat, etc.)

packages/
├── data-models/       MapManifest, GeoEntity, classification, palettes
├── map-core/          Manifest compiler, MapShell, all rendering hooks
├── map-modules/       Legend, Timeline, DetailPanel, PlaybackBar, ChartOverlay
└── ui/                Design tokens, Tailwind config, shared primitives
```

**Core constraint:** AI generates `MapManifest` objects, never raw MapLibre code. The manifest compiler is the only path to MapLibre.

---

## Key Decisions Log

| Decision | Rationale |
|----------|-----------|
| MapManifest as intermediate format | Decouples AI from rendering. AI can't break the map. |
| 14 map families (7 core + 7 extended) | Constrains AI output to validated patterns. Hexbin/deck.gl families use dynamic imports. |
| Chat-first editing (not form-based) | Lower friction. Users describe what they want. |
| Supabase for persistence | Managed Postgres + Auth + RLS. No infra to manage. |
| Client-side MapLibre (not server-rendered) | Interactive maps need client JS. SSR adds complexity. |
| Dark editorial aesthetic | Differentiates from Google Maps / Mapbox Studio. |
| Monorepo with Turborepo | Share types and components. Single CI pipeline. |
| GeoJSON files in `/public/geo/` | Simple, cacheable. No tile server needed at this scale. |
