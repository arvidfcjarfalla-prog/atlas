# data-models

Tight and well-tested. One unused export, one consistency gap between the `EntityKind` union and the actual `entities/` folder. No bugs.

## Fix These (breaks things or hides bugs)

_None._

## Clean Up (dead code, unused stuff)

- **`jitterCoordinates` exported but never called** — `packages/data-models/src/transforms.ts:21`, re-exported at `packages/data-models/src/index.ts:71`. `rg jitterCoordinates` returns only the definition and the barrel; no consumer in `apps/` or `packages/`. Fix: delete the function and its export, or mark with a `// reserved for future entity rendering` comment if speculative.

## Nice to Have (style, consistency)

- **`EntityKind` declares `route | zone | project` but no interfaces exist for them** — `packages/data-models/src/entities/base.ts:3` defines `export type EntityKind = "event" | "asset" | "route" | "zone" | "project";` but only `event.ts` and `asset.ts` provide dedicated interfaces. `kind: "zone"` and `kind: "route"` are used widely (`apps/web/lib/ai/patterns/{isochrone,flow,choropleth}.ts`, `apps/web/lib/templates.ts`, fixtures) — they just fall back to the shared `GeoEntity` base. Fix: either (a) add `RouteEntity`, `ZoneEntity`, `ProjectEntity` to formalise kind-specific fields, or (b) narrow `EntityKind` to only the kinds that have dedicated interfaces. Decision belongs to whoever owns the entity model roadmap.

- **No tests for `transforms.ts`, `manifest.ts`, or entity types** — that's fine for pure type files (`manifest.ts`, entity interfaces) but `transforms.ts` has `getAgeBracket` + `jitterCoordinates` with actual logic. If `jitterCoordinates` stays, add a smoke test.

## Looks Good

- `packages/data-models/src/classification.ts` — 18 tests cover all 5 methods.
- `packages/data-models/src/palettes.ts` — 9 tests, all 17 `ColorScheme` variants have data, categorical + sequential paths verified.
- `packages/data-models/src/manifest.ts` — pure types, cleanly exported; `unknown[]` for MapLibre filter expressions is intentional.
- `packages/data-models/src/entities/severity.ts` — `SEVERITY_HEX`, `SEVERITY_COLOR`, `maxSeverity`, `compareSeverity` all have external consumers.
- `packages/data-models/src/entities/event.ts`, `entities/asset.ts` — used; no issues.
- `packages/data-models/src/index.ts` — curated barrel, not a star-export.
- Zero `as any`, zero `@ts-ignore`, zero TODO/FIXME, zero commented-out blocks across the package.
