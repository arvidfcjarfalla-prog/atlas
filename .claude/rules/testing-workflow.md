---
description: Test conventions, focused test patterns, and verification gates
globs:
  - "**/__tests__/*"
  - "vitest.config.*"
  - "apps/web/e2e/**"
  - "**/playwright.config.*"
---

# Testing Workflow

- Unit tests: Vitest (v4.1+), 43 test files across 3 packages. Files live next to source in `__tests__/`.
- E2E tests: Playwright (Chromium), 12 tests in `apps/web/e2e/`.
- Path alias `@/` in `apps/web` resolves to project root (not `src/`).

## Verification Gate

After ANY code change: `pnpm typecheck && pnpm test`

## Focused Tests (while iterating)

Use the smallest relevant test, then full suite before closing a phase.

```bash
# Map persistence (save/reopen/publish/duplicate/by-slug)
cd apps/web && npx vitest run lib/ai/__tests__/map-persistence.test.ts

# Data cache (L1/L2 TTL, refresh)
cd apps/web && npx vitest run lib/ai/__tests__/data-cache.test.ts

# Deterministic path + artifact fallback
cd apps/web && npx vitest run lib/ai/__tests__/generate-map-deterministic-fallback.test.ts lib/ai/__tests__/fas3-determinism.test.ts
```

## Rule of Thumb

- Change `apps/web/app/api/maps*` → run map-persistence.test.ts
- Change `apps/web/lib/ai/tools/data-search.ts` → run data-cache.test.ts
- Change `apps/web/app/api/ai/generate-map*` or `dataset-storage.ts` → run deterministic path tests
- If tests fail, inspect only the failing test and the closest route/tool file first
