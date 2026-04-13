# Review Summary — 2026-04-13

Fresh full-monorepo review. One agent per package (data-models inline, other four parallel sub-agents with fresh context). Overall health is good: no critical security breaks, strong test coverage in data-models/map-core, validators + SSRF guards + RLS all in place. Real issues cluster in three areas: **map-core basemap lifecycle** (disable/deps changes don't propagate to MapLibre), **deck.gl families silently dead** (missing install), and **`apps/web` carrying obsolete AI code paths** (`edit-map`, `case-memory`, `patterns/`). Plus broad dead-code cleanup across `ui` tokens, orphaned deps, and barrel re-exports.

## Action List (by priority)

### P0 — bugs / correctness / security

1. **Install deck.gl packages** — `packages/map-core/src/use-deck-overlay.ts:85` dynamic-imports `@deck.gl/mapbox`/`aggregation-layers`/`geo-layers` but nothing in `node_modules`. `hexbin-3d`, `screen-grid`, `trip` families render nothing (silent `console.warn`). Effort: **5 min + verify**.
2. **Basemap toggle-off leaks layers** — `packages/map-core/src/use-map-layer-resource.ts:184` cleans up only on unmount. Flipping `basemap.hillshade` true→false leaves layer on map. Same for nightlights/tectonic/contour/terrain. Effort: **30 min**.
3. **Basemap dep updates ignored after first setup** — same file, `if (state.added) return` — changing `contour.interval`, `terrain.exaggeration`, `land-mask.color` is a no-op. Effort: **30 min**.
4. **Global `refetchInterval: 5 min` in React Query** — `apps/web/app/providers.tsx:14`. App-wide auto-poll burns Supabase quota. Effort: **5 min**.
5. **Duplicated SSRF validator drifting** — `apps/web/app/api/ai/generate-map/route.ts:149` re-implements `validateFetchUrl` with a different signature than `lib/ai/tools/url-fetcher.ts:34`. Security-sensitive drift. Effort: **15 min**.
6. **`request.ip` in rate limiter** — `apps/web/middleware.ts:55`. Deprecated in Next 14, removed in 15; empty XFF collapses all anon requests into one bucket. Effort: **15 min**.
7. **Thumbnail upload unbounded payload** — `apps/web/app/api/thumbnails/route.ts:29` only has a minimum. Effort: **5 min**.
8. **`ProportionalLegend` mutates caller's `items`** — `packages/map-modules/src/legend/proportional-legend.tsx:91-92` calls `.sort()` on the prop array. Reuse the `sorted` const on line 31. Effort: **2 min**.
9. **Timeline memoization broken** — `packages/map-modules/src/timeline/timeline.tsx:31` reads `Date.now()` outside `useMemo` and feeds the dep array, invalidating every render. Effort: **5 min**.
10. **`prefers-reduced-motion` not honored for sidebar slide-in** — `packages/ui/src/layout/sidebar-layout.tsx:131`. Violates `.claude/rules/editorial-landing.md`. Effort: **10 min**.

### P1 — dead-code cleanup (high volume, low risk)

11. **Delete `/api/ai/edit-map` + `lib/ai/edit-map-prompt.ts` + test** — orphaned; editor uses `/api/ai/chat`. Effort: **10 min**.
12. **Delete `/api/ai/case-memory` + `lib/ai/case-memory.ts`** — no callers; writes to `.next/cache` which is read-only on Vercel. Effort: **5 min**.
13. **Delete `apps/web/lib/ai/patterns/`** — `PATTERNS`/`findPattern` zero importers. Effort: **2 min**.
14. **Delete `packages/ui/src/components/button.tsx` + `card.tsx`** — zero consumers anywhere. Drop barrel exports. Effort: **10 min**.
15. **Delete dead CSS tokens in `packages/ui/src/tokens/themes.css`** — `--explosion`, `--military`, `--naval`, all 8 `--sidebar-*` vars. Also Tailwind aliases. Effort: **15 min**.
16. **Decide on `data-mode="own"` / `"refine"` blocks** — `packages/ui/src/tokens/themes.css:61-83, 111-133` unreachable. Wire up or delete. Effort: **verify with product**.
17. **Delete unused deps**: `lucide-react` from `packages/ui` and `packages/map-core`; `jspdf`, `@radix-ui/react-scroll-area`, `@radix-ui/react-slot` from `apps/web` (reach via `@atlas/ui`). Effort: **10 min**.
18. **Delete `AssetEntity` + `entities/asset.ts`** — zero importers. Effort: **5 min**.
19. **Drop orphan barrel exports**: `compareSeverity`, `SEVERITY_PRIORITY` (data-models); `MiniBar`/`MiniPie`/`MiniSparkline`, `GradientLegendItem`/`ProportionalLegendItem` types, `TIME_WINDOW_MS`, `useTimeWindow` (map-modules); `MapContextValue`/`MapShellProps`/`CameraPadding`/`CompiledSourceConfig`, `badgeVariants`/`BadgeProps` (ui/map-core). Internal use only — keep files, drop re-exports. Effort: **15 min**.
20. **Consolidate duplicated `cn`** — `apps/web/lib/utils.ts` duplicates `@atlas/ui`'s. Move `apps/web/components/ui/textarea.tsx` to `@atlas/ui` and drop `apps/web/lib/utils.ts`. Effort: **10 min**.
21. **Consolidate hooks dirs** — `apps/web/hooks/use-sidebar.ts` vs `apps/web/lib/hooks/*`. Effort: **5 min**.
22. **Delete stale `review-apps-web.md`** — superseded by `review-web.md` from this run. Effort: **1 min**.

### P2 — consistency / style

23. **`EntityKind` union mismatch** — `project` kind has zero usages; `route`/`zone` have no dedicated interfaces. Narrow or formalize. (Handover item 22.)
24. **Move `TimelinePlaybackState` to `data-models`** — currently duplicated between `map-core` and `map-modules` with `any` escapes in the latter. Effort: **30 min**.
25. **Component filename casing** — handover item 21. Standardize on kebab-case. Effort: **1h+**.
26. **Editor pages > 800 lines** — `app/app/(editor)/map/new/page.tsx` (896), `[id]/page.tsx` (879). Extract hooks. Effort: **2h+**.
27. **Zod schemas for API routes** — dep already installed; several routes hand-roll JSON validation. Effort: **incremental**.
28. **Anthropic SDK dual import** — `@anthropic-ai/sdk` in `lib/ai/tools/intent-classifier.ts:10` alongside `@ai-sdk/anthropic` everywhere else. Route via shared `MODELS`. Effort: **30 min**.
29. **Missing tests**: `getAgeBracket`, all of `map-modules` (11 files, 0 tests), `packages/ui/SidebarLayout` drag logic, `turf-transforms.ts` in map-core. Handover item 20. Effort: **incremental**.
30. **Unused import** `LngLat` at `packages/map-core/src/measure-control.tsx:5`. Effort: **1 min**.
31. **Replace `require("h3-js")` with `import`** — `packages/map-core/src/manifest-compiler.ts:1430`. Effort: **5 min**.

## Per Package

| Package | Fix | Cleanup | Nice to have |
|---------|-----|---------|--------------|
| data-models | 0 | 3 | 3 |
| map-core | 4 | 4 | 5 |
| map-modules | 4 | 4 | 5 |
| ui | 3 | 8 | 5 |
| web | 8 | 8 | 8 |
| **Total** | **19** | **27** | **26** |

Individual reports: `review-data-models.md`, `review-map-core.md`, `review-map-modules.md`, `review-ui.md`, `review-web.md`.

## Suggested Execution Order

**Batch A — P0 bugs (1h):** #8 → #9 → #4 → #7 → #10 → #5 → #6 → #1. One PR, each localised, < 30 min. Start here.

**Batch B — map-core lifecycle (1h):** #2 + #3 together. Same helper, same tests. Second PR.

**Batch C — dead-code sweep (2h):** #11 → #13 → #14 → #15 → #17 → #18 → #19 → #20 → #21 → #22. Mechanical deletions, big `-`-only diff. Third PR.

**Batch D — consistency (defer):** #23–#31. Schedule as ambient improvements or pair with related feature work.

## Methodology

- `data-models` reviewed inline (small, tight package — grep-verified every claim against current source before writing).
- `map-core`, `map-modules`, `ui`, `web` reviewed by parallel `code-reviewer` sub-agents with fresh context (no conversation history, only CLAUDE.md + their assigned package).
- Each finding includes `file:line` + a concrete Fix sentence. No claims about "unused" without repo-wide grep evidence.
- Previous review (`review-apps-web.md` etc. from March arc) is superseded — that cycle's P0/P1 items were all landed in build runs 1–4. This run surfaces a fresh batch against current state.
