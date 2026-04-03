<!-- last-reviewed: 2026-04-02 -->
# Atlas — Complete Application Flow

## Architecture Overview

```
Next.js 14 (App Router) + MapLibre GL JS + Supabase + Anthropic Claude API
Turborepo monorepo
```

---

## Auth States

| State | Cookie/Token | Can Generate | Can Save | Can Share |
|-------|-------------|-------------|---------|----------|
| **Anonymous** | None | 1 free map (localStorage counter) | ❌ | ❌ |
| **Logged in (Free)** | Supabase session | 5 maps total | ✅ | ✅ (public only) |
| **Logged in (Pro)** | Supabase session | Unlimited | ✅ | ✅ (public + private) |
| **Enterprise** | Supabase session + org | Unlimited | ✅ | ✅ + team workspaces |

---

## Route Map

```
MARKETING (public, no auth)
├── /                     → Landing page
├── /use-cases            → Use cases page
├── /pricing              → Pricing page
├── /enterprise           → Enterprise page
├── /docs                 → Documentation (future)
├── /blog                 → Blog (future)
│
AUTH
├── /auth/login           → Email + Google + GitHub OAuth
├── /auth/signup          → Same UI, different tab/mode
├── /auth/callback        → Supabase OAuth callback
│
APP (auth-aware, not auth-required)
├── /app                  → Home (map hub + sidebar)
├── /app/gallery          → Gallery (all user maps)
├── /app/new              → Redirect → /app with prompt focused
│
EDITOR (auth-aware)
├── /app/map/[id]         → Editor for saved map
├── /app/map/new          → Editor for unsaved map (anonymous OK)
│
SHARED MAPS (public)
├── /m/[slug]             → Public shared map (read-only, interactive)
├── /m/[slug]/embed       → Embeddable iframe version
```

---

## Complete Click-by-Click Flows

### FLOW 1: First-time visitor → Generate without login

```
1. User lands on /
2. Sees: hero with cycling map backgrounds + prompt bar
3. Types prompt: "Coffee shops in Stockholm"
4. Clicks [Generate Map]
   │
   ├─ localStorage check: has_generated_free_map?
   │  ├─ NO → continue
   │  └─ YES → show auth modal "Sign up to keep generating"
   │
5. Redirect → /app/map/new?prompt=Coffee+shops+in+Stockholm
6. Editor loads with:
   - Prompt visible in left panel "Generate from prompt"
   - Loading state: "Generating..." with step indicators
   - API call: POST /api/generate-map { prompt, anonymous: true }
   - Claude processes → returns MapManifest (layers, sources, style)
7. Map renders in editor (full interactive, all controls work)
8. localStorage: set has_generated_free_map = true
9. After 10 seconds OR on any save/share/export action:
   - Slide-up modal: "Sign up to save this map"
   - [Continue with Google] [Continue with GitHub] [Email]
   - Small link: "Continue exploring" (dismisses, but map is lost on refresh)
```

### FLOW 2: Sign up / Login

```
1. User clicks [Get Started] (nav) OR [Sign in] OR modal CTA
2. Route → /auth/login (or modal overlay, TBD)
3. UI shows:
   ┌─────────────────────────────┐
   │  ● Atlas                     │
   │                              │
   │  Welcome to Atlas            │
   │                              │
   │  [Continue with Google]      │
   │  [Continue with GitHub]      │
   │                              │
   │  ── or ──                    │
   │                              │
   │  Email: [____________]       │
   │  [Send magic link]           │
   │                              │
   │  Already have an account?    │
   │  Sign in                     │
   └─────────────────────────────┘
4. Supabase Auth handles:
   - Google OAuth → /auth/callback → redirect
   - GitHub OAuth → /auth/callback → redirect
   - Magic link → email sent → user clicks → /auth/callback
5. On success:
   - If came from editor with unsaved map:
     → save map to Supabase → redirect to /app/map/[new-id]
   - If came from landing/nav:
     → redirect to /app (home)
   - If came from pricing:
     → redirect to /app (home) with plan selection
```

### FLOW 3: Logged-in user → Home

```
1. User navigates to /app (or redirected after login)
2. Page loads:
   - Sidebar (glassmorphism):
     ├─ ● Atlas logo (click → /app)
     ├─ ◎ Home (active)
     ├─ ▦ Gallery (click → /app/gallery)
     ├─ RECENTS
     │  ├─ [EU GDP per capita]     → click → /app/map/abc123
     │  ├─ [Coffee shops Tokyo]    → click → /app/map/def456
     │  ├─ [Seismic risk Pacific]  → click → /app/map/ghi789
     │  └─ ...
     ├─ [+ New map]                → click → focus prompt bar
     └─ User: Arvid (Free plan)
        └─ [log out]               → Supabase signOut → /
   - Main area:
     ├─ Full-screen EU map (interactive, hover tooltips)
     └─ Floating prompt bar (bottom center)
         ├─ Input: "Describe your next map..."
         ├─ [GENERATE] button (gold when text entered)
         └─ Suggestion pills: [Earthquake risk...] [Coffee shops...]
3. User types prompt + clicks GENERATE
   → redirect to /app/map/new?prompt=...
```

### FLOW 4: Editor (saved map)

```
1. User clicks a map from Recents/Gallery → /app/map/[id]
2. Supabase fetch: maps table WHERE id = [id] AND user_id = auth.uid()
3. Editor loads:
   ┌─ Top bar ──────────────────────────────────────────┐
   │ ● Atlas │ Project name │ Interactive│Presentation │ Export ↓ │ Share │
   └────────────────────────────────────────────────────┘
   ┌─ Left panel ─┬─ Map canvas ──────────┬─ Right panel ─┐
   │ Layers       │                       │ Style          │
   │ • Layer 1  ✓ │   [Full MapLibre]     │ Theme swatches │
   │ • Layer 2  ✓ │                       │ Data source    │
   │ • Layer 3    │   hover → tooltip     │ Opacity        │
   │              │                       │ Output format  │
   │              │   Legend (bottom-left) │ Toggles        │
   │              │   Zoom (bottom-right)  │                │
   │ ✦ Generate   │                       │                │
   └──────────────┴───────────────────────┴────────────────┘

4. Interactions:
   - Click layer → toggle visibility (updates MapLibre layer)
   - Click theme swatch → change map style (updates all layers)
   - Click "✦ Generate from prompt" → textarea opens
     - Type refinement → click "Generate →"
     - API call: POST /api/refine-map { mapId, prompt, currentManifest }
     - Claude returns updated manifest → map re-renders
   - "Interactive / Presentation" toggle:
     - Interactive: all panels visible, hover enabled
     - Presentation: panels hidden, clean map only, legend visible
   - "Export ↓":
     - Dropdown: [PNG] [SVG] [PDF] [GeoJSON]
     - Client-side for PNG/SVG (canvas export)
     - Server-side for PDF (Puppeteer render)
   - "Share":
     - Modal: "Share this map"
     - Toggle: Public / Private (Pro only)
     - Copy link: atlas.app/m/[slug]
     - Embed code: <iframe src="atlas.app/m/[slug]/embed">
   - Atlas logo → /app (home)
   - Project name → editable (click to rename, blur to save)
```

### FLOW 5: Gallery

```
1. User clicks ▦ Gallery in sidebar → /app/gallery
2. Supabase fetch: maps table WHERE user_id = auth.uid() ORDER BY updated_at DESC
3. Grid of map cards:
   ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
   │ map  │ │ map  │ │ map  │ │  +   │
   │ thumb│ │ thumb│ │ thumb│ │ NEW  │
   │ Title│ │ Title│ │ Title│ │ MAP  │
   │ Type │ │ Type │ │ Type │ │      │
   └──────┘ └──────┘ └──────┘ └──────┘
4. Click card → /app/map/[id]
5. Click [+ NEW MAP] → /app (home, prompt focused)
6. Hover card → lift animation + brighter thumbnail
```

### FLOW 6: Shared map (public)

```
1. Anyone visits atlas.app/m/[slug]
2. Server fetch: maps table WHERE slug = [slug] AND is_public = true
3. Renders:
   - Full-screen MapLibre map (no panels)
   - Floating top bar: "● Atlas  |  Map title  |  [Open in Atlas]"
   - Legend (bottom-left)
   - Interactive hover/click on features
4. [Open in Atlas] →
   - If logged in → /app/map/[id] (opens in editor, creates copy if not owner)
   - If not logged in → /auth/login?redirect=/app/map/[id]
```

---

## Database Schema (Supabase)

```sql
-- Users (managed by Supabase Auth, extended with profile)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  org_id UUID REFERENCES organizations(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Maps
CREATE TABLE maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT DEFAULT 'Untitled map',
  slug TEXT UNIQUE,
  prompt TEXT,                          -- original user prompt
  manifest JSONB NOT NULL,             -- MapManifest: layers, sources, style config
  thumbnail_url TEXT,                  -- stored in Supabase Storage
  is_public BOOLEAN DEFAULT false,
  map_type TEXT,                       -- choropleth, cluster, heatmap, flow, etc.
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Map versions (history)
CREATE TABLE map_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id UUID REFERENCES maps(id) ON DELETE CASCADE,
  version INT NOT NULL,
  prompt TEXT,                         -- the refinement prompt
  manifest JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Organizations (enterprise)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  plan TEXT DEFAULT 'enterprise',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE maps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own maps" ON maps
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Public maps readable by anyone" ON maps
  FOR SELECT USING (is_public = true);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read/update own profile" ON profiles
  FOR ALL USING (auth.uid() = id);
```

---

## API Routes

```
POST /api/generate-map
  Body: { prompt: string, anonymous?: boolean }
  Auth: optional (anonymous gets 1 free)
  Returns: { mapId?: string, manifest: MapManifest }
  Flow:
    1. Validate prompt
    2. If anonymous: check rate limit (IP-based, 1/day)
    3. Send to Claude: system prompt + user prompt
    4. Claude returns MapManifest JSON
    5. If authenticated: save to maps table
    6. Return manifest

POST /api/refine-map
  Body: { mapId: string, prompt: string, currentManifest: MapManifest }
  Auth: required
  Returns: { manifest: MapManifest, version: number }
  Flow:
    1. Fetch current map + verify ownership
    2. Send to Claude: system prompt + current manifest + refinement prompt
    3. Claude returns updated MapManifest
    4. Save new version to map_versions
    5. Update maps table with latest manifest
    6. Return new manifest

POST /api/export-pdf
  Body: { mapId: string, options: ExportOptions }
  Auth: required (Pro+)
  Returns: PDF buffer
  Flow:
    1. Load map manifest
    2. Render with Puppeteer (headless MapLibre)
    3. Return PDF

GET /api/maps
  Auth: required
  Query: ?limit=20&offset=0
  Returns: { maps: Map[], total: number }

GET /api/maps/[id]
  Auth: required (owner) or public
  Returns: { map: Map, versions: MapVersion[] }
```

---

## MapManifest Schema (Claude output)

```typescript
interface MapManifest {
  // Metadata
  title: string;
  description: string;
  mapType: 'choropleth' | 'cluster' | 'heatmap' | 'flow' | 'proportional' | 'custom';

  // Map configuration
  center: [number, number];     // [lng, lat]
  zoom: number;
  bounds?: [[number, number], [number, number]];
  projection?: string;

  // Data sources
  sources: {
    id: string;
    type: 'geojson' | 'vector' | 'raster';
    url?: string;                // external source URL
    data?: GeoJSON.FeatureCollection;  // inline data
    attribution?: string;
  }[];

  // Layers (MapLibre layer specs)
  layers: {
    id: string;
    sourceId: string;
    type: 'fill' | 'circle' | 'line' | 'heatmap' | 'symbol';
    paint: Record<string, any>;  // MapLibre paint properties
    layout?: Record<string, any>;
    filter?: any[];
    visible: boolean;
  }[];

  // Style
  theme: 'clean' | 'muted' | 'warm' | 'vivid' | 'custom';
  colorScale: string[];          // hex colors for legend
  legend: {
    title: string;
    type: 'gradient' | 'categorical';
    items: { label: string; color: string; }[];
  };
}
```

---

## Component Tree

```
<AtlasApp>
├── <AuthProvider>                    (Supabase session context)
│
├── MARKETING PAGES (no auth)
│   ├── <Layout>                     (shared nav + footer)
│   │   ├── <Nav />                  (Atlas logo, links, Sign in / Get Started)
│   │   ├── <Landing />
│   │   ├── <UseCases />
│   │   ├── <Pricing />
│   │   ├── <Enterprise />
│   │   └── <Footer />
│   │
├── AUTH
│   ├── <AuthModal />                (overlay, used from anywhere)
│   └── <AuthPage />                 (full page, /auth/login)
│       ├── <GoogleAuthButton />
│       ├── <GitHubAuthButton />
│       └── <MagicLinkForm />
│
├── APP (auth-aware)
│   ├── <AppLayout>                  (sidebar + main area)
│   │   ├── <Sidebar>
│   │   │   ├── <Logo />
│   │   │   ├── <NavItem /> (Home)
│   │   │   ├── <NavItem /> (Gallery)
│   │   │   ├── <RecentMaps />
│   │   │   │   └── <MiniThumb /> × N
│   │   │   ├── <NewMapButton />
│   │   │   └── <UserMenu />
│   │   ├── <HomePage>              (/app)
│   │   │   ├── <MapBackground />   (EU SVG/MapLibre)
│   │   │   ├── <FloatingPrompt />
│   │   │   └── <HoverTooltip />
│   │   └── <GalleryPage>           (/app/gallery)
│   │       └── <MapCard /> × N
│   │
│   └── <EditorPage>                (/app/map/[id])
│       ├── <EditorToolbar />
│       │   ├── <Logo />
│       │   ├── <ProjectName />     (editable)
│       │   ├── <ModeToggle />      (Interactive / Presentation)
│       │   ├── <ExportButton />
│       │   └── <ShareButton />
│       ├── <LeftPanel>
│       │   ├── <LayersList />
│       │   │   └── <LayerItem /> × N
│       │   └── <GeneratePrompt />
│       ├── <MapCanvas>             (MapLibre GL JS)
│       │   ├── <HoverTooltip />
│       │   ├── <Legend />
│       │   └── <ZoomControls />
│       └── <RightPanel>
│           ├── <ThemeSwatches />
│           ├── <DataSourcePicker />
│           ├── <OpacitySlider />
│           ├── <OutputFormat />
│           └── <OptionToggles />
│
└── SHARED MAP (public, no auth)
    └── <SharedMapPage>             (/m/[slug])
        ├── <SharedMapBar />        (Atlas logo, title, "Open in Atlas")
        ├── <MapCanvas />           (read-only MapLibre)
        └── <Legend />
```

---

## State Management

```
Global (React Context):
├── AuthContext          → { user, session, loading, signIn, signOut }
├── MapsContext          → { recentMaps, refreshMaps }
│
Editor (local state per page):
├── mapManifest          → current MapManifest (from API)
├── layers               → visibility toggles
├── theme                → selected theme swatch
├── mode                 → "interactive" | "presentation"
├── hoveredFeature       → feature under cursor
├── generating           → loading state for AI calls
├── versions             → map version history
├── isDirty              → unsaved changes flag
│
Persistence:
├── Supabase             → maps, profiles, versions
├── localStorage         → has_generated_free_map (anonymous counter)
└── URL params           → ?prompt=... (for new map generation)
```

---

## Implementation Order

### Phase 1: Auth + Shell (Week 1)
1. Supabase project setup (already exists)
2. Auth: Google + GitHub OAuth + magic link
3. App layout: sidebar + routing (/app, /app/gallery, /app/map/[id])
4. Protected routes middleware
5. Profile table + RLS

### Phase 2: Map Generation (Week 2)
6. Claude API integration (POST /api/generate-map)
7. MapManifest schema + validation
8. MapLibre canvas component (renders from manifest)
9. Editor layout: 3-panel (left, map, right)
10. Basic layer toggles + theme switching

### Phase 3: Persistence (Week 3)
11. Maps table + CRUD
12. Save/load maps from Supabase
13. Gallery page with real data
14. Recent maps in sidebar
15. Map versioning (refine flow)

### Phase 4: Sharing + Export (Week 4)
16. Slug generation + public maps
17. /m/[slug] public viewer
18. PNG/SVG client-side export
19. PDF server-side export (Puppeteer)
20. Embed iframe support

### Phase 5: Marketing Pages (Week 5)
21. Landing page (port from prototype)
22. Use Cases, Pricing, Enterprise pages
23. Anonymous generation flow (1 free map)
24. Stripe integration for Pro plan

---

## Key Edge Cases

| Scenario | Behavior |
|----------|----------|
| Anonymous generates, then signs up | Map auto-saves to new account (pass manifest via session storage) |
| Anonymous generates second map | Auth modal: "Sign up to keep generating" |
| User hits Free plan limit (5 maps) | Soft block: "Upgrade to Pro for unlimited maps" |
| User opens someone else's public map | Read-only view, "Open in Atlas" → creates copy |
| User loses connection while editing | Auto-save draft to localStorage, sync on reconnect |
| Map generation fails (Claude error) | Retry with backoff, show friendly error |
| User switches theme mid-edit | Client-side only, update paint properties, no API call |
| Shared map link but map is private | 404 page: "This map is private" |
| Enterprise user with SSO | Redirect to org SSO provider, then back to /auth/callback |

---

## Claude System Prompts

### Map Generation System Prompt

```
You are Atlas, an AI cartography engine. The user describes a map they want.
You return a valid MapManifest JSON object — nothing else.

Rules:
1. Always pick the most appropriate map type for the data described
2. Use real-world geographic coordinates (lng/lat)
3. Include at least one data source with inline GeoJSON OR a public tile URL
4. Color scales should be perceptually uniform (no rainbow)
5. Include a legend with meaningful labels
6. Set appropriate zoom level and center for the data extent
7. Layer IDs must be unique and descriptive (e.g. "gdp-choropleth", not "layer1")

Available map types:
- choropleth: colored regions by value (use fill layer)
- cluster: point data grouped by proximity (use circle layer)
- heatmap: density visualization (use heatmap layer)
- flow: origin-destination lines (use line layer)
- proportional: sized symbols by value (use circle layer with data-driven radius)

Return ONLY valid JSON matching the MapManifest schema. No markdown, no explanation.
```

### Map Refinement System Prompt

```
You are Atlas. The user has an existing map and wants to modify it.

Current MapManifest:
{currentManifest}

User's refinement request: "{prompt}"

Rules:
1. Modify the existing manifest — don't rebuild from scratch
2. Preserve layers the user didn't mention
3. If adding a filter, keep the existing layers and add filter properties
4. If changing colors/theme, update paint properties only
5. If adding data, add a new source and layer — don't replace existing ones
6. Return the complete updated MapManifest (not a diff)

Return ONLY valid JSON. No markdown, no explanation.
```

---

## Loading & Transition States

Every state transition needs a defined loading experience. Never show a blank screen.

### Map Generation Loading Sequence
```
1. User clicks GENERATE
2. Button → spinner + "Generating..." (immediate)
3. Prompt bar disabled (grayed out)
4. Step indicators appear (one by one, 600ms apart):
   ├─ ○ Analyzing prompt...        → ● done ✓  (after ~1s)
   ├─ ○ Finding data sources...    → ● done ✓  (after ~2s)
   ├─ ○ Building map layers...     → ● done ✓  (after ~3s)
   └─ ○ Rendering...              → ● done ✓  (after API returns)
5. Map fades in (opacity 0→1, 400ms ease)
6. Panels slide in from sides (transform, 300ms ease)
7. Step indicators fade out (200ms)
```

### Page Transitions
```
Landing → Home:     fade out (200ms) → fade in (300ms)
Home → Editor:      sidebar persists, main area cross-fades (250ms)
Editor → Home:      panels slide out (200ms), map fades, sidebar slides in
Gallery → Editor:   card expands to fill screen (400ms, spring easing)
Any → Auth modal:   backdrop fades in (150ms), modal slides up (250ms)
```

### Skeleton Screens
```
Home (loading):     Sidebar with gray shimmer blocks, map area = dark with subtle pulse
Gallery (loading):  Grid of card skeletons (rounded rects with shimmer animation)
Editor (loading):   3-panel layout with gray blocks, center = MapLibre loading spinner
```

---

## Error States

### Map Generation Errors
```
Claude API timeout (>30s):
  → "Generation is taking longer than expected. Retry?"
  → [Retry] [Simplify prompt] buttons

Claude returns invalid JSON:
  → Silent retry (1x)
  → If still fails: "We couldn't generate that map. Try rephrasing your prompt."

Claude returns empty/no data:
  → "No geographic data found for this prompt. Try being more specific."
  → Show suggestion pills: "Add a region", "Specify a time period"

Rate limit (anonymous):
  → Auth modal: "Sign up for unlimited generations"

Rate limit (Free plan):
  → Upgrade modal: "You've used 5/5 maps. Upgrade to Pro."

Network error:
  → Toast: "Connection lost. Your work is saved locally."
  → Auto-retry when connection returns
```

### Map Rendering Errors
```
MapLibre fails to load tiles:
  → Fallback to basic OSM tiles
  → Toast: "Using fallback map tiles"

GeoJSON parsing error:
  → Skip invalid features, render what works
  → Console warning for debugging

WebGL context lost:
  → "Map renderer crashed. Refreshing..." → auto-reload MapLibre instance
```

---

## Animation Specifications

All animations must respect `prefers-reduced-motion`. Provide instant alternatives.

### Landing Page
```
City lights canvas:
  - 60 dots, each: pulse 0.2-0.55 Hz, base radius 3-9px
  - Glow radius: 6× base, amber color, opacity 0.45×pulse×size
  - Subtle drift: sin(time) × 0.8px
  - Performance: requestAnimationFrame, ~60fps target

Map carousel:
  - 4 maps cycling every 4s
  - Cross-fade: opacity transition 1.5s ease
  - No layout shift during transition

Hero text:
  - Stagger fade-in: 70ms delay between elements
  - translateY(14px→0) + opacity(0→1), 700ms ease

Typing placeholder:
  - 36ms per character
  - 2800ms pause at end
  - Cursor blink: 700ms step-end
```

### Editor
```
Layer toggle:
  - Dot color: 150ms ease
  - Check icon: opacity 150ms
  - MapLibre layer: visibility instant, opacity transition 300ms

Theme switch:
  - Swatch border: 120ms ease
  - Map paint properties: 500ms transition (MapLibre built-in)
  - Legend colors: 300ms ease

Hover tooltip:
  - Appear: opacity 0→1, 100ms, no delay
  - Disappear: opacity 1→0, 80ms
  - Position: follows cursor with 50ms debounce

Panel generate prompt:
  - Button → textarea: height transition 200ms ease
  - Textarea → button: height transition 150ms ease

Floating editor on landing ("Powerful, not complicated"):
  - Float: translateY(0→-8px→0), 8s ease-in-out, infinite
```

---

## Design Implementation Notes

When converting the prototype (docs/prototype/atlas.html) to Next.js:

### Improve freely
- Better responsive breakpoints (prototype is desktop-only, add tablet+mobile)
- Smoother animations (use Framer Motion instead of CSS keyframes)
- Accessibility (aria labels, keyboard nav, focus states, screen reader)
- Loading states and skeleton screens (see section above)
- Error boundaries and fallback UI
- Proper TypeScript types for all components and props
- Image optimization (next/image for any raster assets)
- Code splitting (dynamic imports for heavy components like MapLibre)

### Keep exactly as designed
- Color palette: sage #8ecba0, gold #d4a574, tinted backgrounds #0d1217→#111820→#182028
- Typography: Georgia serif for titles/headings, Courier New mono for labels/data
- Text colors: #e4e0d8 primary, #908c85 secondary, #5a5752 muted
- Border treatment: rgba(255,255,255,0.05) default, rgba(255,255,255,0.08) hover
- Glassmorphism on panels: backdrop-filter blur(24px), rgba(16,22,30,0.72)
- Layout: editor 230px side panels, map fills center
- Theme swatches: Clean (blue-teal), Muted (gray-teal), Warm (gold-brown), Vivid (bright blue)
- Floating prompt bar style with suggestion pills
- City lights canvas animation on landing hero
- Map carousel with cross-fade on landing
- SVG icons (not emoji) for use cases and enterprise pages
- Gold CTA buttons with subtle box-shadow glow
- Georgia italic for "think" in the hero headline

### Replace with real implementations
- SVG polygons → real MapLibre GL JS with vector tiles (e.g. MapTiler or Protomaps)
- Hardcoded US state grid → actual GeoJSON data with real state boundaries
- Fake layer toggles → real MapLibre setLayoutProperty('visibility')
- Static demo typing animation → real Claude API streaming response
- localStorage auth check → Supabase session with middleware
- Fake gallery data → Supabase query with real saved maps
- Placeholder thumbnails → server-generated map screenshots (Supabase Storage)
- Inline styles → Tailwind CSS classes (or CSS modules if preferred)

---

## Verification Checkpoints

After each phase, verify before moving on. Do NOT skip these.

### Phase 1: Auth + Shell ✓ checklist
```
□ Can sign up with Google OAuth → redirects to /app
□ Can sign up with GitHub OAuth → redirects to /app
□ Can sign up with magic link email → click link → /app
□ Can sign out → redirects to /
□ /app/* routes redirect to /auth/login when not authenticated
□ / and /pricing etc. work without auth
□ Sidebar renders with Atlas logo, Home, Gallery, user info
□ Sidebar "log out" works
□ Profile row exists in Supabase after signup
□ RLS prevents reading other users' profiles
□ Responsive: sidebar collapses on mobile
□ TypeScript: no type errors (npm run typecheck)
□ Build passes: npm run build
```

### Phase 2: Map Generation ✓ checklist
```
□ Can type prompt in Home → click GENERATE → loading sequence plays
□ Claude API called with correct system prompt
□ MapManifest JSON parsed and validated
□ MapLibre renders map from manifest (correct center, zoom, layers)
□ Editor 3-panel layout matches prototype proportions
□ Layer toggles work (click → MapLibre layer visibility changes)
□ Theme swatches work (click → map paint properties update)
□ Hover on map features → tooltip appears with data
□ "Interactive / Presentation" toggle works (panels show/hide)
□ Error state: invalid prompt → friendly error message
□ Error state: API timeout → retry option
□ Loading state: step indicators animate correctly
□ TypeScript: MapManifest type matches Claude output
□ No console errors during normal flow
```

### Phase 3: Persistence ✓ checklist
```
□ Generated map auto-saves to Supabase (maps table)
□ Gallery loads user's maps from Supabase
□ Click gallery card → opens correct map in editor
□ Sidebar "Recents" shows last 5 maps with thumbnails
□ Project name editable in editor toolbar → saves to DB
□ Map refinement creates new version (map_versions table)
□ Can undo to previous version
□ RLS: can only see own maps
□ isDirty flag prevents accidental navigation
□ Auto-save every 30s when dirty
□ Offline: draft saves to localStorage
□ Reconnect: syncs localStorage draft to Supabase
```

### Phase 4: Sharing + Export ✓ checklist
```
□ Share button → modal with toggle (public/private)
□ Public toggle generates slug, saves to DB
□ /m/[slug] renders read-only interactive map
□ /m/[slug]/embed renders clean iframe-friendly view
□ "Open in Atlas" on shared map → creates copy for logged-in user
□ "Open in Atlas" on shared map → auth redirect for anonymous
□ Export PNG works (client-side canvas)
□ Export SVG works (client-side)
□ Export PDF works (server-side Puppeteer)
□ Private map returns 404 for non-owner
□ SEO: shared maps have og:image meta tags
```

### Phase 5: Marketing Pages ✓ checklist
```
□ Landing page matches prototype (hero, demo, segments, gallery, editor, CTA)
□ City lights animation runs at 60fps
□ Map carousel cycles every 4s with cross-fade
□ Demo typing animation triggers on scroll (IntersectionObserver)
□ Interactive editor in "Powerful, not complicated" section works
□ Use Cases page: 6 cards with SVG icons, hover effects
□ Pricing page: 3 tiers, FAQ accordion, correct links
□ Enterprise page: features grid, comparison table, gold accents
□ All nav links work across all pages
□ Footer links work
□ Anonymous user: can generate 1 map from landing prompt
□ Anonymous user: auth modal after save attempt
□ Responsive: all pages work on mobile
□ Lighthouse: performance >90, accessibility >90
```

---

## Performance Budgets

```
Landing page:
  - First Contentful Paint: <1.5s
  - Largest Contentful Paint: <2.5s
  - Total JS bundle: <200KB gzipped (excl. MapLibre)
  - City lights canvas: <5% CPU at idle

Editor:
  - MapLibre load: <2s (with vector tiles cached)
  - Theme switch: <100ms (no API call)
  - Layer toggle: <50ms (MapLibre setLayoutProperty)
  - Map generation: <15s (Claude API + render)
  - Auto-save: debounced 30s, <200ms Supabase write

General:
  - MapLibre GL JS: lazy load (dynamic import, only on /app/* routes)
  - Images: WebP with next/image, max 100KB per thumbnail
  - Fonts: Georgia + Courier New are system fonts → zero font load
```

---

## SEO & Meta Tags

```
/ (Landing):
  title: "Atlas — AI-Driven Cartography"
  description: "Describe a map, get a map. Atlas uses AI to find data, pick projections, and render interactive maps."
  og:image: /og/landing.png (generated screenshot of hero)

/use-cases:
  title: "Use Cases — Atlas"
  description: "From research to business intelligence. See how teams use Atlas."

/pricing:
  title: "Pricing — Atlas"
  description: "Start free. Upgrade when you need more maps, private sharing, and PDF export."

/enterprise:
  title: "Enterprise — Atlas"
  description: "SSO, custom connectors, dedicated support. Atlas for your whole organization."

/m/[slug] (Shared map):
  title: "{map.title} — Atlas"
  description: "{map.description}"
  og:image: {map.thumbnail_url} (server-generated map screenshot)
```

---

## Mobile Considerations

```
Breakpoints:
  - Desktop: ≥1024px (full layout as prototyped)
  - Tablet: 768-1023px (sidebar collapsible, panels as bottom sheets)
  - Mobile: <768px (no sidebar, bottom nav, panels as full-screen overlays)

Editor on mobile:
  - Map fills screen
  - Bottom tab bar: [Layers] [Style] [Generate]
  - Tap tab → full-screen bottom sheet slides up
  - Swipe down to dismiss

Home on mobile:
  - No sidebar — bottom nav with Home/Gallery/Profile
  - Prompt bar fixed at bottom (like mobile search)
  - Recents as horizontal scroll cards

Landing on mobile:
  - Single column, no grid
  - Hero: text above, editor preview below (scrollable)
  - City lights: reduce to 20 dots for performance
  - Demo section: full width, chat panel below map
```

---

## Accessibility Requirements

```
WCAG 2.1 AA compliance target.

Keyboard navigation:
  - Tab through all interactive elements in logical order
  - Enter/Space to activate buttons and toggles
  - Escape to close modals and panels
  - Arrow keys to navigate layer list
  - Ctrl+S to save (when in editor)

Screen reader:
  - All images/icons have aria-labels
  - Map: aria-live region announces hover data
  - Loading states: aria-busy="true" on container
  - Modal: focus trap, aria-modal="true"
  - Layer toggles: role="switch", aria-checked

Color contrast:
  - Primary text (#e4e0d8) on bg (#0d1217): ratio 11.2:1 ✓
  - Secondary text (#908c85) on bg (#0d1217): ratio 5.1:1 ✓
  - Muted text (#5a5752) on bg: ratio 2.8:1 — decorative only, not for essential info
  - Gold button (#d4a574) text (#0d1217): ratio 7.4:1 ✓

Focus indicators:
  - 2px solid sage (#8ecba0) outline with 2px offset
  - Visible on all interactive elements
  - Not suppressed by outline:none (only on mouse, :focus-visible)

Reduced motion:
  - All animations wrapped in @media (prefers-reduced-motion: no-preference)
  - City lights: static dots (no pulse)
  - Map carousel: instant switch (no cross-fade)
  - Floating editor: no float animation
```

---

## Testing Strategy

```
Unit tests (Vitest):
  - MapManifest validation (valid/invalid JSON)
  - Color scale generation
  - Slug generation
  - Auth state helpers

Integration tests (Playwright):
  - Sign up flow (all 3 methods)
  - Generate map from prompt → verify map renders
  - Save map → reload → verify it loads
  - Share map → open public link → verify it renders
  - Anonymous flow: generate → auth modal → sign up → map saved

Visual regression (Playwright screenshots):
  - Landing page (desktop + mobile)
  - Editor (with map loaded)
  - Gallery (with 5+ maps)
  - Each marketing page

E2E smoke tests (run on deploy):
  - Can reach / → 200
  - Can reach /app → redirects to /auth/login
  - Can reach /m/test-slug → 200 or 404
  - Claude API responds within 30s
  - Supabase connection healthy
```

---

## Design Improvements (implement during or after Phase 1-5)

### Landing Page Polish

**Scroll-triggered reveals**
Currently everything loads at once. Each section should animate in on scroll:
```
IntersectionObserver with threshold 0.15:
  - Section enters viewport → stagger children in (50ms delay each)
  - Use Framer Motion's whileInView for clean implementation
  - Only animate once (not re-trigger on scroll back)
```

**Demo section — make it feel real, not scripted**
The current typing animation is obviously fake. Improve:
```
- Add random typing speed variation (25-50ms per char, not constant 30ms)
- Occasional "pause to think" (200ms gap mid-word)
- Cursor should blink during pauses
- Map countries should render with slight stagger (not all at once)
- Chat messages should appear with a typing indicator ("..." dots) before text
- After the loop completes, show a subtle "See it live →" CTA that links to /app
```

**Social proof section (add between segments and use cases)**
```
"Trusted by 2,400+ map makers"
- Scrolling logo bar (subtle, grayscale, not obnoxious)
- 3 testimonial cards with:
  - Quote (1-2 sentences)
  - Name, role, company
  - Mini map thumbnail they created
- Auto-scroll or manual dots
```

**Landing page CTA improvements**
```
The "Generate Map" button in hero should have:
- Subtle gold pulse animation (box-shadow breathing)
- On hover: slightly larger shadow + cursor pointer
- On click: press-down effect (scale 0.98)
- After typing: button transitions from ghost to solid gold (300ms)
  (currently it snaps — should be smooth)
```

### Editor UX Improvements

**Command palette (Cmd+K / Ctrl+K)**
Like Figma, Linear, VS Code. Power-user feature:
```
Trigger: Cmd+K or click search icon in toolbar
Shows: modal overlay with search input
Options:
  - "Change theme to warm" → instant theme switch
  - "Add heatmap layer" → AI generates new layer
  - "Export as PDF" → triggers export
  - "Toggle labels" → flips auto-labels
  - "Center on Europe" → map.flyTo()
  - "Share publicly" → opens share modal
  - Recent prompts shown below search
  - Fuzzy search matching
```

**Undo/Redo with visual timeline**
```
- Cmd+Z / Cmd+Shift+Z for quick undo/redo
- Click clock icon in toolbar → opens version timeline
- Timeline shows:
  ├─ 14:32 — "Added population layer"
  ├─ 14:28 — "Changed theme to Vivid"
  ├─ 14:25 — "Generated: EU wind energy"
  └─ 14:25 — Map created
- Click any version → map reverts (with smooth transition)
- "Restore this version" button
- Powered by map_versions table (already in schema)
```

**AI chat panel (instead of just "Generate from prompt")**
The current "Generate from prompt" opens a small textarea. Replace with proper chat:
```
Left panel bottom section becomes collapsible chat:
  ├─ Chat history with the map
  │  ├─ You: "European wind energy by region"
  │  ├─ Atlas: Choropleth generated · 12 countries
  │  ├─ You: "Show only above 10GW"
  │  ├─ Atlas: Filtered · 7 countries
  │  └─ You: "Make Denmark stand out"
  │
  ├─ Input bar at bottom (always visible)
  │  └─ "Refine this map..." [Send]
  │
  └─ Suggestions when empty:
     ├─ "Add city labels"
     ├─ "Change color scale"
     └─ "Filter by value"

Benefits:
  - Users see conversation history (context)
  - Feels like ChatGPT but for maps
  - Each message = a map version (undo = scroll up)
```

**Map interaction improvements**
```
- Click feature (not just hover) → detail panel slides in from right
  Shows: all data properties, link to source, "Focus on this region" button
  
- Right-click context menu:
  ├─ "What is this?" → AI explains the data point
  ├─ "Zoom to fit" → flyTo bounds
  ├─ "Hide this layer" → toggle
  ├─ "Copy coordinates" → clipboard
  └─ "Add annotation" → text marker (future)

- Double-click → zoom in smoothly
- Scroll to zoom (with Ctrl/Cmd modifier to prevent accidental)
- Pinch to zoom on touch devices
```

**Presentation mode improvements**
```
Currently just hides panels. Make it a real presentation tool:
- Fullscreen (F11 or button)
- Map title + subtle Atlas watermark
- Legend auto-positioned (not overlapping data)
- Keyboard shortcuts: arrow keys to pan, +/- to zoom
- "Spotlight" mode: click a region → everything else dims
- Auto-play: slowly pans across the map (configurable speed)
- QR code overlay (for sharing link in presentations)
```

### Home View Improvements

**Onboarding for new users**
First time on /app, show a 3-step walkthrough:
```
Step 1: "Describe any map" → prompt bar glows
Step 2: "Atlas generates it" → show mini demo
Step 3: "Refine, share, export" → show editor preview
[Skip] [Next →]

After dismissal, show suggestion cards instead of empty state:
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Try this:    │ │ Try this:    │ │ Try this:    │
│ "Population  │ │ "Sales by    │ │ "Earthquake  │
│  of Europe"  │ │  US state"   │ │  risk map"   │
│ [Generate]   │ │ [Generate]   │ │ [Generate]   │
└──────────────┘ └──────────────┘ └──────────────┘
```

**Quick actions on map cards**
Hover a recent map in sidebar → show action icons:
```
[Open] [Duplicate] [Share] [Delete]
- Open: navigate to editor
- Duplicate: POST /api/maps/[id]/duplicate → new map
- Share: quick toggle public/private
- Delete: confirm modal → soft delete
```

### Global Design Refinements

**Micro-interactions that feel premium**
```
All buttons:
  - Hover: translateY(-1px) + subtle shadow increase (100ms)
  - Active: translateY(0) + shadow decrease (50ms)
  - Never just color change — always physical movement

Toggle switches:
  - Thumb has subtle shadow that grows on hover
  - Track color transitions smoothly (200ms)
  - Add tiny haptic on mobile (navigator.vibrate(5))

Navigation links:
  - Underline slides in from left on hover (not instant appear)
  - Active page: persistent underline in sage

Cards (gallery, use cases):
  - Hover: lift 3px + shadow expands + border lightens
  - Thumbnail: subtle zoom (scale 1.02) inside overflow:hidden
  - Transition: 200ms ease-out

Modals:
  - Backdrop: fade in 150ms
  - Modal: slide up from 20px + opacity, 250ms spring easing
  - Close: reverse at 0.7× speed (feels snappier)
```

**Toast notifications**
```
Position: bottom-center, 80px from bottom
Style: glassmorphism pill (same as panels)
Content: icon + short message
Timing: appear (slide up 200ms) → stay 3s → dismiss (fade 150ms)
Types:
  - Success: sage dot + "Map saved"
  - Error: red dot + "Failed to save. Retry?"  
  - Info: blue dot + "Link copied to clipboard"
  - Loading: spinner + "Exporting PDF..."
```

**Empty states**
Every empty state should feel intentional:
```
Gallery (no maps):
  Abstract map outline illustration with sage accent
  "Your maps will appear here"
  [Create your first map →]

Search (no results):
  "No maps match '[query]'"
  [Clear search]

Shared map (404):
  "This map doesn't exist or is private"
  [Go to Atlas →]
```

---

## Value-Creating Features (Post-Launch Roadmap)

### Phase 6: Templates & AI Chat (Month 2)

**Templates gallery**
```
Route: /app/templates (tab in sidebar)

Categories:
├── Business
│   ├─ "Sales by region" (US choropleth, sample data)
│   ├─ "Market expansion" (multi-country comparison)
│   └─ "Store locator" (cluster map with markers)
├── Research
│   ├─ "Survey results" (choropleth + demographics)
│   ├─ "Field study sites" (point map + data cards)
│   └─ "Climate data" (heatmap with time slider)
├── Journalism
│   ├─ "Election results" (county-level choropleth)
│   ├─ "Crisis tracker" (timeline + map)
│   └─ "Migration flow" (flow arrows)
└── Education
    ├─ "World geography" (labeled countries)
    └─ "Natural disasters" (heatmap overlay)

UX:
- Click template → copy to user's maps → editor opens
- Template has sample data + prompts pre-filled
- User can immediately modify via AI chat
- "Remix" counter on popular templates (social proof)
```

**AI chat in editor (replaces "Generate from prompt")**
Described above in Editor UX Improvements. This is the core differentiator — "ChatGPT but for maps."

### Phase 7: Data Connectors (Month 2-3)

**Problem**: users have data in spreadsheets, not GeoJSON.

```
"Add data" button in editor:
├── Upload file
│   ├─ CSV (auto-detect lat/lng or country/city columns)
│   ├─ Excel (.xlsx)
│   ├─ GeoJSON (direct use)
│   └─ Shapefile (.shp + .dbf)
├── Paste URL
│   ├─ Public API endpoint (auto-fetch)
│   ├─ Google Sheets link (auto-refresh)
│   └─ Supabase table URL (live connection)
├── Connect database (Pro+)
│   ├─ PostgreSQL
│   ├─ Supabase project
│   └─ Google BigQuery (OAuth)
└── Built-in datasets (free)
    ├─ World countries (boundaries + population + GDP)
    ├─ US states + counties
    ├─ EU NUTS regions
    ├─ Global cities (pop > 100k)
    └─ Natural Earth (coastlines, rivers, lakes)

AI magic:
  User uploads sales.csv with: "City", "Revenue", "Q4_Growth"
  Atlas AI:
    1. Detects "City" → geocodes all cities
    2. Detects "Revenue" → suggests proportional symbol
    3. Detects "Q4_Growth" → suggests diverging color layer
    4. Generates MapManifest automatically
    5. Map renders in <10 seconds after upload
```

### Phase 8: Collaboration (Month 3-4)

```
Real-time collaboration (enterprise):
- Share editor link → multiple cursors (like Figma)
- Each user has colored cursor + name label
- Conflict resolution: last write wins, merge on layers
- Comments on map regions:
  - Click map → "Add comment" → pin drops
  - Thread-based, @mentions → email notification
- Activity feed in sidebar
- Powered by Supabase Realtime
```

### Phase 9: Analytics & Embedding (Month 4)

```
Route: /app/map/[id]/analytics

Shows:
- Views over time (line chart)
- Unique visitors
- Average time on map
- Most clicked regions (meta-heatmap)
- Embed locations (which sites)
- Viewer geography

Embed improvements:
- Customizable: size, theme, interactive/static, legend on/off
- oEmbed support (auto-embed in Notion, WordPress)
- React component: npm install @atlas/embed
```

### Phase 10: Map Stories & Scrollytelling (Month 5)

**This is the killer feature that no competitor has.**

```
Route: /app/story/[id]

A "story" = ordered sequence of map states:
├── Scene 1: "Europe in 2020" → EU choropleth, GDP data
│   Text: "In 2020, the economic landscape..."
├── Scene 2: "Pandemic impact" → red overlay, new data
│   Text: "GDP contracted sharply..."
├── Scene 3: "Recovery 2023" → animation to new values
│   Text: "By 2023, most countries recovered..."
└── Scene 4: "Outlook 2025" → zoom out, projection
    Text: "Looking ahead..."

Creation UX:
- Editor: "Create story" button
- Add scenes (each = saved map state)
- Add text panels (markdown, left/right/overlay)
- Set transitions (fly-to, fade, zoom, data morph)
- Publish: /s/[slug] → scrollytelling page

Target users: journalists, researchers, NGOs
Monetization: Pro feature, or separate "Atlas Stories" plan
```

### Phase 11: Public API & Integrations (Month 5+)

```
POST /api/v1/maps/generate
  Auth: Bearer {api_key}
  Body: { prompt, options: { theme, format, size } }
  Returns: { map_id, manifest, image_url, embed_url }

Use cases:
- CI/CD: generate map from latest data on deploy
- Slack bot: "/atlas sales by region" → map image
- Zapier/Make: form submission → map generation
- Scheduled: cron → weekly sales map → email PDF

Pricing:
  Free: 10 API calls/month
  Pro: 500/month
  Enterprise: unlimited + priority
```

---

## Feature Priority Matrix

| Feature | User Value | Effort | Phase | Month |
|---------|-----------|--------|-------|-------|
| AI chat in editor | Very high — core differentiator | Low | 6 | 2 |
| Templates gallery | High — removes blank canvas fear | Medium | 6 | 2 |
| CSV/Excel upload | Very high — instant value | Medium | 7 | 2 |
| Command palette | Medium — power user retention | Low | 6 | 2 |
| Built-in datasets | High — zero-friction start | Low | 7 | 2 |
| Undo/redo timeline | Medium — expected feature | Medium | 7 | 3 |
| Database connectors | High for enterprise | High | 7 | 3 |
| Comments on maps | Medium — team use | Medium | 8 | 3 |
| Real-time collab | High for enterprise | High | 8 | 4 |
| Map analytics | Medium — retention | Medium | 9 | 4 |
| Embed improvements | Medium — distribution | Low | 9 | 4 |
| Map stories | Very high — unique | High | 10 | 5 |
| Public API | High — developer ecosystem | Medium | 11 | 5 |
| Presentation mode | Medium — enterprise | Medium | 6 | 2 |
| Onboarding flow | High — activation rate | Low | 6 | 2 |
