# map-modules

Healthy and tight. Two real bugs surfaced on re-review (array-mutation in `ProportionalLegend`, stale `TimelinePlaybackState` duplicate with `any` escapes), plus several unused barrel exports and duplicated inline-style blocks.

## Fix These (breaks things or hides bugs)

- **`ProportionalLegend` mutates caller's `items` array** — `packages/map-modules/src/legend/proportional-legend.tsx:91-92` — the label column calls `items.sort((a, b) => b.radius - a.radius)` directly on the incoming prop. `Array.prototype.sort` mutates in place, so every render reorders the caller's array. The earlier `const sorted = [...items].sort(...)` at line 31 does it correctly. Fix: reuse `sorted` for the label column, or write `[...items].sort(...)` on line 91.
- **`TimelinePlaybackState` re-declared with `any` and loose optionals** — `packages/map-modules/src/playback/timeline-playback-bar.tsx:4-18` — local interface duplicates the real type exported from `@atlas/map-core` (`use-timeline-playback.ts:11-32`), uses `any` via two `eslint-disable` comments, and marks `speed`/`speedOptions`/`setSpeed` optional when the source type has them required. The editor page already imports the real type from `@atlas/map-core` (`apps/web/app/app/(editor)/map/[id]/page.tsx:6-7`) and passes it here, so the loose shape hides prop-contract drift. Fix: move `TimelinePlaybackState` + `PlaybackSpeed` into `@atlas/data-models` (neutral dependency, both packages already consume it) and import from there in both `map-core` and `map-modules`. Drops both `any` escapes.
- **`Timeline` recomputes buckets on every render** — `packages/map-modules/src/timeline/timeline.tsx:31` — `const now = Date.now()` runs on every render and feeds the `buckets`/`maxCount`/`totalInWindow` memos via the dep array (line 58), so memoization is effectively disabled. Not broken, but defeats the point of `useMemo` over a `BUCKET_COUNT` loop across all entities. Fix: compute `now` inside the `useMemo` callback, or quantize it (e.g. `Math.floor(Date.now() / 60_000)`) so memos stay stable within the bucket resolution.
- **`MiniSparkline` accepts `labels` but discards it** — `packages/map-modules/src/chart-overlay/mini-sparkline.tsx:10` — prop declared for "sibling-chart uniformity" and never rendered, while `ChartOverlay` unconditionally passes `labels={config.labels}` to all three chart types (`chart-overlay.tsx:121`). A manifest author supplying `labels` for a sparkline silently gets no tooltips. Fix: render `labels` as SVG `<title>` tooltips on per-point invisible markers, or remove the prop and narrow the `ChartOverlay` call so sparkline configs cannot provide `labels`.

## Clean Up (dead code, unused stuff)

- **`MiniBar` / `MiniPie` / `MiniSparkline` exported from the barrel but only consumed internally** — `packages/map-modules/src/index.ts:9-11` — repo-wide grep confirms only `chart-overlay.tsx` and the barrel itself reference them; every chart is driven by `ChartOverlay` based on `ChartOverlayConfig.type`. Fix: drop those three lines from `src/index.ts` — keep the files as `ChartOverlay` internals.
- **`GradientLegendItem` / `ProportionalLegendItem` types exported but never imported externally** — `packages/map-modules/src/index.ts:5-6` — `apps/web/components/LegendOverlay.tsx:28` hand-builds the proportional shape with a `filter(...) as {...}` cast instead of importing the type, and no other consumer references either. Fix: either use them in `LegendOverlay` (remove the cast at `LegendOverlay.tsx:28`) or drop them from the public surface.
- **`TIME_WINDOW_MS` exported but only used inside the package** — `packages/map-modules/src/index.ts:2` — only `use-time-window.ts` references the constant. Fix: drop from the barrel.
- **`useTimeWindow` exported but only used inside the package** — `packages/map-modules/src/index.ts:2` — app code mounts `TimeWindowProvider` around `<Timeline />` but never consumes the context directly (verified via repo-wide grep — only the package's own `timeline.tsx` calls the hook). Fix: drop from the barrel, or keep with an explicit `// public API for external time-window consumers` comment.

## Nice to Have (style, consistency)

- **Three legend components repeat the same title `<h3>` block and `glass` wrapper** — `legend.tsx:25-41`, `gradient-legend.tsx:42-58`, `proportional-legend.tsx:36-52` — identical ~15-line inline-style blocks. Fix: extract a small `LegendShell` (title + outer `glass` div) into `legend-styles.ts` (or a sibling `legend-shell.tsx`) and reuse across all three.
- **Hardcoded color literals vs. design tokens** — all three legends plus `timeline-playback-bar.tsx` use raw `rgba(228,224,216,0.7)`, `rgba(99,130,255,0.12)`, `#5a5752`, etc. The rest of the app drives colors from `packages/ui/src/tokens/themes.css`. Fix: consolidate into named constants in `legend-styles.ts` (`LEGEND_LABEL_COLOR`, `LEGEND_TITLE_COLOR`, `ACCENT_BLUE`) or, better, reference CSS variables so theme changes propagate.
- **`ChartOverlay.MapLike` shape not exported** — `packages/map-modules/src/chart-overlay/chart-overlay.tsx:21-27` — deliberate: avoids a hard `maplibre-gl` dep on this package. `apps/web/app/app/(editor)/map/[id]/page.tsx:163-166` wraps `useMap()` and relies on structural typing. Fix: `export interface MapLike` so wrappers can typecheck against a named contract.
- **Array index keys in visual lists** — `mini-bar.tsx:24`, `mini-pie.tsx:44`, `timeline.tsx:120`, `chart-overlay.tsx:103`. Stable arrays today (`BUCKET_COUNT = 48` is fixed; feature order is manifest-determined), so no current reconciliation bug — but if sorting/filtering is ever added, index keys will misalign DOM state (tooltips, CSS animations). Fix: prefer stable keys from data (`bucket.startMs`, `label`, `feature.id`) where available.
- **No tests for any component** — 11 source files, 0 tests. Handover item 20 already flags `use-time-window`, timeline buckets, chart-overlay projection, and mini-pie math. Highest-value first tests:
  - `timeline/use-time-window.ts` — pure state, trivial to cover.
  - `timeline/timeline.tsx` — bucket distribution (empty data, single entity, time-boundary clamp).
  - `chart-overlay/mini-pie.tsx` — slice angles with 0-value, single-value, all-equal, negative inputs.
  - `chart-overlay/chart-overlay.tsx` — position projection + `maxVisible` clamp.

## Looks Good

- Public API minimal and re-exported cleanly through `src/index.ts`.
- `TimeWindowProvider` uses `useCallback` + `useMemo` correctly; context value is stable across re-renders.
- `ChartOverlay` effect cleanup is correct — unsubscribes `move`/`zoom` on unmount and on `updatePositions` identity change (`chart-overlay.tsx:73-81`).
- `MiniPie` math guards `total === 0` and clamps negatives via `Math.max(v, 0)` (`mini-pie.tsx:14, 26`).
- `MiniBar` / `MiniSparkline` handle empty arrays and single-point sparklines (`values.length < 2` → null).
- `DetailPanel` respects null entity, uses `@atlas/ui` primitives (`Badge`, `ScrollArea`, `cn`) instead of hand-rolling, good semantic structure.
- No `as any`, no `@ts-ignore`, no `@ts-expect-error` anywhere in the package source.
- No empty catch blocks, no swallowed errors, no async effects without cleanup.
- `lucide-react` pinned to `^0.462.0` — matches `packages/ui`, `packages/map-core`, and `apps/web`.
- `peerDependencies` on React correct; no duplicate-React install risk.
- All major components confirmed consumed by `apps/web`: `Legend`/`GradientLegend`/`ProportionalLegend` → `LegendOverlay.tsx`, `Timeline`/`TimeWindowProvider`/`DetailPanel` → `(maps)/disasters/page.tsx`, `TimelinePlaybackBar`/`ChartOverlay` → `(editor)/map/[id]/page.tsx`, `Legend` also → `(maps)/smoke-test/page.tsx`.
