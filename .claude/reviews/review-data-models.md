# data-models

Tight and well-tested. A few dead exports and one consistency gap between the `EntityKind` union and the actual `entities/` folder. No bugs.

## Fix These (breaks things or hides bugs)

_None._

## Clean Up (dead code, unused stuff)

- **`AssetEntity` interface has no consumers** — `packages/data-models/src/entities/asset.ts` and its re-export `packages/data-models/src/index.ts:9`. `rg AssetEntity` returns only the definition and the barrel — no file in `apps/` or `packages/` imports the type. The string `kind: "asset"` is used in templates/examples, but via the base `GeoEntity`. Fix: delete `entities/asset.ts` and its barrel export, OR start using it (e.g. type the `kind: "asset"` callsites in `apps/web/lib/templates.ts`).

- **`compareSeverity` exported but only called from `maxSeverity` in the same file** — `packages/data-models/src/entities/severity.ts:26`, re-exported at `index.ts:15`. `rg compareSeverity` outside the file returns nothing. Fix: drop from `index.ts` barrel (keep the function — it's used by `maxSeverity`).

- **`SEVERITY_PRIORITY` exported but only used inside `compareSeverity`** — `packages/data-models/src/entities/severity.ts:3`, re-exported at `index.ts:12`. No external consumer. Fix: drop from `index.ts` barrel.

## Nice to Have (style, consistency)

- **`EntityKind` declares `route | zone | project` but no interfaces exist for them** — `packages/data-models/src/entities/base.ts:3`. `kind: "zone"` / `kind: "route"` are used widely (`apps/web/lib/ai/patterns/{isochrone,flow,choropleth}.ts`, `apps/web/lib/templates.ts`, `lib/ai/example-bank.ts`, fixtures) — they fall back to the shared `GeoEntity`. `kind: "project"` has zero usages in the whole repo (`rg "kind: \"project\""` → 0 matches). Fix: either (a) add `RouteEntity`, `ZoneEntity` interfaces to formalise kind-specific fields and drop `project`, or (b) narrow `EntityKind` to `"event" | "asset" | "route" | "zone"` since `project` is unused. This is handover item 22.

- **No tests for `transforms.ts`** — `getAgeBracket` has real logic (time-bucket thresholds) and a single consumer (`apps/web/lib/use-earthquakes.ts:50`). A 4-line boundary test would pin the thresholds. `manifest.ts` and the entity files are pure types and correctly untested.

- **Stale review doc** — the previous `review-data-models.md` claimed `jitterCoordinates` existed in `transforms.ts` and that `compareSeverity` had external consumers. Neither is true in current code. This replacement corrects both.

## Looks Good

- `classification.ts` — 18 tests cover all 5 methods (equal-interval, quantile, natural-breaks/Fisher-Jenks with sampling, manual, categorical). Edge cases for empty/single/identical values handled.
- `palettes.ts` — 9 tests, all 17 `ColorScheme` variants validated, categorical vs sequential sampling paths verified.
- `manifest.ts` — ~420 lines of pure types, cleanly organised by concern (family configs, classification, color, legend, interaction, transforms, deck.gl families). `unknown[]` on `LayerManifest.filter` is intentional (MapLibre expression).
- `entities/severity.ts` — `SEVERITY_HEX` used in `apps/web/app/(maps)/disasters/page.tsx`, `packages/map-core/src/use-map-layers.ts`, `use-ripple-layers.ts`. `SEVERITY_COLOR` + `maxSeverity` used in `packages/map-modules/src/timeline/timeline.tsx`.
- `entities/event.ts` — used by `apps/web/lib/use-earthquakes.ts`.
- `index.ts` — curated barrel, not a star-export; keeps public surface intentional.
- Zero `as any`, zero `@ts-ignore`, zero TODO/FIXME, zero commented-out blocks across the package.
