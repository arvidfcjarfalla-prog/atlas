---
name: connect-datasource
description: Connect Atlas to new statistical data sources. Classifies source type (PxWeb/SDMX/REST), generates registry entries, and optionally dispatches batch additions via /subagent-tasks. Use when the user says "connect datasource", "add data source", "ny statistikkälla", or "lägg till källa".
triggers:
  - /connect-datasource
  - connect datasource
  - add data source
  - ny statistikkälla
  - lägg till källa
  - add statistics source
---

# Connect Data Source

Add new statistical APIs to Atlas's data pipeline. Follows the adapter-only pattern — no standalone sources.

## Prerequisites

Read `apps/web/lib/ai/tools/DATA_SOURCE_SPEC.md` before proceeding. It defines the three tracks (PxWeb, SDMX, REST) and exact field shapes.

## Pipeline

### 1. Classify the source

Determine the track based on API type:

| Signal | Track | What to generate |
|---|---|---|
| PxWeb API (`/api/v1/` or `/api/v2/` table navigation) | **A: PxWeb** | Registry entry only |
| SDMX REST API (`/dataflow` structure endpoint) | **B: SDMX** | SdmxAgencyConfig + registry entry |
| Other REST/JSON API | **C: REST** | Registry entry (adapter is separate engineering work) |
| Web portal only, no API | **REFUSE** | Do not add. Explain why. |

If unsure, check the source's documentation URL first. If still unclear, ask the user.

### 2. Generate artifacts

**Track A (PxWeb):**
- Add entry to `OFFICIAL_STATS_REGISTRY` in `apps/web/lib/ai/tools/global-stats-registry.ts`
- Set `apiType: "pxweb"`, `verificationStatus: "provisional"`
- Include `canaryQuery` with a known table ID and search term
- No adapter code needed — existing PxWeb v1/v2 adapter handles it

**Track B (SDMX):**
- Add `SdmxAgencyConfig` to `apps/web/lib/ai/tools/sdmx-client.ts`
- Add config to `SDMX_CONFIGS` record in same file
- Add registry entry in `global-stats-registry.ts` with `apiType: "sdmx"`
- Include `canaryQuery` with a known dataflow ID

**Track C (REST):**
- Add registry entry with `apiType: "rest"`, `verificationStatus: "provisional"`
- Include `canaryQuery`
- Note: adapter implementation is a separate task — the registry entry enables agency-hint UX immediately

### 3. Verify

After adding:
1. Run `pnpm typecheck` — must pass
2. If PxWeb or SDMX: manually test canary query against the API (curl or fetch)
3. Set `verificationStatus: "verified"` only after canary passes

### 4. Batch mode

When adding multiple sources of the same type, use `/subagent-tasks`:

```
Dispatch one subagent per source. Each subagent gets:
- This skill's instructions
- The DATA_SOURCE_SPEC.md reference
- The specific source to add (name, URL, API docs)
- Instruction to add registry entry + canaryQuery
- Instruction to run pnpm typecheck after
```

Group by track for efficiency:
- Batch all PxWeb sources together (most mechanical)
- Batch all SDMX sources together
- Handle REST sources individually (more judgment needed)

### 5. Geography check

After adding a source, check if its country has geometry in `apps/web/public/geo/`. If not, flag it:
> "Source added but no geometry available for {country}. Data will fetch but maps won't render until geometry is added."

## Key files

| File | Purpose |
|---|---|
| `apps/web/lib/ai/tools/DATA_SOURCE_SPEC.md` | Reference for field shapes and tracks |
| `apps/web/lib/ai/tools/global-stats-registry.ts` | Registry (OfficialStatsSource entries) |
| `apps/web/lib/ai/tools/sdmx-client.ts` | SDMX configs and adapter factory |
| `apps/web/lib/ai/tools/pxweb-client.ts` | PxWeb adapters and getStatsAdapter() |
| `apps/web/lib/ai/tools/geography-plugins.ts` | Per-country geometry plugins |

## Rules

- NEVER create standalone sources (like eurostat.ts/data-commons.ts pattern)
- ALWAYS include a canaryQuery — a source without one is unverifiable
- ALWAYS set new sources to `verificationStatus: "provisional"` initially
- NEVER mark a source as "verified" without testing the canary query
- Portal sources (`apiType: "portal"`) are informational only — do not attempt adapters
