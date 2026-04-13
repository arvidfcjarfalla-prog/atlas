# Review Summary

`apps/web` and `packages/map-core` are both in solid shape. The `apps/web` risk was concentrated in a security gap (cron auth fallback) and a family of `setTimeout`/toast cleanup bugs — all already addressed in build runs 1 + 2. `map-core` has no runtime-crashing bugs; the main residual items are a unused `MapControls` export, a dead `cleanup` variable in `useContourLines`, a cluster of type-only casts in the manifest compiler that hide `Expr` variants, and a big refactor opportunity across six near-identical terrain hooks.

## Action List (by priority)

### apps/web (remaining after build runs 1 + 2)

1. Add tests for `url-fetcher` and `kolada-client` — effort: **2h+** — **DONE** (see `apps/web/lib/ai/tools/__tests__/url-fetcher.test.ts` + `kolada-client.test.ts`, 47 tests)
2. Extract shared `saveDraft()` helper to replace three copies — `apps/web/app/app/(editor)/map/[id]/page.tsx:291,357,396` — effort: **30 min** — **DONE**
3. Standardize `components/` filenames to one case — effort: **2h+** (deferred — touch opportunistically)

### packages/map-core

4. Delete dead `cleanup` variable in `useContourLines` — `packages/map-core/src/use-contour-lines.ts:42,151` — effort: **2 min**
5. Remove unused `MapControls` export + file — `packages/map-core/src/index.ts:3`, `map-controls.tsx` — effort: **5 min**
6. Remove dead `useTerrain` import — `apps/web/app/(maps)/disasters/page.tsx:4` — effort: **1 min**
7. Fix geocoder stale-results bug — `packages/map-core/src/geocoder-control.tsx:54` — effort: **5 min**
8. Drop `Expr`-hiding paint-property casts in the compiler — `packages/map-core/src/manifest-compiler.ts` (8 sites) — effort: **20 min**
9. Log empty catches in `useManifestRenderer`, `useDeckOverlay`, `useImageFills` — effort: **15 min**
10. Replace `(map as any)` in `useDeckOverlay` with `IControl`-typed calls — effort: **10 min**
11. Move `CompareView` `map.on("move")` into a keyed effect with explicit `off` — effort: **15 min**
12. Extract `centroidOfLargestRing()` helper to deduplicate — `manifest-compiler.ts:117-143` vs `:383-398` — effort: **15 min**
13. Extract a `useMapLayerResource` helper and port the six terrain hooks — effort: **2h+**
14. Add component-level tests for `MapViewport` / `CompareView` / `MeasureControl` / `GeocoderControl` — effort: **2h+**
15. Add a separate effect for `cameraPadding` post-init updates — `packages/map-core/src/map-viewport.tsx:332-335` — effort: **15 min**

## Per Package

| Package            | Fix | Cleanup | Nice to have | Status   |
|--------------------|-----|---------|--------------|----------|
| apps/web           | 5   | 4       | 6            | 10/10 highest-priority items fixed |
| packages/map-core  | 0   | 10      | 4            | audited; none fixed yet |
| packages/data-models   | —   | —       | —            | not audited |
| packages/map-modules   | —   | —       | —            | not audited |
| packages/ui            | —   | —       | —            | not audited |

## Notes on methodology

- `apps/web`: 4 parallel Explore sub-agents audited `app/`, `components/`, `lib/`, and `hooks+scripts+deps`.
- `packages/map-core`: 4 parallel Explore sub-agents audited compiler core, shell/viewport, manifest/render hooks, and terrain hooks.
- All findings were re-verified against the source before inclusion. Rejected false positives from the map-core pass:
  - `useManifestRenderer` popup cleanup — code at `use-manifest-renderer.ts:443-444` already removes both popups.
  - `useDeckOverlay` concurrent-run race — `cancelled` is declared inside each effect body; closures are isolated.
  - `useHillshade`/`useLandMask`/`useNightlights` "asymmetric catch" — the condition is correct orphan-source cleanup.
  - `MapViewport` `map.on("load")` leak — `mapRef.remove()` in cleanup tears down all listeners.
  - `useRippleLayers` RAF/setTimeout race — `timeoutRef` is cleared in cleanup and `running` is checked before re-scheduling.
- Rejected false positives from the `apps/web` pass (from build runs 1 + 2):
  - `/api/citybikes` flagged as unused — actually registered in `lib/ai/data-catalog.ts:277`.
  - `ChatPanel` props `onFileUpload` / `loading` — both in use (`app/app/(editor)/map/new/page.tsx:804`, deprecated prop).
  - `/smoke-test` e2e flagged as broken — the page lives at `app/(maps)/smoke-test/page.tsx`.
