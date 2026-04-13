# apps/web

Healthy overall — pipeline, auth, and AI tool layer are well-tested and consistent. Main risks: one real auth gap in cron, a handful of unmounted-timer patterns, and a long tail of style inconsistency and untested edges.

## Fix These (breaks things or hides bugs)

- **Cron cleanup accepts unauthenticated requests if env var is missing** — `apps/web/app/api/cron/cleanup/route.ts:8` — `if (cronSecret && authHeader !== ...)` means when `CRON_SECRET` is unset (preview/local/misconfigured env) the guard is a no-op and anyone can purge `data_cache` and `clarify_cache`. Fix: require the secret — `if (!cronSecret || authHeader !== \`Bearer ${cronSecret}\`) return 401`.
- **`useToast` timer leaks on unmount** — `apps/web/lib/hooks/use-toast.ts:20` — `setTimeout(() => setToast(null), duration)` fires even after the consumer unmounts; React logs a "state update on unmounted component" warning and dangling timers accumulate. Fix: add a `useEffect(() => () => clearTimeout(timerRef.current), [])` cleanup.
- **`ChartOverlay` uses `map as any` to hide a type mismatch** — `apps/web/app/app/(editor)/map/[id]/page.tsx:165` — `<ChartOverlay map={map as any} ...>` escapes the type check between `useMap()` and `ChartOverlay`'s expected `maplibregl.Map`. Fix: inspect `ChartOverlay`'s prop type in `@atlas/map-modules`, align `useMap()`'s return (or widen the prop), delete the cast.
- **`ShareModal` copy-toasts not cleaned on unmount** — `apps/web/components/ShareModal.tsx:60` and `:67` — `setTimeout(() => setLinkCopied(false), 2000)` and the embed equivalent keep a handle to the modal state; if the user closes the modal within 2s, setState fires on an unmounted component. Fix: track the timeout id and clear it in a `useEffect` cleanup (or bail early with an `isMountedRef`).
- **`ExportMenu` nested setTimeouts not cleaned** — `apps/web/components/ExportMenu.tsx:43-54` — PNG/PDF/SVG export branches chain `setTimeout` calls up to 1200 ms to toggle a "exporting" flag; unmounting mid-export produces the same unmount warning. Fix: store ids in a ref and clear on unmount.

## Clean Up (dead code, unused stuff)

- **`vaul` is in `apps/web/package.json` but never imported in this app** — `apps/web/package.json:45` — it's only used inside `packages/ui/src/components/sheet.tsx`, and `apps/web` never imports `Sheet`. Fix: remove `vaul` from `apps/web/package.json` (it stays in `packages/ui` where it's actually used).
- **`ai-metric-matcher` helper exports only consumed by its own tests** — `apps/web/lib/ai/tools/ai-metric-matcher.ts:23` (`buildMetricMatchPrompt`) and `:43` (`parseMetricMatchResponse`) — production uses `aiSelectContentsValue` / `aiSelectTable`; the two helpers are only imported from the test file. Fix: inline them in the test, or colocate them in a `__tests__/helpers.ts`.
- **Fire-and-forget version save swallows errors silently** — `apps/web/app/app/(editor)/map/[id]/page.tsx:336` — `.catch(() => {})` on `/api/maps/${id}/versions` means failures never surface anywhere, so version history can silently fall behind. Fix: at least log to `lib/logger.ts`, or show a non-blocking toast on repeated failures.
- **Three near-identical save blocks in editor page** — `apps/web/app/app/(editor)/map/[id]/page.tsx:291`, `:357`, `:396` — same PATCH + status handling + toast logic repeated across three effects. Fix: extract one `saveDraft()` helper; halves the file's maintenance surface.

## Nice to Have

- **Missing tests for `url-fetcher`** — `apps/web/lib/ai/tools/url-fetcher.ts` — SSRF validation (`:34-72`) and CSV/GeoJSON sniffing (`:88-180`) have branching logic but no `__tests__/url-fetcher.test.ts`. Fix: add a small test file covering SSRF rejects and format detection.
- **Missing tests for `kolada-client`** — `apps/web/lib/ai/tools/kolada-client.ts` — `searchKolada` (`:156-282`) handles keyword→AI KPI matching, geometry joins and coverage thresholds with several fallback paths; no test file exists. Fix: add a test file exercising KPI matching and coverage rejection.
- **`KOLADA_KPIS` has duplicate values** — `apps/web/lib/ai/tools/kolada-client.ts:46-75` — `befolkning`, `invånare`, `population` all map to the same KPI id; easy to drift when edits land. Fix: move to a normalized `{ id: [aliases…] }` shape.
- **Filename casing is mixed in `components/`** — ~18 kebab-case (`app-sidebar.tsx`, `back-to-atlas.tsx`, `family-meta.tsx`) vs ~17 PascalCase (`ChatPanel.tsx`, `AuthModal.tsx`) side-by-side. Nothing enforces a rule. Fix: pick one (React convention is PascalCase) and rename in one PR.
- **Peer vs installed React versions don't match declared minimums** — `packages/{map-core,map-modules,ui}/package.json` declare `"react": "^18.0.0"` peer, `apps/web/package.json:41` installs `^18.3.1`. `^18.0.0` *does* satisfy `18.3.1`, so no bug — but the packages claim support for versions older than what's tested. Fix: bump package peerDeps to `^18.3.0` to match what's actually validated.
- **`scripts/` has ~10 one-off batch/eval scripts not wired to any pnpm script** — `scripts/batch-clarify.ts`, `scripts/eval-10-prompts.ts`, `scripts/eval-clarify-{50,batch,rerun}.ts`, `scripts/setup-data-cache.ts`. They're fine to keep but aren't obviously documented. Fix: add a three-line `scripts/README.md` noting each script's purpose and whether it's safe to re-run.

## Looks Good

- **Auth on protected API routes** — `/api/maps`, `/api/maps/[id]`, `/api/profile` verify user via Supabase before reading/writing; RLS enforces public vs private map access.
- **External-API routes degrade gracefully** — flights, earthquakes, wildfires, heritage, ISS all fall back to stale cache on upstream failure.
- **No `as any` / `@ts-ignore` in production `lib/`** — only in tests where needed for mock setup. One lone cast in `app/app/(editor)/map/[id]/page.tsx:165` (flagged above).
- **AI tool registration is guarded** — `lib/ai/tools/register-plugins.ts` uses a `pluginCount()` gate to prevent double-registration.
- **Scripts respect the node-import rule** — `scripts/eval-runner.ts` and siblings import from `packages/*/src/...js`, not the barrel (avoids the MapLibre CSS parse error).
- **Test coverage is thorough for the AI pipeline** — 40+ `__tests__/` files across `lib/ai/` covering resolution, geometry, joins, classification, persistence, determinism.
- **Middleware routes match actual pages** — all protected paths in `middleware.ts` resolve to real App Router pages.
- **Cron is wired correctly** — `vercel.json` schedules `/api/cron/cleanup` nightly; only the auth fallback (above) needs tightening.
