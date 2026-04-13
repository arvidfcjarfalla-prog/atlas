# web

Largest package (~300+ files) and overall healthy: SSRF guards, RLS-backed routes, structured logging, two-layer cache. Main concerns are a parallel non-streaming `edit-map` route/prompt now superseded by `/api/ai/chat`, an unused `case-memory` HTTP surface that writes to `.next/cache` (non-durable on Vercel), duplicated `validateFetchUrl`, stale `patterns/` module, and a few unused package.json entries.

## Fix These (breaks things or hides bugs)

- **Duplicated SSRF validator drifting** — `apps/web/app/api/ai/generate-map/route.ts:149` defines its own `validateFetchUrl` while an exported one lives at `apps/web/lib/ai/tools/url-fetcher.ts:34`. Two copies of security-sensitive code with different signatures (`void` vs `URL`) invite drift. Fix: import from `url-fetcher` and delete the local copy.

- **`request.ip` usage in middleware** — `apps/web/middleware.ts:55` falls back to `request.ip` which is deprecated in Next 14 and removed in 15; with an empty `x-forwarded-for` the rate limiter bucket becomes `"unknown"` — a single shared bucket for every anon request. Fix: drop `request.ip` and rely solely on `x-forwarded-for` / `x-real-ip`, and bucket unknown IPs per-UA or reject.

- **Global `refetchInterval: 5 min` on every React Query** — `apps/web/app/providers.tsx:14` sets a default 5-minute `refetchInterval` for all queries app-wide. This auto-polls `recent-maps`, earthquakes, and any other query forever, burning Supabase quota. Fix: remove the default `refetchInterval`; opt-in per query where polling is actually needed.

- **Thumbnail upload accepts unbounded payload** — `apps/web/app/api/thumbnails/route.ts:29` only checks `buffer.length < 100`; no upper bound. An authenticated user can upload arbitrarily large JPEGs into public storage. Fix: reject buffers over ~1–2 MB and verify `body.dataUrl.length` before decoding.

- **`manifest` null fallback leaks into hook with invalid shape** — `apps/web/app/app/(editor)/map/[id]/page.tsx:445` passes `{ layers: [], basemap: "light" } as unknown as MapManifest` to `useAgentChat` while the real manifest is loading. The cast hides missing required fields (`version`, `title`, `defaultCenter`, `defaultZoom`) and the agent prompt may be built against a stub. Fix: gate the `<ChatPanel>` / `useAgentChat` render on `manifest != null` instead of casting.

- **`runPipeline` deps omit `queryClient` / `showToast`** — `apps/web/app/app/(editor)/map/new/page.tsx:319` lists only `[user, router, callClarify, generateAndRender]` but closes over `queryClient`, `showToast`, `artifactId`, and `prompt`. Captures are stable in practice but this is a silent hook-rule violation that will bite on refactor. Fix: add the missing deps or move them into refs.

- **`catch {}` swallows SSE JSON parse errors silently** — `apps/web/lib/hooks/use-agent-chat.ts:268`: any malformed SSE payload is dropped without telemetry. When the backend format drifts the UI just freezes with no clue. Fix: `reportError` / `log("chat.sse_parse_failed", { line })` before swallowing.

- **Dev-only `console.log` left in hot path** — `apps/web/lib/ai/tools/web-research.ts:568-608` and `apps/web/app/app/(editor)/map/new/page.tsx:160` emit unstructured `console.log` from request-handling code. Fix: route through `log()` / `logDiagnostic()` or delete.

## Clean Up (dead code, unused stuff)

- **`/api/ai/edit-map` route is orphaned** — `apps/web/app/api/ai/edit-map/route.ts` and `apps/web/lib/ai/edit-map-prompt.ts` are only referenced by their own test (`lib/ai/__tests__/edit-map-api.test.ts`); the editor uses `/api/ai/chat` via `use-agent-chat.ts`. `app/api/ai/chat/route.ts:4` itself says it "replaces the old edit-map JSON-response approach". Fix: delete the route, prompt, and test.

- **`/api/ai/case-memory` writes to `.next/cache` and has no caller** — `apps/web/app/api/ai/case-memory/route.ts` persists to `.next/cache/atlas-cases/` via `apps/web/lib/ai/case-memory.ts:17`. On Vercel that path is read-only at runtime, and no client ever hits the route (confirmed via repo-wide grep; `generate-map/route.ts` mints a `caseId` but never posts). Fix: delete the route + `case-memory.ts` (or replace with a Supabase-backed store) and stop returning `caseId`.

- **`lib/ai/patterns/` module is unused** — `apps/web/lib/ai/patterns/index.ts:11` exports `PATTERNS` and `findPattern`, but nothing imports them (only referenced in `apps/web/lib/ai/tools/AI_ARCHITECTURE.md:730`). Seven pattern files + index are dead weight. Fix: delete the whole `patterns/` directory if not part of an active plan.

- **`jspdf` declared but never imported** — `apps/web/package.json:37` lists `jspdf@^4.2.1`; zero imports anywhere in the repo (`exportPDF` in `lib/utils/export.ts` uses the browser print path). Fix: remove from dependencies.

- **`@radix-ui/react-scroll-area` and `@radix-ui/react-slot` declared but only used via `@atlas/ui`** — `apps/web/package.json:26-27`. apps/web code never imports them directly; both come in transitively through `@atlas/ui`. Fix: drop both direct dependencies.

- **Two hooks directories** — `apps/web/hooks/use-sidebar.ts` vs `apps/web/lib/hooks/` (`use-agent-chat.ts`, `use-toast.ts`). Single-file `hooks/` dir is easy to overlook. Fix: move `use-sidebar.ts` to `lib/hooks/` and update the single importer `apps/web/app/app/(hub)/layout.tsx:5`.

- **`lib/utils.ts` duplicates `@atlas/ui`'s `cn`** — `apps/web/lib/utils.ts:4` re-implements `cn` with `clsx` + `twMerge`; `@atlas/ui` already exports `cn` (`packages/ui/src/index.ts:1`). Three files import the local copy (`(hub)/page.tsx:14`, `(marketing)/landing.tsx:7`, `ui/textarea.tsx:3`). Fix: import `cn` from `@atlas/ui` and delete `lib/utils.ts`.

- **Three TODO markers in `lib/ai/tools/AI_ARCHITECTURE.md`** — lines 138, 433, 605, 781 describe unimplemented glue code. Harmless but stale. Fix: either implement or drop the TODO paragraphs from the doc.

## Nice to Have (style, consistency)

- **Component filename casing is mixed** — `ChatPanel.tsx`, `LayerList.tsx` vs `back-to-atlas.tsx`, `app-sidebar.tsx`, `family-meta.tsx`, `block-backgrounds.tsx`. Handover item 21 acknowledges this was deferred. Fix: pick one (kebab-case matches Next.js idioms and the rest of the monorepo) and rename.

- **Editor pages have grown beyond 800 lines** — `apps/web/app/app/(editor)/map/new/page.tsx` (896) and `[id]/page.tsx` (879) each bundle pipeline orchestration, saved views, heatmap controls, export menu wiring, autosave, and keyboard handling. Fix: extract `useEditorAutoSave`, `useSavedViews`, and the pipeline state machine into `lib/hooks/`.

- **`as unknown as MapManifest` cast pattern is spreading** — 7 sites in editor + hub pages (`app/app/(editor)/map/[id]/page.tsx:225,231,294,351`, `app/app/(editor)/map/new/page.tsx:284,380,452,502`, `app/app/(hub)/page.tsx:669`, `app/app/(hub)/gallery/page.tsx:117`). Fix: add a `supabaseJsonToManifest(row.manifest): MapManifest` helper that narrows once.

- **API routes hand-roll JSON body validation** — every POST/PATCH (`app/api/maps/route.ts:62-88`, `[id]/route.ts:49-70`, `app/api/ai/generate-map/route.ts:298-310`) reimplements "is it a string, is it too long". `zod` is already a dep. Fix: define request schemas in `lib/api/schemas.ts` and parse at the boundary.

- **Anthropic SDK imported twice** — `@ai-sdk/anthropic` (used via `ai` SDK) plus raw `@anthropic-ai/sdk` (`apps/web/lib/ai/tools/intent-classifier.ts:10`). Both ship into every Lambda. Fix: switch `intent-classifier` to the shared `ai`/`MODELS.utility()` path.

- **`no-constant-condition` disabled for slug retry loop** — `apps/web/app/api/maps/[id]/route.ts:141`. Loop body always returns except on retry, so the `while` guard is cosmetic. Fix: `for (let attempts = 0; attempts < 3; attempts++)`.

- **`useToast` timer ref has stale TS type** — `apps/web/lib/hooks/use-toast.ts:14` uses `useRef<ReturnType<typeof setTimeout>>()` without an initial value, which in React 19 / strict initializer types becomes `undefined` inferred. Fix: `useRef<ReturnType<typeof setTimeout> | null>(null)`.

## Looks Good

- `/api/ai/generate-map` route — self-correction loop, SSRF guard, Opus fallback, deterministic fast path, structured logging. Well-shaped.
- `/api/isochrone` route — LRU cache with stale-while-revalidate on 429/error, clean validation, capped breakpoints.
- `middleware.ts` rate limiter — periodic cleanup prevents map leak, graceful skip when Supabase env missing.
- `lib/ai/tools/url-fetcher.ts` — shared SSRF + timeout + row/feature caps, the reference implementation the generate-map copy should defer to.
- `lib/ai/validators/` — two-pass schema + cartographic validation with dedicated tests (`validators/__tests__/schema.test.ts`).
- Supabase map CRUD (`app/api/maps/route.ts`, `[id]/route.ts`) — RLS + explicit owner checks + slug collision retry.
- `lib/error-reporter.ts` / `lib/logger.ts` — thin, dependency-free, Vercel-log-friendly.
- Test coverage in `lib/ai/__tests__/` (43 files referenced in CLAUDE.md) — solid surface over the AI pipeline.
- Deterministic manifest path in `/api/ai/generate-map` — clean separation, zero-token success path.
