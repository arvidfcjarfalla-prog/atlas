<!-- last-reviewed: 2026-04-02 -->
# Map Platform Specification

Operational specification for all maps built on the Atlas platform. Every map page must follow this architecture, interaction model, and design system.

---

## Platform Architecture

Atlas is a Turborepo monorepo with five packages:

```
atlas/
├── apps/web/            Next.js 14 app. Map pages live under app/(maps)/.
├── packages/ui/         Design system tokens, Tailwind config, shared components.
├── packages/map-core/   MapLibre engine: viewport, controls, layer management.
├── packages/map-modules/ Pluggable UI modules: detail panel, timeline, legend.
└── packages/data-models/ Shared types: GeoEntity, Severity, MapManifest.
```

**Dependency graph:**
```
apps/web
├── @atlas/map-core     (depends on data-models, ui)
├── @atlas/map-modules  (depends on data-models, ui)
├── @atlas/data-models  (no internal deps)
└── @atlas/ui           (no internal deps)
```

### Key Primitives

| Primitive | Package | File | Purpose |
|-----------|---------|------|---------|
| `MapManifest` | data-models | `manifest.ts` | Declarative config for a map product |
| `GeoEntity` | data-models | `entities/base.ts` | Universal entity shape (coordinates, severity, properties) |
| `MapShell` | map-core | `map-shell.tsx` | Top-level container: theme + layout + viewport |
| `MapViewport` | map-core | `map-viewport.tsx` | MapLibre GL initialization + basemap quieting |
| `useMapLayers` (v1) | map-core | `use-map-layers.ts` | GeoJSON source + multi-layer rendering + interactions |
| `useManifestRenderer` (v2) | map-core | `use-manifest-renderer.ts` | Compiles manifest + adds layers + handles interactions |
| `compileLayer` (v2) | map-core | `manifest-compiler.ts` | Pure function: layer definition + data -> MapLibre specs |
| `useBasemapLayers` (v2) | map-core | `use-basemap-layers.ts` | Terrain, hillshade, nightlights, overlays |
| `MapControls` | map-core | `map-controls.tsx` | Zoom + geolocation buttons |
| `SidebarLayout` | ui | `layout/sidebar-layout.tsx` | 3-column responsive layout |
| `DetailPanel` | map-modules | `detail-panel/detail-panel.tsx` | Inspector panel for selected entity |
| `Timeline` | map-modules | `timeline/timeline.tsx` | Density bar + time window picker |
| `Legend` | map-modules | `legend/legend.tsx` | Color legend with optional filter toggle |

---

## Rendering Flow

Every map page follows this rendering pipeline:

```
MapShell                          sets data-theme on root div
  └─ SidebarLayout                3-column flex: sidebar | main | panel
      ├─ sidebar slot             scrollable list (e.g., earthquake list)
      ├─ main slot
      │   └─ MapViewport          initializes MapLibre GL, provides MapContext
      │       ├─ <div>            map canvas (position: absolute, inset: 0)
      │       ├─ useMapLayers     adds GeoJSON source + 8 rendering layers
      │       ├─ Legend           absolute top-4 left-4
      │       ├─ Timeline         absolute bottom-4 center
      │       └─ MapControls      absolute bottom-6 right-4
      └─ panel slot               DetailPanel (slides in from right)
```

### MapViewport Lifecycle

1. Create MapLibre GL instance with basemap style based on `manifest.theme`.
2. Wait for `load` or `idle` event.
3. Run `quietBasemap()` to suppress basemap visual noise.
4. Set `MapContext` so child hooks can access the map instance.
5. On unmount: call `map.remove()`.

### Layer Rendering Order (useMapLayers)

Each data layer creates 8 MapLibre layers in this order (bottom to top):

| Order | Layer ID Suffix | Type | Purpose |
|-------|----------------|------|---------|
| 1 | `-cluster-glow` | circle | Large blurred halo behind clusters |
| 2 | `-clusters` | circle | Solid cluster circles |
| 3 | `-cluster-count` | symbol | Cluster count text |
| 4 | `-glow` | circle | Blurred halo behind unclustered points |
| 5 | `-points` | circle | Solid core dot for each entity |
| 6 | `-rings` | circle | Outer ring for high + critical only |
| 7 | `-highlight` | circle | Hover highlight ring (feature-state driven) |
| 8 | `-labels` | symbol | Text labels for high + critical at zoom 4+ |

---

## v2: AI Pipeline

Atlas v2 replaces manual manifest authoring with an AI-powered flow. Users upload CSV data, describe what they want, and Claude generates a MapManifest automatically with schema + cartographic validation and self-correction.

### Pipeline Steps

1. **CSV Upload** (`POST /api/ai/upload-data`)
   - Accept CSV file.
   - Convert to GeoJSON (detect lat/lng columns).
   - Profile dataset: analyze geometry types, attribute cardinality, value ranges.
   - Return `DatasetProfile` with detected column types and statistics.

2. **Map Generation** (`POST /api/ai/generate-map`)
   - Input: user description + DatasetProfile.
   - Claude Sonnet with 881-line system prompt generates MapManifest JSON.
   - System prompt includes 9 few-shot examples for each map family.

3. **Schema Validation** (`validateManifestSchema()`)
   - Validate generated JSON against manifest.ts TypeScript types.
   - Reject if required fields missing or types incorrect.

4. **Cartographic Validation** (`validateCartographic()`)
   - Apply domain-specific rules (e.g., choropleth needs aggregated geometry).
   - Check color palette is valid and classification method matches data type.
   - Verify flow arc parameters if flow family.

5. **Self-Correction Loop** (max 3 attempts)
   - If validation fails, return errors to Claude with correction prompt.
   - Claude regenerates manifest fixing errors.
   - Stop when validation passes or max attempts reached.

6. **Manifest Compiler** (`compileLayer()`)
   - Pure function: each layer in manifest -> MapLibre source + layer specs.
   - Generates legend items, paint expressions, interaction handlers.
   - Output: CompiledLayer with complete MapLibre configuration.

7. **Render to Map**
   - React hook `useManifestRenderer()` takes compiled layers.
   - Adds sources and layers to MapLibre instance.
   - Attaches hover/click handlers for interactivity.

### Key Files

- `apps/web/app/api/ai/upload-data/route.ts` — CSV ingestion + profiling.
- `apps/web/app/api/ai/generate-map/route.ts` — Claude manifest generation.
- `apps/web/lib/ai/system-prompt.ts` — 881 lines, 9 examples per family.
- `apps/web/lib/ai/profiler.ts` — `profileDataset(geojson) -> DatasetProfile`.
- `apps/web/lib/ai/validators/schema.ts` — JSON schema validation.
- `apps/web/lib/ai/validators/cartographic.ts` — Domain-specific rules.
- `apps/web/lib/ai/patterns/` — Per-family pattern templates.
- `packages/map-core/src/manifest-compiler.ts` — `compileLayer()` entry point.
- `packages/map-core/src/use-manifest-renderer.ts` — React hook for rendering.
- `apps/web/app/(maps)/create/page.tsx` — Create map UI state machine.

---

## v2: Map Families

AI-generated maps are built from 7 declarative families. Each family has a schema definition, a compile function, cartographic validation rules, and pattern templates.

### 1. Point

Individual point features with no aggregation.

**Geometry**: Point.

**Schema**: PointLayer with `colorField`, `sizeField` (optional), `labelField` (optional).

**Compile**: Adds MapLibre circle layer with radius based on `sizeField` if present, color from classification.

**Cartographic rules**: Color palette must support continuous or categorical values.

**Use case**: Store locations, sensor deployments, observation sites.

### 2. Cluster

Groups nearby points at low zoom; explodes into individual points at high zoom.

**Geometry**: Point.

**Schema**: ClusterLayer with `clusterRadius`, `colorField`, `clusterAggregation` (sum | avg | count).

**Compile**: Two-level rendering: cluster circles at low zoom, unclustered points at high zoom. Cluster size and color by aggregation result.

**Cartographic rules**: Must define cluster color thresholds (count-based or value-based).

**Use case**: Dense point clouds (sensors, events, assets).

### 3. Choropleth

Color regions by aggregated data.

**Geometry**: Polygon or MultiPolygon.

**Schema**: ChoroplethLayer with `aggregationField`, `aggregationMethod` (sum | avg | count), `colorField`, `classificationMethod` (quantile | equal-interval | natural-breaks).

**Compile**: Aggregate source data by geometry, classify values, apply fill color based on classification bin.

**Cartographic rules**: Aggregation field must exist in data. Classification method must match data distribution (quantile for skewed, equal-interval for uniform).

**Use case**: Regional statistics, administrative boundaries with metrics.

### 4. Heatmap

Smooth density gradient across space.

**Geometry**: Point.

**Schema**: HeatmapLayer with `radius`, `intensityField` (optional), `colorRamp` palette name.

**Compile**: MapLibre heatmap layer with radius, intensity, and color stops.

**Cartographic rules**: Radius must be 1-50 pixels. Color ramp must be sequential or diverging.

**Use case**: Density visualization, concentration hotspots.

### 5. Proportional Symbol

Size shapes by continuous data attribute.

**Geometry**: Point or Polygon.

**Schema**: ProportionalSymbolLayer with `sizeField`, `sizeRange` [min, max], `colorField` (optional), `shapeType` (circle | square).

**Compile**: Circle or square layer with radius/width scaled by `sizeField` via feature-expression.

**Cartographic rules**: `sizeField` must be numeric. Size range should account for overplotting.

**Use case**: Magnitude or magnitude-class visualization with visual hierarchy.

### 6. Flow

Lines with directional emphasis (arrows or curves).

**Geometry**: LineString with 2 points (origin, destination).

**Schema**: FlowLayer with `flowField` (magnitude), `colorField` (optional), `arc` (true | false), `arrowSize` (small | medium | large).

**Compile**: If `arc: true`, interpolate great-circle arc for >500km or cubic Bézier for <500km. Add arrow symbols along line or at destination.

**Cartographic rules**: Must have exactly 2 coordinates per feature (verified at compile time). Arc interpolation uses `arc-interpolator.ts`.

**Use case**: Migration, trade, connections between locations.

### 7. Isochrone

Reachability regions from an origin point.

**Geometry**: Polygon (computed server-side).

**Schema**: IsochroneLayer with `origin` [lat, lng], `mode` (driving | cycling | foot), `breaks` array of integers, `unit` (minutes | km).

**Compile**: Fetch reachability polygons from `/api/isochrone`, merge into single feature collection, render as concentric fill layers with opacity gradient.

**Cartographic rules**: Breaks must be in ascending order. Mode must match available OpenRouteService modes.

**Use case**: Service area, accessibility analysis.

---

## v2: Manifest Compiler

The manifest compiler is a pure function that converts declarative layer definitions into MapLibre-ready source and layer specifications.

### Entry Point: `compileLayer()`

```ts
function compileLayer(
  layer: LayerManifest,
  data: GeoJSON.FeatureCollection,
  classificationConfig: ClassificationConfig,
): CompiledLayer {
  return {
    sources: { /* MapLibre source specs */ },
    layers: { /* MapLibre layer specs */ },
    legend: { /* Legend items */ },
  };
}
```

Each map family (point, cluster, choropleth, etc.) has a dedicated compile function invoked by the router based on `layer.kind`.

### Compiled Layer Structure

```ts
interface CompiledLayer {
  sources: Record<string, MapLibreSource>;
  layers: MapLibreLayer[];
  legend: LegendItem[];
  interactionHandler?: (map: Map, feature: Feature) => void;
}
```

**sources**: MapLibre source definitions (geojson, raster, vector). Generated from layer schema and data bounds.

**layers**: Ordered array of MapLibre layer specs (fill, line, circle, symbol, etc.). Includes paint and layout expressions for styling.

**legend**: Array of {label, color, min, max} items. Derived from classification breaks and palette.

**interactionHandler**: Optional function for custom click/hover behavior (e.g., isochrone tooltip, flow destination label).

### Classification

Data classification is handled by `packages/data-models/src/classification.ts`:

- **quantile**: Breaks chosen so each bin has equal count (handles skewed distributions).
- **equal-interval**: Breaks equally spaced across range (handles uniform distributions).
- **natural-breaks**: Jenks algorithm finds natural clustering in data (requires external optimization).

Choose method based on distribution analyzed in DatasetProfile.

### Color Palettes

17 named palettes in `packages/data-models/src/palettes.ts`:

**Sequential**: viridis, magma, plasma, inferno, cividis, blues, greens, reds, oranges, purples, greys.

**Diverging**: blue-red, blue-yellow-red, spectral.

**Categorical**: set1, set2, paired.

Use sequential for continuous data (elevation, temperature). Use diverging for bipolar data (change, deviation). Use categorical for unordered categories.

---

## v2: Color and Classification

Every v2 map uses a named palette + a classification method.

### Named Palettes

| Family | Type | Palettes |
|--------|------|----------|
| Sequential | Ascending intensity | viridis, magma, plasma, inferno, cividis, blues, greens, reds, oranges, purples, greys |
| Diverging | Centered on middle value | blue-red, blue-yellow-red, spectral |
| Categorical | Unordered groups | set1, set2, paired |

Each palette is defined as an array of hex colors, indexed by class bin.

### Classification Methods

| Method | Best For | Behavior |
|--------|----------|----------|
| `quantile` | Skewed data | Each bin contains same number of values; breaks adapt to distribution |
| `equal-interval` | Uniform data | Breaks equally spaced across min-max range |
| `natural-breaks` | Visual clustering | Jenks algorithm finds natural groupings; computationally expensive |

The AI system prompt recommends a method based on DatasetProfile statistics (coefficient of variation, outlier count).

---

## v2: Basemap Overlays

The `useBasemapLayers()` hook adds optional terrain, relief, and thematic overlays to the basemap. All overlays are subordinate to data layers (z-order managed by layer IDs).

### Available Overlays

| Overlay | Source | Effect | Use Case |
|---------|--------|--------|----------|
| terrain | Mapbox Terrain-RGB | Hillshade + contour lines | Topographic context |
| hillshade | Derived from DEM | Directional shading | Relief visualization |
| nightlights | NOAA DMSP | Satellite nighttime lights | Urban extent, population density |
| land-mask | Natural Earth | Solid land fill | Separate land from water |
| tectonic | GeoJSON | Plate boundary lines + labels | Seismic context |

### Hook Usage

```ts
const { map } = useMap();
useBasemapLayers(map, {
  terrain: true,
  hillshade: true,
  nightlights: false,
  landMask: false,
  tectonics: false,
});
```

Each overlay is added as a set of MapLibre layers. Overlays are automatically positioned below data layers via ID prefix convention (e.g., basemap-terrain, basemap-hillshade).

---

## Interaction Model

All maps must implement these standard interactions:

### Sidebar -> Map
- **Click sidebar item** -> `setSelected(entity)` + `map.flyTo({ center, zoom })`.
- **Hover sidebar item** -> `setHoveredId(entity.id)` -> map shows highlight ring via feature-state.
- **Mouse leave sidebar item** -> `setHoveredId(null)`.

### Map -> Sidebar
- **Click unclustered point** -> `setSelected(entity)` + scroll sidebar to item via `scrollIntoView`.
- **Hover unclustered point** -> cursor: pointer, highlight ring, notify sidebar.
- **Click cluster** -> `source.getClusterExpansionZoom()` -> `map.easeTo({ center, zoom })`.

### Detail Panel
- **Entity selected** -> panel slides in from right (`animate-slide-in-right`).
- **Close button** -> `setSelected(null)`, panel unmounts.

### Timeline
- **Click time window pill** -> filters displayed entities by time range.
- **Available windows**: 1h, 6h, 24h, all (72h).
- Wrap the page in `<TimeWindowProvider>` so timeline and data hooks share state.

---

## Marker System

Markers are sized and styled by severity. This hierarchy must be consistent across all maps.

### Unclustered Points

| Severity | Core Radius | Glow Radius | Glow Opacity | Ring | Core Color |
|----------|------------|-------------|--------------|------|------------|
| critical | 5px | 24px | 0.35 | 14px outer ring, 1.5px stroke | white center, colored stroke |
| high | 4px | 18px | 0.25 | 11px outer ring, 1px stroke | white center, colored stroke |
| medium | 3.5px | 14px | 0.18 | none | severity color fill |
| low | 2.5px | 10px | 0.1 | none | severity color fill |

### Clusters

| Count | Core Radius | Glow Radius | Color |
|-------|------------|-------------|-------|
| < 10 | 14px | 30px | blue (#3b82f6) |
| 10-49 | 18px | 40px | amber (#f59e0b) |
| 50+ | 24px | 50px | red (#ef4444) |

### Severity Hex Palette

All maps must use these hex values for markers and inline color styling:

```
critical: #ef4444
high:     #f97316
medium:   #f59e0b
low:      #64748b
```

These are defined in `@atlas/data-models` as `SEVERITY_HEX`. For DOM elements using CSS variables, use `SEVERITY_COLOR` instead.

---

## Layout Constraints

### Sidebar
- Width: `w-80` (320px).
- Visible on `md:` breakpoint and up.
- Background: `bg-sidebar`.
- Separated from map by `border-r`.

### Detail Panel (Inspector)
- Width: `w-96` (384px).
- Visible on `lg:` breakpoint and up.
- Background: `bg-sidebar`.
- Separated from map by `border-l`.
- Entry animation: `animate-slide-in-right`.

### Map Overlay Placement

| Module | Position | Z-Index |
|--------|----------|---------|
| Legend | `absolute top-4 left-4` | `z-overlay` (10) |
| Timeline | `absolute bottom-4 left-1/2 -translate-x-1/2` | `z-overlay` (10) |
| MapControls | `absolute bottom-6 right-4` | `z-controls` (30) |

### Panel Padding Standard

All panels and overlays use consistent padding:
- **Horizontal**: `px-4` (16px).
- **Vertical headers/sections**: `py-3` (12px).
- **Vertical rows/items**: `py-2.5` (10px).
- **Vertical compact controls**: `py-2` (8px).

---

## Design System Constraints

All components must use these tokens. No ad-hoc values.

### Spacing Scale

```
4px  (--space-1)     12px (--space-3)    24px (--space-6)
6px  (--space-1-5)   16px (--space-4)    32px (--space-8)
8px  (--space-2)     20px (--space-5)    40px (--space-10)
```

### Typography (6 styles, Tailwind utilities)

| Utility | Size | Weight | Family | Tracking | Usage |
|---------|------|--------|--------|----------|-------|
| `text-heading` | 15px | 600 | sans | -0.01em | Panel titles, section headers |
| `text-title` | 13px | 500 | sans | -0.006em | List item names |
| `text-body` | 13px | 400 | sans | -- | Descriptions, button text |
| `text-caption` | 11px | 400 | sans | -- | Timestamps, secondary text |
| `text-label` | 10px | 500 | mono | 0.04em | Uppercase labels, categories |
| `text-data` | 13px | 400 | mono | -- | Coordinates, magnitudes |

Do not use `text-sm`, `text-xs`, `text-lg`, or `text-[Npx]`. Use the 6 utilities above.

**Landing page exception:** The homepage (`app/page.tsx`) is marketing/landing UI, not map UI. It may use a small set of controlled display-typography overrides outside the strict 6-utility system:
- `text-3xl font-bold tracking-tight` for the hero heading.
- `text-lg` for the hero subtitle.
- `px-6 py-16` for page-level padding (not bound to the panel padding standard).

These exceptions must not spread to map pages or reusable components. If additional non-map pages are added, evaluate whether a formal display-typography tier is needed rather than accumulating ad-hoc exceptions.

### Radius

Single value: `--radius: 0.375rem` (6px). Tailwind maps: `rounded-lg` = 6px, `rounded-md` = 4px, `rounded-sm` = 2px.

### Shadows

One level in active use: `shadow-sm` (0 1px 3px rgba(0,0,0,0.18)).

### Motion

Three durations only:

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| `--dur-fast` | 150ms | `duration-fast` | Hover, color transitions |
| `--dur-med` | 250ms | `duration-med` | Fade-in animations |
| `--dur-slow` | 400ms | `duration-slow` | Slide-in panels |

Easing: `cubic-bezier(0.16, 1, 0.3, 1)` (`--ease-out`).

Do not use `duration-[Nms]` bracket syntax. Use `duration-fast`, `duration-med`, or `duration-slow`.

### Z-Index Scale

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| `--z-overlay` | 10 | `z-overlay` | Legend, timeline |
| `--z-sidebar` | 20 | `z-sidebar` | Sidebar |
| `--z-panel` | 25 | `z-panel` | Detail panel |
| `--z-controls` | 30 | `z-controls` | Map controls |

Do not use `z-[N]` bracket syntax. Use the named tokens above.

### Color Tokens

All colors reference CSS variables defined in `themes.css`. Three themes are available:

| Theme | Selector | Primary | Background |
|-------|----------|---------|------------|
| editorial | `[data-theme="editorial"]` | blue (215 90% 45%) | light (220 18% 98%) |
| explore | `[data-theme="explore"]` | green (152 65% 46%) | dark (220 20% 8%) |
| decision | `[data-theme="decision"]` | blue (206 85% 52%) | dark (222 18% 8%) |

Domain-specific color tokens: `--strike`, `--explosion`, `--military`, `--naval`, `--warning`.

Components must use token classes (`bg-card`, `text-muted-foreground`, `border-border`) and never hardcode hex values except in MapLibre paint expressions (which cannot resolve CSS variables).

---

## Basemap Policy

The basemap must always be visually subordinate to data layers. `quietBasemap()` in `map-viewport.tsx` enforces this on every map load:

| Layer Type | Treatment |
|-----------|-----------|
| Symbols (labels) | text-opacity reduced to 25% |
| Lines (borders, roads) | line-opacity reduced to 15% of original |
| Fills (land, water) | fill-opacity reduced to 60% of original |

### Basemap Styles

| Theme | Basemap |
|-------|---------|
| editorial | CARTO Positron (light) |
| explore | CARTO Dark Matter (dark) |
| decision | CARTO Dark Matter (dark) |

Maps must not override these basemap choices. The theme in `MapManifest` determines the basemap.

---

## Module System

Map modules are reusable UI components in `packages/map-modules/`. Each module:

1. Accepts `GeoEntity[]` or a single `GeoEntity` as data input.
2. Uses design system tokens for all styling.
3. Is positioned via absolute/relative CSS (never modifies parent layout).
4. Has no dependency on a specific map page.

### Available Modules

**DetailPanel** (`detail-panel/detail-panel.tsx`)
- Props: `entity: GeoEntity | null`, `onClose`, `children`, `className`.
- Renders inspector-style key-value layout with severity badge.
- Accepts children for domain-specific fields (e.g., depth, tsunami).

**Timeline** (`timeline/timeline.tsx`)
- Props: `entities: GeoEntity[]`, `embedded?`, `className`.
- Requires `<TimeWindowProvider>` ancestor.
- Renders 48 density buckets + time window pills.

**Legend** (`legend/legend.tsx`)
- Props: `items: LegendItem[]`, `title?`, `activeItems?`, `onToggle?`.
- Renders colored swatches with labels.
- Optional filter toggle via `onToggle` + `activeItems`.

### Creating a New Module

1. Create directory under `packages/map-modules/src/<module-name>/`.
2. Accept `GeoEntity[]` or single entity as props.
3. Use only `@atlas/ui` components and design tokens.
4. Export from `packages/map-modules/src/index.ts`.
5. Module must work with any theme (editorial, explore, decision).

---

## How to Add a New Map

Two paths: **v1 (manual manifest)** or **v2 (AI-generated)**.

### v2 Path: AI-Generated Maps

1. Navigate to `/create`.
2. Upload CSV with lat/lng columns.
3. Describe desired map in natural language (e.g., "Show earthquake density by region with a choropleth").
4. Wait for AI to profile data + generate manifest + validate.
5. Review generated map and edit manifest if needed.
6. Save as new map product.

The create page state machine: idle -> uploading -> profiled -> generating -> rendered.

### v1 Path: Manual Manifest (Legacy)

### Step 1: Define the Manifest

Create `apps/web/lib/<map-name>-manifest.ts`:

```ts
import type { MapManifest } from "@atlas/data-models";

export const myMapManifest: MapManifest = {
  id: "my-map",
  title: "My Map",
  description: "Description of what this map shows.",
  theme: "explore",               // editorial | explore | decision
  defaultCenter: [lat, lng],      // [latitude, longitude]
  defaultZoom: 3,
  layers: [{
    id: "my-layer",
    kind: "event",                // event | asset | route | zone | project
    label: "My Layer",
    sourceType: "geojson-url",
    sourceUrl: "/api/my-data",
    refreshIntervalMs: 300_000,
    style: {
      markerShape: "circle",
      colorField: "severity",
      clusterEnabled: true,
      clusterRadius: 50,
    },
    attribution: "Data Provider",
  }],
  timeline: { enabled: true },
  modules: { legend: true, detailPanel: true },
};
```

### Step 2: Create the Data Hook

Create `apps/web/lib/use-<data-source>.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import type { GeoEntity } from "@atlas/data-models";

export function useMyData() {
  return useQuery<GeoEntity[]>({
    queryKey: ["my-data"],
    queryFn: async () => {
      const res = await fetch("/api/my-data");
      const raw = await res.json();
      return raw.map(transformToGeoEntity);
    },
    refetchInterval: 300_000,
  });
}
```

### Step 3: Create the Page

Create `apps/web/app/(maps)/<map-name>/page.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";
import { MapShell, useMap, useMapLayers } from "@atlas/map-core";
import { Timeline, TimeWindowProvider, DetailPanel, Legend } from "@atlas/map-modules";
import { SEVERITY_HEX } from "@atlas/data-models";
import type { GeoEntity } from "@atlas/data-models";
import { ScrollArea } from "@atlas/ui";
import { myMapManifest } from "../../../lib/my-map-manifest";
import { useMyData } from "../../../lib/use-my-data";

// 1. Define MapContent component that calls useMap() and useMapLayers()
// 2. Define sidebar with header + scrollable list
// 3. Define detail panel with domain-specific fields
// 4. Compose with MapShell:
//    <TimeWindowProvider>
//      <MapShell
//        manifest={myMapManifest}
//        sidebar={sidebar}
//        detailPanel={panel}
//        overlay={<><Legend /><Timeline /></>}
//      >
//        <MapContent />
//      </MapShell>
//    </TimeWindowProvider>
```

### Step 4: Create the API Route (if needed)

Create `apps/web/app/api/<data-source>/route.ts` to proxy or transform external data.

### Step 5: Verify

```bash
npx tsc --noEmit
pnpm build
```

Then visually verify:
- Basemap is quiet (labels faint, borders nearly invisible).
- Markers sized by severity.
- Sidebar click -> flyTo.
- Marker click -> detail panel slides in.
- Hover bidirectional (sidebar <-> map).
- Timeline pill switching works.
- Legend renders with correct colors.

---

## Entity Type System

All map data flows through `GeoEntity`:

```ts
interface GeoEntity {
  id: string;
  kind: EntityKind;           // "event" | "asset" | "route" | "zone" | "project"
  title: string;
  description?: string;
  coordinates: [number, number];  // [latitude, longitude]
  category: string;
  severity?: Severity;           // "low" | "medium" | "high" | "critical"
  sourceCount?: number;
  occurredAt?: string;
  updatedAt?: string;
  tags?: string[];
  properties?: Record<string, unknown>;  // domain-specific fields
}
```

Extended types: `EventEntity` (adds `isBreaking`, `ageBracket`, `confidence`), `AssetEntity` (adds `operator`, `capacity`, `status`).

### Severity Classification

Every entity should have a severity. Maps define their own severity mapping (e.g., magnitude -> severity for earthquakes). The 4 levels are:

| Level | Priority | Hex | CSS Variable |
|-------|----------|-----|-------------|
| low | 0 | #64748b | `--muted-foreground` |
| medium | 1 | #f59e0b | `--warning` |
| high | 2 | #f97316 | `--strike` |
| critical | 3 | #ef4444 | `--destructive` |

### Age Brackets

Entities have age-based freshness via `getAgeBracket(updatedAt)`:
- **fresh**: < 2 hours
- **recent**: < 8 hours
- **aging**: < 24 hours
- **stale**: > 24 hours
