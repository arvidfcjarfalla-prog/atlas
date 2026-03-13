# Atlas

AI-driven map platform. Natural language prompts → MapManifest → MapLibre rendering.

## Architecture

```
prompt → profileDataset(geojson) → AI generates MapManifest → validateManifest() → compileLayer() → MapLibre GL
```

**Core constraint:** AI generates `MapManifest` objects, never raw MapLibre code. The manifest compiler is the only path to MapLibre layer specs.

## Monorepo Structure

| Package | Purpose |
|---|---|
| `packages/data-models` | Types (`MapManifest`, `MapFamily`, `ColorScheme`), classification, color palettes |
| `packages/map-core` | Manifest compiler, arc interpolator, MapShell, hooks (`useManifestRenderer`, `useBasemapLayers`) |
| `packages/map-modules` | UI modules (Legend, Sidebar) |
| `packages/ui` | Shared UI primitives |
| `apps/web` | Next.js 14 app — AI pipeline, API routes, pages |

## Map Families

7 families: `point`, `cluster`, `choropleth`, `heatmap`, `proportional-symbol`, `flow`, `isochrone`

Each has a dedicated compiler in `packages/map-core/src/manifest-compiler.ts`.

## Key Files

- `packages/data-models/src/manifest.ts` — MapManifest, LayerManifest, all config types
- `packages/map-core/src/manifest-compiler.ts` — `compileLayer(layer, data) → CompiledLayer`
- `packages/map-core/src/arc-interpolator.ts` — Arc rendering (Bézier <500km, great circle ≥500km)
- `apps/web/lib/ai/validators/` — Two-pass validation: schema + cartographic
- `apps/web/lib/ai/profiler.ts` — Dataset profiling for geometry-aware scoring
- `apps/web/lib/ai/quality-scorer.ts` — Structural quality score (0–100)
- `apps/web/app/api/ai/generate-map/route.ts` — AI generation endpoint
- `apps/web/scripts/eval-runner.ts` — Offline/online eval runner

## Commands

```bash
pnpm dev          # Start dev server (all packages)
pnpm build        # Build all packages
pnpm test         # Run all tests (Vitest via Turbo)
pnpm typecheck    # Type-check all packages
pnpm lint         # Lint all packages

# E2E tests (from apps/web — requires dev server or auto-starts one)
pnpm e2e          # Playwright smoke tests (Chromium)
pnpm e2e:ui       # Playwright with interactive UI

# Eval runner (from apps/web)
pnpm eval         # Offline mode — fixture-based, no API key
pnpm eval:online  # Online mode — requires ANTHROPIC_API_KEY + dev server
```

## Verification

After any code change, always run:
```bash
pnpm typecheck && pnpm test
```

## Testing

- Unit tests: Vitest (v4.1+), 158 tests across 9 files in 3 packages
- E2E tests: Playwright (Chromium), 8 tests covering all 7 map families
- Unit test files live next to source: `src/__tests__/` or `lib/ai/__tests__/`
- E2E test files: `apps/web/e2e/`
- Path alias `@/` in `apps/web` resolves to project root (not `src/`)

## Import Caveat

`@atlas/map-core` barrel export imports MapLibre CSS. Scripts running in Node (like eval-runner) must import directly from source files to avoid CSS parse errors:
```typescript
// In Node scripts — import from source, not barrel
import { compileLayer } from "../../../packages/map-core/src/manifest-compiler.js";
```

## Tech Stack

- pnpm 9.15 + Turborepo
- TypeScript 5.8, strict mode, ES2022
- Next.js 14 (App Router)
- MapLibre GL JS 5.19
- React 18.3
- Tailwind CSS 3.4
- AI: Anthropic Claude Sonnet 4 (`@anthropic-ai/sdk`)
