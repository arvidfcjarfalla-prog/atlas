# Plan: Batch A — P0 bug fixes from 2026-04-13 review

## Current State

All 10 review findings verified against current source. Nothing has been silently fixed since the review ran. Key files touched:

- `packages/map-core/src/use-map-layer-resource.ts` — recent refactor (commit 5b02393); setup-effect cleanup only cancels the async signal, never calls `runResourceCleanup`. That's the root of both basemap bugs.
- `packages/map-core/src/use-deck-overlay.ts:85` — dynamic imports `@deck.gl/mapbox`, `@deck.gl/aggregation-layers`, `@deck.gl/geo-layers`. None in `apps/web/package.json` or `packages/map-core/package.json`.
- `apps/web/app/api/ai/generate-map/route.ts:149` — inline `validateFetchUrl` has **stricter** IPv6 checks (fd/fe80/fc/::ffff:) than the shared `lib/ai/tools/url-fetcher.ts:34`. Naively replacing would weaken security.
- `apps/web/middleware.ts:55` — uses `request.ip` (deprecated Next 14, removed 15).
- `apps/web/app/providers.tsx:14` — global `refetchInterval: 5 min` burns Supabase quota.
- `apps/web/app/api/thumbnails/route.ts:29` — only enforces min buffer size, no max.
- `packages/map-modules/src/legend/proportional-legend.tsx:92` — `.sort()` on prop array mutates caller.
- `packages/map-modules/src/timeline/timeline.tsx:31` — `Date.now()` outside `useMemo` invalidates dep array every render.
- `packages/ui/src/layout/sidebar-layout.tsx:131` — `animate-slide-in-right` unconditionally; project rule requires `prefers-reduced-motion` respect.

## What We're Building

10 localised P0 fixes from the fresh codebase review. No new features. The goal is bugs-off the board so Batch B (map-core lifecycle — already subsumed into Task 3 below) and Batch C (dead-code sweep) can land against a clean baseline.

## Approach

Group by file/domain, not by severity. One commit per group so revert is granular. Tests updated in the same commit as the code change.

- **Group 1 (map-core lifecycle):** #2 + #3 collapse into one patch on `use-map-layer-resource.ts`. Fix the setup-effect cleanup to call `runResourceCleanup` when the effect re-runs, not just signal-cancel. This unblocks toggle-off AND deps-change in one move. Existing 19 tests must keep passing + add 2 new tests.
- **Group 2 (map-core deck.gl):** #1 — install the three deck.gl packages as dependencies of `apps/web` (where deck.gl is actually pulled by map-core's dynamic import at runtime). Smoke-test hexbin-3d family renders.
- **Group 3 (web platform):** #4 + #5 + #6 + #7 — one commit. React Query defaults, SSRF consolidation (additive, keeping inline's IPv6 protections), rate-limit IP extraction, thumbnail upload cap.
- **Group 4 (map-modules):** #8 + #9 — one commit. Both 2–5 min tweaks.
- **Group 5 (ui):** #10 — standalone, touches themes.css + sidebar-layout.

Run `pnpm typecheck && pnpm test` after each group. Run `pnpm dev` after Group 2 to confirm a deck.gl family renders.

## Tasks

### 1. Fix basemap lifecycle: teardown on disable + deps change
**Files:** `packages/map-core/src/use-map-layer-resource.ts`, `packages/map-core/src/__tests__/use-map-layer-resource.test.ts`
**What:** The setup-effect's cleanup function (line 191-193) currently only sets `signal.cancelled = true`. Change it to also call `runResourceCleanup(map, spec, stateRef.current)` when `stateRef.current.added` is true, so deps changes and `enabled: true→false` transitions actually remove the layers/source. Also change the setup guard on line 185: drop the `stateRef.current.added` check (cleanup will reset it), keep the `!enabled` gate but combine it with a teardown-if-already-added branch.
**Watch out:**
- Refcount. `runResourceCleanup` decrements. If both cleanup on re-run + unmount-effect cleanup fire, refcount could double-decrement. `state.acquired` guard in `runResourceCleanup` (line 142) already protects against this — verify.
- Don't regress the "keepSourceOnUnmount" path for 3D terrain (exists for shared-source intent).
- Shared-source refcount: if hook A and hook B both use the same sourceId and hook A re-runs its setup effect, we must NOT remove the source under hook B's feet. `release()` + `keepSourceOnUnmount` handle this; verify with an existing shared-source test.
- `silentOnFailure` and orphan-source paths must not regress.
**Verify:** `pnpm --filter @atlas/map-core test use-map-layer-resource` — all 19 existing tests pass, plus 2 new tests: (a) disabling after setup removes layers + source; (b) changing a dep after setup tears down and re-adds. `pnpm typecheck`.

### 2. Install deck.gl runtime dependencies
**Files:** `apps/web/package.json`, `apps/web/pnpm-lock.yaml`
**What:** Add `@deck.gl/mapbox`, `@deck.gl/aggregation-layers`, `@deck.gl/geo-layers`, and `@deck.gl/core` (peer of the others) to `apps/web`'s `dependencies`. Pin to latest stable 9.x (deck.gl 9 works with MapLibre GL 5.x). Run `pnpm install` at repo root to update the lockfile.
**Watch out:**
- Bundle size — the comment on `use-deck-overlay.ts:64` says "~200KB". These are only dynamic-imported so they stay in a lazy chunk. Confirm with `pnpm build` that the main chunk doesn't regress.
- Version compatibility with MapLibre 5.19 (`packages/map-core/package.json:24`). deck.gl 9 works; 8 may not.
- We deliberately add to `apps/web`, not `packages/map-core`, because map-core shouldn't force the dep on every consumer (consistent with how other optional deps are wired).
**Verify:** `pnpm install`; `pnpm typecheck`; `pnpm dev`, open a map with a `hexbin-3d` family (or quick smoke via a test fixture), confirm layers render and the browser console shows no "deck.gl overlay failed to load" warning.

### 3. Fix React Query global polling + rate-limit IP + SSRF consolidation + thumbnail cap
**Files:**
- `apps/web/app/providers.tsx`
- `apps/web/middleware.ts`
- `apps/web/app/api/ai/generate-map/route.ts`
- `apps/web/lib/ai/tools/url-fetcher.ts`
- `apps/web/app/api/thumbnails/route.ts`

**What:**

- **providers.tsx:14** — delete the `refetchInterval` default. Leave `staleTime` at 5 min. Per-query polling remains opt-in.
- **middleware.ts:53-56** — replace the IP fallback chain. Drop `request.ip`. Read `x-forwarded-for` (first hop) then `x-real-ip`. If both empty, bucket the request into a per-path `"anon"` key instead of a single global `"unknown"` bucket, OR reject with 400. Going with per-path `"anon:${pathname}"` — preserves rate limiting without leaking anon traffic to one shared bucket.
- **url-fetcher.ts:34-72** — extend `validateFetchUrl` with the IPv6 private/link-local checks currently only in generate-map/route.ts (fd/fe80/fc/::ffff: prefixes). This is additive; no existing callers regress.
- **generate-map/route.ts:149-200** — delete the inline `validateFetchUrl`. Import from `lib/ai/tools/url-fetcher`. Callsite at line 264 changes signature from `void` to `URL` — result is discarded, so no callsite change needed beyond the import.
- **thumbnails/route.ts:29** — add upper bound `if (buffer.length > 2 * 1024 * 1024) return 413 "Image too large"`. 2 MB cap is plenty for a JPEG thumbnail.

**Watch out:**
- Middleware `x-forwarded-for` parsing — existing code already does `.split(",")[0].trim()`. Keep that.
- SSRF: don't lose the "fd/fe80/fc/::ffff:" strings when moving. Make a single helper, not two copies.
- Thumbnail route already checks auth — keep that before the size check so unauthenticated requests don't reach buffer decoding.
- `refetchInterval` removal: check if any query in `apps/web` is relying on it implicitly. If some data is now stale until user action, that's the correct behavior — Supabase quota is the higher concern.

**Verify:**
- `pnpm typecheck` and `pnpm test` green.
- Spot-test the SSRF path: `curl -X POST http://localhost:3000/api/ai/generate-map -d '{"prompt":"x","dataUrl":"http://169.254.169.254/"}'` → expect 502 with "Private and link-local addresses are not allowed".
- Manually verify rate limiter bucketing: send > 20 requests in 60s to `/api/ai/generate-map` from same IP → 429.
- Manually verify thumbnail cap: POST a 5 MB base64 → 413.

### 4. Fix ProportionalLegend mutation + Timeline memo
**Files:**
- `packages/map-modules/src/legend/proportional-legend.tsx`
- `packages/map-modules/src/timeline/timeline.tsx`

**What:**
- **proportional-legend.tsx:91-92** — replace `items.sort((a, b) => b.radius - a.radius).map(...)` with `sorted.map(...)` (reuse the `const sorted` on line 31). Items and sorted have identical contents for labels.
- **timeline.tsx:31-32 + dep array on :58** — move `const now = Date.now(); const windowStart = now - windowMs;` INSIDE the `useMemo` callback. Drop `windowStart` and `now` from the dep array — leave `[entities, windowMs]`. This restores memoization; buckets now recompute only when `entities` or `windowMs` change (plus remount).

**Watch out:**
- The Timeline "now" value also drives the filter `if (t < windowStart || t > now) continue;` — that stays inside the memo, unchanged.
- Visual: memo changes mean the timeline no longer slides every render. That's correct — it also doesn't slide every render today because parent doesn't re-render that fast in practice. If anyone relied on per-render recompute for a ticking effect, they need a proper interval (but there's no evidence of this in the code).
- `ProportionalLegend` label order: `sorted` is already largest-first (matches the current `items.sort((a,b)=>b.radius-a.radius)` output). Swap is pure refactor, zero visual change.

**Verify:** `pnpm --filter @atlas/map-modules test` (none exist yet, but typecheck will catch regressions). `pnpm typecheck`. Manually open disasters page, confirm timeline renders and proportional legend labels still read top-to-bottom large-to-small.

### 5. Honor prefers-reduced-motion on sidebar slide-in
**Files:**
- `packages/ui/src/tokens/base.css` (or wherever `animate-slide-in-right` is defined — may be in tailwind-animate)
- `packages/ui/src/layout/sidebar-layout.tsx` (fallback gate if class stays)

**What:** Add a `@media (prefers-reduced-motion: reduce)` block that sets `animate-slide-in-right { animation: none; }`. The project rule (`.claude/rules/editorial-landing.md`) requires BOTH observer-skip AND `transition: none` / `animation: none` for any animation. Global CSS rule is the right fix — covers all usages.
**Watch out:**
- `animate-slide-in-right` may be a tailwind-animate class, not a project-owned keyframe. If so, add the override in `packages/ui/src/tokens/base.css` after the tailwind-animate import, with higher specificity.
- Don't just delete the class — some users will still want the animation.
**Verify:** Open sidebar slide-in with OS "Reduce motion" enabled → no animation. Disabled → animation plays. `pnpm typecheck`.

## Edge Cases

- **Task 1 refcount double-release:** `state.acquired` guard in `runResourceCleanup` is the safety. Covered by existing test "does not release refcount twice on unmount".
- **Task 1 concurrent setup + cleanup:** `signal.cancelled` is checked before `state.added = true`. Cleanup after cancel is a no-op (state.acquired may still be true — release runs, which is correct).
- **Task 2 deck.gl peer dep collision:** deck.gl 9 peers on `@math.gl/core`; pnpm should resolve without user action. If it fails, pin exact versions.
- **Task 3 SSRF DNS resolution:** neither old nor new version resolves hostnames → DNS rebinding still possible. Out of scope — flag separately if user wants it.
- **Task 3 X-Forwarded-For spoofing:** Vercel strips untrusted XFF and re-injects its own. Local dev has no such guarantee — acceptable for rate limiting.
- **Task 5 animation fallback:** if tailwind-animate already respects reduced-motion internally, my override is redundant but harmless.

## What We're NOT Doing

- **Not touching `useDeckOverlay` itself.** Task 2 just installs the deps; the hook already handles missing deck.gl with a warn.
- **Not adding tests for map-modules.** Handover item 20 bucket (Timeline, use-time-window, etc.) — tracked separately as P2, deferred to Batch D.
- **Not refactoring map-core's lifecycle beyond the bug fix.** No API shape change.
- **Not rewriting SSRF from scratch.** Additive consolidation only.
- **Not addressing DNS rebinding.** Separate concern, not in review.
- **Not fixing every `refetchInterval` site individually.** Global removal is simpler and correct — queries that truly need polling can opt in.

## Verify Everything Works

After all five tasks land, run in order:
1. `pnpm typecheck` — all packages clean.
2. `pnpm test` — 1244+ tests green (2 new in Task 1).
3. `pnpm build` — no bundle regression (deck.gl stays in lazy chunk).
4. `pnpm dev` — manual smoke:
   - Open a map with basemap hillshade ON → toggle OFF via manifest edit → hillshade gone (Task 1).
   - Open a map with deck.gl family (hexbin-3d) → renders without console error (Task 2).
   - Open /app with devtools Network tab → no automatic Supabase queries firing every 5 min (Task 3).
   - Open disasters page → timeline bars stable, proportional legend labels correct order (Task 4).
   - Enable OS "Reduce motion" → open editor → right panel appears without slide animation (Task 5).
5. `git log --oneline` — five commits, one per group.
