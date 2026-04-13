# `apps/web/scripts/`

Mix of one-off setup scripts, batch eval runners, and code generators. Most are *not* wired to `package.json` — invoke them manually via `tsx`/`node`.

## Wired to `package.json`

| Script | Command | Purpose |
|---|---|---|
| `eval-runner.ts` | `pnpm eval` (offline) / `pnpm eval:online` | Run the offline fixture-based or online generation eval. Writes `test-data/eval-report.json`. |
| `build-geometry.ts` | `pnpm build:geo` | Build/refresh the bundled GeoJSON geometry assets. |

## Manual: batch eval runners (require dev server at `localhost:3000`)

| Script | Purpose |
|---|---|
| `eval-10-prompts.ts` | Quick smoke-eval of 10 diverse prompts through clarify → generate-map. Run after meaningful prompt/model changes. |
| `eval-clarify-batch.ts` | Batch evaluation of ~84 prompts through `/api/ai/clarify`. Finds error *classes*, not individual fixes. No judge, no generate-map. |
| `eval-clarify-50.ts` | Earlier 50-prompt structured eval of the clarify pipeline (data discovery, source routing, geography detection). Superseded in practice by `eval-clarify-batch.ts` but kept for the smaller fixture set. |
| `eval-clarify-rerun.ts` | Re-runs only the failed prompts from `eval-clarify-batch.json` and merges results back. |
| `batch-clarify.ts` | Sends prompts to `/api/ai/clarify` and reports resolution success/failure. Tests the data pipeline (intent → PxWeb/Eurostat/Data Commons/World Bank/Overpass) without paying for Sonnet generation. |

All of the above require `localhost:3000` to be running (`pnpm dev`) and produce JSON reports in `test-data/`. Safe to re-run; each writes a fresh report.

## Manual: one-off setup

| Script | Purpose |
|---|---|
| `setup-data-cache.ts` | One-time: creates the `data_cache` Supabase table. Requires `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. |
| `create-data-cache-table.sql` | Raw SQL companion to `setup-data-cache.ts`. Run via the Supabase SQL editor if you'd rather not invoke the script. |

## Manual: code generators (re-run when source data changes)

| Script | Purpose |
|---|---|
| `generate-global-sources.ts` | Pulls geoBoundaries metadata for all countries. Writes `geometry-sources-generated.ts` + `lib/ai/tools/geometry-registry-generated.ts`. Re-run when geoBoundaries publishes new revisions. |
| `generate-choropleth-preview.mjs` | Generates a real Swedish-municipality choropleth preview SVG. Output: `components/generated/sweden-choropleth.ts`. |
| `generate-family-thumbnails.mjs` | Generates preview SVG data for the remaining 6 map-type families. Re-run when family list or thumbnail style changes. |

## Data files (not scripts — committed output)

| File | Source |
|---|---|
| `geometry-sources.ts` | Hand-curated geometry source list. Edit by hand. |
| `geometry-sources-generated.ts` | Output of `generate-global-sources.ts`. **Do not edit by hand** — re-run the generator. |
