# map-core

Solid package overall — manifest compiler is well-tested, the new `useMapLayerResource` helper cleans up six terrain hooks nicely. Two real correctness gaps (missing deck.gl install, toggle-off does not remove basemap layers) plus a handful of unused exports and one dead dep.

## Fix These (breaks things or hides bugs)

- **deck.gl packages not installed anywhere** — `packages/map-core/src/use-deck-overlay.ts:85` dynamically imports `@deck.gl/mapbox`, `@deck.gl/aggregation-layers`, `@deck.gl/geo-layers` but none of them appear in `packages/map-core/package.json` or `apps/web/package.json`, and `node_modules/@deck.gl` does not exist. The imports fail and the hook only `console.warn`s, so hexbin-3d / screen-grid / trip families silently render nothing even though `compileDeckFamily` (`packages/map-core/src/manifest-compiler.ts:1543`) produces `deckLayers`. Fix: add `@deck.gl/core`, `@deck.gl/mapbox`, `@deck.gl/aggregation-layers`, `@deck.gl/geo-layers` to `apps/web/package.json` (or to map-core as peer deps) so the dynamic import resolves.

- **Disabling a basemap layer at runtime does not remove it** — `packages/map-core/src/use-map-layer-resource.ts:184` — setup effect early-returns when `enabled` flips to false, and the cleanup effect only fires on unmount (`deps: [map]`). A chat edit that flips `basemap.hillshade` true→false keeps the hillshade layer on the map until the MapViewport remounts. Same applies to `nightlights`, `tectonic`, `contourLines`, and `terrain`. Fix: when `enabled` goes from true→false with `state.added === true`, call `runResourceCleanup` and reset `state`, so the setup effect's normal re-run semantics manage the lifecycle.

- **Changing resource deps after first setup is a no-op** — `packages/map-core/src/use-map-layer-resource.ts:185` — `if (state.added) return` means `contour.interval` / `land-mask.color` / `terrain.exaggeration` changes get ignored after the first render, even though they're in the effect's dep array. Fix: when deps identity changes while `state.added`, tear down and re-setup so the new values actually take effect (or document explicitly that deps are setup-time-only).

- **Unused `LngLat` import** — `packages/map-core/src/measure-control.tsx:5` — imported but never referenced; will trip `noUnusedLocals` if that rule is ever enabled. Fix: drop `LngLat` from the import.

## Clean Up (dead code, unused stuff)

- **`lucide-react` dep not imported** — `packages/map-core/package.json:25` declares `lucide-react ^0.462.0` but nothing under `packages/map-core/src/` imports it (grep returns zero hits). Fix: remove from dependencies.

- **Duplicate `ImageFillMetadata` interface** — `packages/map-core/src/use-image-fills.ts:6` redefines the same shape that `use-manifest-renderer.ts:34` exports as the public type. Two identical-but-separate types invite drift. Fix: `import type { ImageFillMetadata } from "./use-manifest-renderer"` in `use-image-fills.ts` and delete the local copy.

- **`useContourLines` not re-exported** — `packages/map-core/src/use-contour-lines.ts` is only reached indirectly via `useBasemapLayers`. `packages/map-core/src/index.ts` exports `useHillshade`, `useNightlights`, `useLandMask`, `useTerrain`, `useTectonicLayers` but not `useContourLines`. Fix: either add it to the barrel for consistency with its siblings, or drop the other five from the barrel since consumers only use `useBasemapLayers` (`apps/web/components/MapContent.tsx:5` and the legacy `apps/web/app/(maps)/disasters/page.tsx:4`).

- **Likely-unused public types** — `MapContextValue`, `MapShellProps`, `CameraPadding`, `CompiledSourceConfig` are exported from `packages/map-core/src/index.ts:13,17` but zero consumers import them (searched all of `apps/` and `packages/`). They're harmless API surface, but if kept they should be intentional. Fix: drop them, or note in a comment that they're kept as public API.

## Nice to Have (style, consistency)

- **`require("h3-js")` inside ESM** — `packages/map-core/src/manifest-compiler.ts:1430` — uses CommonJS `require` in a `.ts` file with an ESLint suppression. Works in the bundler but breaks if the package is ever consumed as pure ESM (e.g. from a Node script — see `.claude/rules/node-script-imports.md`). Fix: move to `import` at module scope; h3-js ships ESM in recent versions.

- **`turf-transforms.ts` has no direct test** — `packages/map-core/src/turf-transforms.ts` (180 LoC, six transform types with per-type branches) is exercised only transitively through `manifest-compiler.test.ts`. Fix: add a focused unit test for `applyTransforms` covering each transform type plus the error-swallow-with-warning branch at line 33.

- **CompareView initial camera mismatch** — `packages/map-core/src/compare-view.tsx:52` — `mapA` and `mapB` each initialize to their own `manifest.defaultCenter`; if they differ, the user sees a flash until the first move sync. Fix: on mount of the second map, force a one-time `jumpTo` to mapA's state before wiring listeners.

- **Inline `<style>` in popups relies on global fonts** — `packages/map-core/src/use-manifest-renderer.ts:259` hardcodes `'Geist'` and rgba tokens. It works in `apps/web`, but anyone reusing `@atlas/map-core` outside this app gets broken styling. Fix: move popup styling to `popup.css` and use CSS custom properties, or import from `@atlas/ui` tokens.

- **Silent per-layer catch in timeline filter loop** — `packages/map-core/src/use-timeline-playback.ts:90` — `try { map.setFilter(...) } catch {}` on every tick hides schema mismatches (e.g. `timeField` missing on some layers). Fix: keep the catch but `console.warn` once per layer to surface silent failures.

## Looks Good

- `useMapLayerResource` refcount, orphan-source cleanup, and async-signal cancellation are thorough; test coverage in `packages/map-core/src/__tests__/use-map-layer-resource.test.ts` exercises all branches including the reverse-order teardown.
- Manifest compiler is pure, well-documented, has 65 tests in `manifest-compiler.test.ts`.
- Arc interpolator is cleanly isolated (pure, no DOM), 16 tests.
- `MapViewport` basemap-fetch retry, style transform pipeline, and ResizeObserver wiring are solid.
- Hook cleanup patterns in `useRippleLayers`, `useRouteAnimation`, `useTimelinePlayback`, `useDeckOverlay` all clear their RAFs/intervals/overlays on unmount.
- `useManifestRenderer` correctly stabilizes `EMPTY_LEGEND` / `EMPTY_WARNINGS` references to avoid consumer re-render loops.
- `CompareView` listener lifecycle with explicit `.off()` and the `syncingRef` guard is correct.
- No `as any`, no `@ts-ignore`, no empty catches that aren't commented as intentional (map-disposed branches).
- No stale TODO/FIXME markers.
