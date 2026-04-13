# Review Summary

`apps/web` is in solid shape. The AI pipeline, Supabase auth, and test coverage for `lib/ai/tools/` are the strongest parts. Real risk is concentrated in one security gap (cron auth fallback) and a family of `setTimeout`/`useTimeout` cleanup bugs that add up to stray unmount warnings and (in `useToast`) leaking timers.

## Action List (by priority)

1. Require `CRON_SECRET` in cleanup route — `apps/web/app/api/cron/cleanup/route.ts:8` — effort: **5 min**
2. Add cleanup to `useToast` — `apps/web/lib/hooks/use-toast.ts:20` — effort: **5 min**
3. Remove `vaul` from `apps/web/package.json` — effort: **5 min**
4. Clear `ShareModal` copy-toast timeouts on unmount — `apps/web/components/ShareModal.tsx:60,67` — effort: **10 min**
5. Clear `ExportMenu` export-flag timeouts on unmount — `apps/web/components/ExportMenu.tsx:43-54` — effort: **10 min**
6. Remove `map as any` cast in `ChartOverlayWrapper` — `apps/web/app/app/(editor)/map/[id]/page.tsx:165` — effort: **30 min**
7. Extract shared `saveDraft()` helper to replace three copies — `apps/web/app/app/(editor)/map/[id]/page.tsx:291,357,396` — effort: **30 min**
8. Log or surface `/api/maps/{id}/versions` failures instead of swallowing — `apps/web/app/app/(editor)/map/[id]/page.tsx:336` — effort: **10 min**
9. Add tests for `url-fetcher` and `kolada-client` — effort: **2h+**
10. Standardize `components/` filenames to one case — effort: **2h+**

## Per Package

| Package  | Breaks | Cleanup | Nice to have |
|----------|--------|---------|--------------|
| apps/web | 5      | 4       | 6            |

## Notes on methodology

- 4 parallel Explore sub-agents audited `app/`, `components/`, `lib/`, and `hooks+scripts+deps`.
- All findings were re-verified against the source before inclusion. Rejected false positives:
  - `/api/citybikes` flagged as unused — actually registered in `lib/ai/data-catalog.ts:277`.
  - `ChatPanel` props `onFileUpload` / `loading` flagged as unused — `onFileUpload` is used in `app/app/(editor)/map/new/page.tsx:804`; `loading` carries an intentional `@deprecated` JSDoc for backwards compat.
  - `/smoke-test` e2e flagged as broken — the page lives at `app/(maps)/smoke-test/page.tsx` (route group), so the test target resolves.
