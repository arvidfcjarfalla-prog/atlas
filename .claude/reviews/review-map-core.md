# map-core

Generally healthy. No runtime-crashing bugs found. Two real dead-code items, a cluster of type lies in the compiler, one unused component export, and a sizable refactor opportunity across six near-identical terrain hooks. 31 source files, 2 test files — React/MapLibre components lack integration tests.

## Fix These (breaks things or hides bugs)

_Nothing crashes. The items below are wrong-but-not-breaking; filed under Clean Up._

## Clean Up (dead code, unused stuff)

- **Dead `cleanup` variable in `useContourLines`** — `packages/map-core/src/use-contour-lines.ts:42,151` — `let cleanup: (() => void) | undefined;` is declared but never assigned; `cleanup?.()` on :151 is always a no-op. The real unmount cleanup lives in the second `useEffect` at :155–169. Fix: delete line 42 and the `return () => { cleanup?.(); }` at :150–152.

- **`MapControls` exported but never consumed** — `packages/map-core/src/index.ts:3`, defined in `packages/map-core/src/map-controls.tsx:10`. `rg MapControls apps/ packages/` returns zero hits outside the barrel/definition and unrelated HTML eval viewers. Fix: delete the export and the file, or wire it into a page if it was meant as a default.

- **Dead import: `useTerrain` in disasters page** — `apps/web/app/(maps)/disasters/page.tsx:4` imports `useTerrain` from `@atlas/map-core` but never calls it (no other references in the file). Fix: remove from the import list.

- **Compiler paint-property type casts hide `Expr` variants** — `packages/map-core/src/manifest-compiler.ts:513,514,527,1083,1084,1245,1246,1257`. `buildColorExpression` returns `string | Expr` (:1635), and `radiusExpr`/`widthExpr`/`heightExpr` are typed `Expr | number`, but every paint entry casts them to `string`/`number`:
  ```ts
  "circle-color": colorExpr as string,
  "circle-radius": radiusExpr as number,
  ```
  MapLibre accepts both at runtime so nothing crashes, but the casts lie to every future reader. Line 1094 already demonstrates the proper narrowing: `typeof widthExpr === "number" ? widthExpr + 2 : ["+", widthExpr, 2]`. Fix: drop the casts — `DataDrivenPropertyValueSpecification<T>` accepts expressions natively, so the values can be assigned directly once the locals are typed `Expr | T`.

- **Centroid-extraction logic duplicated** — `packages/map-core/src/manifest-compiler.ts:117–143` (`buildCentroidCollection`) and `:383–398` (chart-overlay inline loop) reimplement the same "largest-ring centroid for Polygon/MultiPolygon" algorithm. Fix: extract `centroidOfLargestRing(geometry): [number, number] | null` and call from both sites.

- **Empty catch in manifest cleanup hides layer-remove failures** — `packages/map-core/src/use-manifest-renderer.ts:121–123`. If `removeLayer`/`removeSource` throws during a manifest swap, the orphan is silent. Fix: `console.warn("[Atlas] cleanup failed:", err)` inside the catch — mirrors the pattern used elsewhere in the file.

- **Empty catches around deck.gl overlay control swaps** — `packages/map-core/src/use-deck-overlay.ts:139,165`. `removeControl` failures are swallowed; if removal fails, `overlayRef.current = null` on :166 but the overlay is still attached to the map. Fix: log the error; optionally only null `overlayRef.current` on success.

- **Empty catch hides `setPaintProperty` failure for image fills** — `packages/map-core/src/use-image-fills.ts:145–147`. If the target layer isn't a fill type, the pattern silently fails with no fill visible and no diagnostic. Fix: log with the layer id.

- **Geocoder leaves stale results on non-ok response** — `packages/map-core/src/geocoder-control.tsx:54`. `if (!res.ok) return;` clears nothing, so after a 429/500 the previous query's list stays on screen while `loading` drops to false. Fix: `if (!res.ok) { setResults([]); setOpen(false); return; }`.

- **`CompareView` registers `move` listeners without an `off` path** — `packages/map-core/src/compare-view.tsx:50–60`. `map.on("move", ...)` is attached inside `handleMapAReady`/`handleMapBReady` and never explicitly removed. Today it's masked because `MapViewport` does `mapRef?.remove()` on unmount which tears down listeners, so there's no live leak. Fix: move the registration into a `useEffect` keyed on the map instance and return `map.off(...)` in cleanup — makes the intent explicit instead of depending on MapLibre's destroy order.

- **deck.gl overlay uses `(map as any).addControl` / `removeControl`** — `packages/map-core/src/use-deck-overlay.ts:138,147,164`. `MapboxOverlay` from `@deck.gl/mapbox` implements `IControl`, so the cast isn't needed. Fix: replace `as any` with the proper control type from `@deck.gl/mapbox`.

## Nice to Have (style, consistency)

- **Six near-identical terrain/atmosphere hooks** — `use-hillshade.ts`, `use-land-mask.ts`, `use-nightlights.ts`, `use-tectonic-layers.ts`, `use-contour-lines.ts`, `use-terrain.ts` share ~90 % scaffolding: an `addedRef`, an effect that checks `map.getSource`/`addSource` and `map.getLayer`/`addLayer`, a try/catch that conditionally removes the orphaned source, and an unmount effect that removes layers and source. Extracting a `useMapLayerResource({ sourceId, layerId, buildSource, buildLayer, beforeLayerId, enabled })` helper would collapse ~80 lines per hook down to ~20 and standardize error handling. Fix: defer until the next hook is added — trigger refactor then.

- **No integration/unit tests for React + MapLibre components** — `MapViewport`, `CompareView`, `MeasureControl`, `GeocoderControl`, `MapShell` have zero tests. Given the existing patterns (listener cleanup, source/layer lifecycle), a few smoke tests would catch regressions cheaply. Fix: start with `MapViewport` mount/unmount and `MeasureControl` source/layer lifecycle using `@testing-library/react` + a MapLibre mock.

- **`cameraPadding` effect-deps exclusion can drift silently** — `packages/map-core/src/map-viewport.tsx:332–335`. Padding is consumed once inside `onReady` via closure; subsequent `cameraPadding` changes are ignored because the effect only re-inits on `theme`/`basemap.style`. The comment documents the intent, but there is no separate effect that applies `map.setPadding(...)` when the prop changes post-init. Fix: add a small effect keyed on `mapInstance` + `cameraPadding` that calls `mapInstance.setPadding(...)`, so live padding changes (e.g. sidebar toggle) actually take effect.

## Looks Good

- `packages/map-core/src/arc-interpolator.ts` — zero-distance and division-by-zero are guarded; no issues.
- `packages/map-core/src/turf-transforms.ts` — clean error handling around transform application.
- `packages/map-core/src/types.ts` — tight public type surface.
- `packages/map-core/src/index.ts` — barrel is accurate (except the `MapControls` export flagged above).
- `packages/map-core/src/use-terrain.ts` — intentionally shares `SOURCE_ID` with hillshade; unmount correctly leaves the shared source in place (documented at :51–52).
- `packages/map-core/src/use-route-animation.ts` — RAF cleanup is symmetric; marker source/layer lifecycle is clean.
- `packages/map-core/src/use-timeline-playback.ts` — interval and keyboard-listener cleanup verified; no leaks.
- `packages/map-core/src/use-map-layers.ts` — layer-before-source removal order is correct; cleanup has try/catch.
- `packages/map-core/src/coordinate-widget.tsx`, `measure-control.tsx`, `map-atmosphere.tsx`, `map-shell.tsx` — all listener registrations have matching cleanups; layer removal precedes source removal in `MeasureControl`.
- `packages/map-core/src/use-hillshade.ts`, `use-land-mask.ts`, `use-nightlights.ts` — the "asymmetric" catch-branch flagged by exploration is actually correct defensive logic (only remove orphaned source when the layer never got added).
- `packages/map-core/src/use-deck-overlay.ts` cancel semantics — each effect run closes over its own `cancelled` flag; no cross-run race (the earlier race claim was a false positive).

## Audit Method

- 4 parallel Explore agents, one per sub-area (compiler core, shell/viewport, manifest/render hooks, terrain hooks).
- Every finding above was re-read in the source file before publication; false positives from the agents were dropped:
  - "`useManifestRenderer` popup cleanup bug" — rejected: cleanup at `use-manifest-renderer.ts:443–444` does remove both popups.
  - "`useDeckOverlay` concurrent-run race on `cancelled`" — rejected: `let cancelled = false` is inside the effect body, so each run has its own closure.
  - "`useHillshade`/`useLandMask`/`useNightlights` asymmetric catch-branch" — rejected: the condition is correct orphan-source cleanup.
  - "`MapViewport` `map.on('load', onReady)` has no off" — rejected: `mapRef.remove()` in cleanup tears down all listeners.
  - "`useRippleLayers` RAF/setTimeout race on cleanup" — rejected: `timeoutRef` is cleared in cleanup and `running` is checked before re-scheduling.
