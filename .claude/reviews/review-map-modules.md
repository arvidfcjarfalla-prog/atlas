# map-modules

Fifteen React components, zero tests. No bugs found — the findings are a duplicated `glass` style constant across three legend files, one prop mismatch where `ChartOverlay` passes a `labels` prop that `MiniSparkline` doesn't accept, and a cluster of array-index keys in small visual lists (stable arrays today, but worth flagging).

## Fix These (breaks things or hides bugs)

_None._

## Clean Up (dead code, unused stuff)

- **`glass` style constant duplicated across all three legend files** — `packages/map-modules/src/legend/legend.tsx:19-25`, `legend/gradient-legend.tsx:16-22`, `legend/proportional-legend.tsx:18-24`. Same six-property object in three places. Fix: extract to `packages/map-modules/src/legend/styles.ts` and import.

- **`ChartOverlay` passes `labels` to `MiniSparkline`; `MiniSparkline` ignores it** — `packages/map-modules/src/chart-overlay/chart-overlay.tsx:121` sends `labels={config.labels}` to all three mini-charts, but `MiniSparkline` only declares `{ values, size }` (`mini-sparkline.tsx:4-9`). React silently drops the extra prop; no runtime error, but it's a false expectation. Fix: either add `labels?: string[]` to `MiniSparkline` (for tooltip parity with `MiniBar`/`MiniPie`) or don't pass `labels` for sparkline charts.

## Nice to Have (style, consistency)

- **Array index keys in visual lists** — `packages/map-modules/src/chart-overlay/mini-bar.tsx:24`, `chart-overlay/mini-pie.tsx:44`, `timeline/timeline.tsx:120`, `chart-overlay/chart-overlay.tsx:103`. All four render stable arrays today (`buckets.length === 48` in timeline; feature order in chart-overlay is determined by manifest), so no current reconciliation bug — but if ordering ever becomes dynamic (sort, filter), index keys will cause DOM mis-reconciliation. Fix: prefer stable keys from the data (e.g. `bucket.startMs`, `feature.id`, `label`) when easy.

- **No tests in the entire package** — 15 source files, 0 tests. The highest-value tests would cover:
  - `timeline/timeline.tsx` bucket distribution (edge cases: empty data, single entity, time-boundary clamp)
  - `chart-overlay/chart-overlay.tsx` position projection + viewport filtering
  - `timeline/use-time-window.ts` context state updates
  - `chart-overlay/mini-pie.tsx` slice angle math with 0 / single / all-equal values
  Fix: add a `__tests__/` folder and start with `use-time-window` (pure state) + `timeline` (pure math).

- **`TimelinePlaybackBar` uses `readonly any[]` + `any` for speed options** — `packages/map-modules/src/playback/timeline-playback-bar.tsx:11-12,16-17`. Mirrors the type from `map-core`'s `PlaybackSpeed`; the `eslint-disable` comments acknowledge it. Fix: import `PlaybackSpeed` from `@atlas/map-core` and drop the casts — the type is already part of that package's public API.

## Looks Good

- `packages/map-modules/src/index.ts` — clean barrel.
- `packages/map-modules/src/detail-panel/detail-panel.tsx` — well-structured, no hook bugs.
- `packages/map-modules/src/timeline/use-time-window.ts` — context provider with correct dependency arrays.
- `packages/map-modules/src/legend/{legend,gradient-legend,proportional-legend}.tsx` — apart from the duplicated `glass`, logic is sound.
- Exports are all consumed: `Legend`/`GradientLegend`/`ProportionalLegend` → `LegendOverlay`, `Timeline`/`TimeWindowProvider` → disasters page, `TimelinePlaybackBar`/`ChartOverlay` → editor map page, `DetailPanel` → disasters page, `MiniBar`/`MiniPie`/`MiniSparkline` → only via `ChartOverlay` (intentional internal).
- Zero empty catches, zero `@ts-ignore`, no stale TODOs.
