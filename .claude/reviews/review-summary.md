# Review Summary

Full monorepo audit done: `apps/web`, `packages/map-core`, `packages/data-models`, `packages/map-modules`, `packages/ui`. The codebase is healthier than expected. `apps/web` had the most real bugs — all 10 highest-priority items were fixed in build runs 1 + 2 + 3 (cron auth, timer cleanups, `vaul` removal, `as any` cast, KPI dedup, peerDeps, scripts README, `saveDraft` extraction, `url-fetcher`/`kolada-client` tests). None of the four packages has a runtime-crashing bug; the residual work is dead-code removal, a few type-lies in the compiler, a11y on the sidebar resize handle, and opportunistic refactors.

## Action List (by priority)

### High-value quick wins (< 10 min each)

1. **a11y on sidebar resize handle** — `packages/ui/src/layout/sidebar-layout.tsx:85-96` — add `role="separator"` + `tabIndex={0}` + arrow-key handlers. Effort: **5 min**
2. **Delete dead `cleanup` var in `useContourLines`** — `packages/map-core/src/use-contour-lines.ts:42,151` — real dead code. Effort: **2 min**
3. **Remove unused `MapControls` export + file** — `packages/map-core/src/index.ts:3`, `map-controls.tsx` — 0 consumers. Effort: **5 min**
4. **Remove dead `useTerrain` import** — `apps/web/app/(maps)/disasters/page.tsx:4`. Effort: **1 min**
5. **Remove `@radix-ui/react-dialog` + `@radix-ui/react-tooltip` from `packages/ui/package.json`** — zero imports. Effort: **5 min**
6. **Delete unused `jitterCoordinates`** — `packages/data-models/src/transforms.ts:21` + `index.ts:71`. Effort: **2 min**
7. **Fix geocoder stale-results bug** — `packages/map-core/src/geocoder-control.tsx:54` — add `setResults([])` on non-ok. Effort: **5 min**

### Medium (10-30 min)

8. **Delete the `Sheet` family + drop `vaul`** — `packages/ui/src/components/sheet.tsx`, `index.ts` exports, `package.json:19`. Zero consumers. Effort: **10 min**
9. **Drop 8 `Expr`-hiding paint-property casts in the compiler** — `packages/map-core/src/manifest-compiler.ts`. Effort: **20 min**
10. **Log empty catches in `useManifestRenderer`/`useDeckOverlay`/`useImageFills`** — 3 sites. Effort: **15 min**
11. **Extract `centroidOfLargestRing()` helper** — `packages/map-core/src/manifest-compiler.ts:117-143` vs `:383-398`. Effort: **15 min**
12. **Extract `glass` style constant** — `packages/map-modules/src/legend/{legend,gradient-legend,proportional-legend}.tsx`. Effort: **10 min**
13. **Replace `(map as any)` in `useDeckOverlay` with `IControl` types**. Effort: **10 min**
14. **Move `CompareView` `map.on("move")` into a keyed effect with explicit `off`**. Effort: **15 min**
15. **Fix Badge focus styles on non-focusable div** — `packages/ui/src/components/badge.tsx:8,29`. Effort: **5 min**
16. **Add `cameraPadding` post-init effect** — `packages/map-core/src/map-viewport.tsx:332-335`. Effort: **15 min**
17. **`MiniSparkline` labels prop mismatch** — accept it or stop passing. Effort: **5 min**

### Larger (2h+)

18. **Extract `useMapLayerResource` helper; port six terrain hooks** — ~90 % shared scaffolding. Effort: **2h+**
19. **Add component-level tests for `MapViewport`/`CompareView`/`MeasureControl`/`GeocoderControl`**. Effort: **2h+**
20. **Add tests for `map-modules`** — `use-time-window`, `timeline` buckets, `chart-overlay` projection, `mini-pie` math. Effort: **2h+**
21. **Standardize `apps/web/components/` filenames to one case** — deferred. Effort: **2h+**
22. **Decide on `EntityKind` — add `route`/`zone`/`project` interfaces, or narrow the union**. Effort: scope-dependent.

### Done in this arc

- 10 highest-priority `apps/web` items (build runs 1 + 2)
- `url-fetcher` + `kolada-client` test suites, +47 tests (build run 3)
- `saveDraft` extraction, -41 lines in `page.tsx` (build run 3)

## Per Package

| Package                 | Fix | Cleanup | Nice to have | Status   |
|-------------------------|-----|---------|--------------|----------|
| `apps/web`              | 5   | 4       | 6            | 10/10 highest-priority fixed |
| `packages/map-core`     | 0   | 10      | 4            | audited; not fixed |
| `packages/data-models`  | 0   | 1       | 2            | audited; not fixed |
| `packages/map-modules`  | 0   | 2       | 4            | audited; not fixed |
| `packages/ui`           | 1   | 4       | 2            | audited; not fixed |

**Totals:** 6 Fix · 21 Cleanup · 18 Nice-to-have across the monorepo. Of the 6 Fix items, 5 were in `apps/web` and all are resolved. The remaining Fix is the sidebar a11y issue above.

## Notes on methodology

- 4 parallel Explore sub-agents per package. Per-package scope breakdown lives in `review-{package}.md`.
- Every finding re-verified against source before inclusion. False positives dropped:
  - `map-core`: `useManifestRenderer` popup cleanup, `useDeckOverlay` cancel race, `useHillshade`/`LandMask`/`Nightlights` "asymmetric catch", `MapViewport` `map.on("load")` leak, `useRippleLayers` RAF/setTimeout race.
  - `apps/web`: `/api/citybikes` unused, `ChatPanel` `onFileUpload`/`loading` unused, `/smoke-test` e2e broken.
- Report files: `.claude/reviews/review-apps-web.md`, `review-map-core.md`, `review-data-models.md`, `review-map-modules.md`, `review-ui.md`.
