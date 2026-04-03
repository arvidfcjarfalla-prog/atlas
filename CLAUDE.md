# Atlas

**Session start:** Read `.claude/learned-rules.md` before doing anything else.

AI-driven map platform. Natural language prompts → MapManifest → MapLibre rendering.

**UI tasks:** Read `apps/web/CLAUDE.md` before changing components, styles, or pages.

## Architecture

```
prompt → profileDataset(geojson) → AI generates MapManifest → validateManifest() → compileLayer() → MapLibre GL
```

**Core constraint:** AI generates `MapManifest` objects, never raw MapLibre code. The manifest compiler is the only path to MapLibre layer specs.

## Monorepo Structure

| Package | Purpose |
|---|---|
| `packages/data-models` | Types (`MapManifest`, `MapFamily`, `ColorScheme`), classification, color palettes |
| `packages/map-core` | Manifest compiler, arc interpolator, MapShell, hooks (`useManifestRenderer`, `useBasemapLayers`) |
| `packages/map-modules` | UI modules (Legend, Sidebar) |
| `packages/ui` | Shared UI primitives |
| `apps/web` | Next.js 14 app — AI pipeline, API routes, pages |

## Map Families

14 families: `point`, `cluster`, `choropleth`, `heatmap`, `proportional-symbol`, `flow`, `isochrone`, `extrusion`, `animated-route`, `timeline`, `hexbin`, `hexbin-3d`, `screen-grid`, `trip`

Each has a dedicated compiler in `packages/map-core/src/manifest-compiler.ts`.

## Key Files

- `packages/data-models/src/manifest.ts` — MapManifest, LayerManifest, all config types
- `packages/map-core/src/manifest-compiler.ts` — `compileLayer(layer, data) → CompiledLayer`
- `packages/map-core/src/arc-interpolator.ts` — Arc rendering (Bézier <500km, great circle ≥500km)
- `apps/web/lib/ai/validators/` — Two-pass validation: schema + cartographic
- `apps/web/lib/ai/profiler.ts` — Dataset profiling for geometry-aware scoring
- `apps/web/lib/ai/quality-scorer.ts` — Structural quality score (0–100)
- `apps/web/app/api/ai/generate-map/route.ts` — AI generation endpoint
- `apps/web/scripts/eval-runner.ts` — Offline/online eval runner
- `apps/web/public/geo/se/municipalities.geojson` — Swedish municipalities with SCB 4-digit codes
- `apps/web/lib/ai/tools/geometry-registry.ts` — Geometry registry (resolves country/admin geometries)
- `apps/web/lib/ai/tools/geography-plugins.ts` — 13 per-country geography plugins (SE, NO, IS, DK, FI, EE, SI, LV, CH, Eurostat NUTS, US FIPS, PxWeb generic, country admin fallback)
- `apps/web/lib/ai/tools/pxweb-resolution.ts` — PxWeb table resolution (skip Haiku selection when plugin provides known tables)
- `apps/web/lib/ai/tools/pxweb-client.ts` — PxWeb client (wildcard threshold: URL string length >1500 chars instead of fixed count)
- `apps/web/app/api/ai/clarify/route.ts` — Agency hint UX (short-circuit web search for unconnected sources, <5s response)
- `apps/web/lib/ai/tools/official-stats-resolver.ts` — Global stats registry with crime/justice topic tags
- `apps/web/lib/ai/tools/crosswalks/` — 15 static JSON crosswalk tables (ISO2↔ISO3, M49→ISO3, FIPS, JIS, KOSIS, IBGE, INEGI, BPS, INDEC, AGS→NUTS, CCAA→NUTS, TERYT→NUTS, dept→NUTS3, NUTS2016→2021, WB aggregate blocklist)
- `apps/web/lib/ai/tools/DATA_SOURCE_RESEARCH.md` — Comprehensive research on ~50 non-PxWeb data sources (API details, auth, rate limits, geographic codes, per-source implementation notes)
- `docs/source-integration-spec.md` — Source integration spec: current architecture audit, joinability matrices for ~50 sources, adapter contract, crosswalk inventory, prioritized implementation plan
- `docs/platform-plan.md` — End-to-end platform plan: 4 phases (begriplighet → egen data → live-data → lärande), consensus-reviewed, activation metric, competitive positioning
- `docs/architecture-blueprint-v3.md` — Architecture blueprint v3.2: immutable logs, resolution sessions/attempts, artifact versioning, table scores, migration plan (phases 0–7)
- `docs/archive/data-upload-research.md` — Data upload research: 6 archetypes, pipeline architecture, geocoding options, visualization logic
- `docs/archive/data-upload-ui-design.md` — Data upload UI spec: drag-and-drop, preview with match-rate, upload+prompt combo, responsive design
- `docs/archive/data-upload-debate-findings.md` — Data upload debate: 5-perspective consensus, MVP scope (CSV only, Sweden+countries, manual column selection, skip AI in v1)

## AI Tools (`apps/web/lib/ai/tools/`)

| Category | Tools |
|---|---|
| **Data search** | `data-search`, `data-commons`, `eurostat`, `pxweb-client`, `pxweb-resolution`, `worldbank-client`, `sdmx-client`, `web-dataset-search`, `web-research` |
| **Geography** | `geometry-registry`, `geometry-loader`, `geometry-join`, `geography-plugins`, `geography-detector`, `join-planner` |
| **Stats** | `official-stats-resolver`, `global-stats-registry`, `normalized-result`, `ai-metric-matcher` |
| **Routing** | `intent-classifier`, `source-adapter`, `dataset-registry`, `resolution-memory` |
| **Utilities** | `url-fetcher`, `overpass`, `ai-suggestion-generator` |
| **Crosswalks** | `crosswalks/*.json` — 15 static lookup tables mapping national stats codes ↔ ISO/NUTS/FIPS for join operations |

## Evaluation System

Two eval modes, both use `quality-scorer.ts` (0–100) as the metric:

- **Offline** (`pnpm eval`): Validate + compile + score pre-built fixtures in `test-data/eval-fixtures.json`. Deterministic, no API key. Use for scorer/validator testing only — never for `/auto-research` (offline eval does not call the AI or read `example-bank.ts`).
- **Online** (`pnpm eval:online`): Generate manifests from prompts in `test-data/eval-prompts.json` via the live API. Costs tokens. Use for regression testing after model/prompt changes.

Reports written to `test-data/eval-report.json`. Quality scorer dimensions: schema (20), family (20), color (20), classification (15), normalization (10), legend (5), runtime (10).

## Commands

```bash
pnpm dev          # Start dev server (all packages)
pnpm build        # Build all packages
pnpm test         # Run all tests (Vitest via Turbo)
pnpm typecheck    # Type-check all packages
pnpm lint         # Lint all packages

# E2E tests (from apps/web — requires dev server or auto-starts one)
pnpm e2e          # Playwright smoke tests (Chromium)
pnpm e2e:ui       # Playwright with interactive UI

# Eval runner (from apps/web)
pnpm eval         # Offline mode — fixture-based, no API key
pnpm eval:online  # Online mode — requires ANTHROPIC_API_KEY + dev server

# Auto-research (Karpathy loop)
/auto-research    # Mutate example-bank.ts → eval → keep if better, revert if worse

# Task execution
/subagent-tasks   # Dispatch one subagent per task with two-stage review
/debug            # Structured 4-phase debugging (root cause first)
```

## Verification

After any code change, always run:
```bash
pnpm typecheck && pnpm test
```

### Focused Test Workflow

Use the smallest relevant test set while iterating, then run the full suite before closing a phase.

```bash
# Map persistence contracts (save/reopen/publish/duplicate/by-slug)
cd /Users/arvidhjartberg/atlas/apps/web && npx vitest run lib/ai/__tests__/map-persistence.test.ts

# Data cache semantics (L1/L2 TTL, refresh behavior)
cd /Users/arvidhjartberg/atlas/apps/web && npx vitest run lib/ai/__tests__/data-cache.test.ts

# Deterministic path + artifact fallback (generate-map cold start)
cd /Users/arvidhjartberg/atlas/apps/web && npx vitest run lib/ai/__tests__/generate-map-deterministic-fallback.test.ts lib/ai/__tests__/fas3-determinism.test.ts

# Full verification gate before marking work complete
cd /Users/arvidhjartberg/atlas && pnpm typecheck && pnpm test
```

Rule of thumb:
- If you change `apps/web/app/api/maps*`, run `map-persistence.test.ts`.
- If you change `apps/web/lib/ai/tools/data-search.ts`, run `data-cache.test.ts`.
- If you change `apps/web/app/api/ai/generate-map*` or `dataset-storage.ts`, run the deterministic path tests.
- If tests fail, inspect only the failing test and the closest route/tool file first.

## Testing

- Unit tests: Vitest (v4.1+), 43 test files across 3 packages
- E2E tests: Playwright (Chromium), 12 tests covering 11 map families
- Unit test files live next to source: `src/__tests__/` or `lib/ai/__tests__/`
- E2E test files: `apps/web/e2e/`
- Path alias `@/` in `apps/web` resolves to project root (not `src/`)

## Import Caveat

`@atlas/map-core` barrel export imports MapLibre CSS. Scripts running in Node (like eval-runner) must import directly from source files to avoid CSS parse errors:
```typescript
// In Node scripts — import from source, not barrel
import { compileLayer } from "../../../packages/map-core/src/manifest-compiler.js";
```

## How Arvid Works

- Speaks Swedish. Respond in Swedish. Code and docs in English.
- **Vibe coder.** Explain everything non-technically. No jargon, no implementation details unless asked. Describe what was done in terms of behavior ("maps now remember their data when reopened"), not code ("added artifact_id column with FK constraint"). Same for plans and proposals.
- Sends detailed task briefs for big work — treat as complete specs, execute directly.
- Short messages ("fixa", "kolla", "review") mean exactly that — act immediately.
- Runs parallel work streams deliberately. Don't ask if this is intentional.
- Reviews output actively. When he says "review", do a real code review.
- Cares about system readiness and discoverability, not just functionality.

## Behavioral Rules

- **Agents that loop:** If a delegated agent hasn't produced files within ~2 minutes, kill it and do the work yourself. Research agents are good at searching, bad at writing files.
- **Verify data:** Never trust AI-generated lookup tables blindly. Spot-check against external sources. (Indonesia BPS 34/35 swap was caught in review.)
- **Discoverability:** After creating new directories or files, add them to CLAUDE.md Key Files. Add cross-references between related docs. Add README.md in new directories.
- **Docs staleness:** When reading a doc in `docs/`, check for a `last-reviewed` date. If >60 days old or absent, flag as potentially stale before using it for decisions.
- **Session continuity:** Write non-obvious decisions to `learned-rules.md` during the session, not just corrections. This is the only reliable cross-session memory.
- **Don't over-explain:** Don't summarize what was accomplished — he can read the diff. Don't propose plans without being asked. Don't ask permission for routine operations.

## Development Rules

- Keep the compiler dumb — no intent interpretation, no auto-fixes, no cartographic logic.
- Never move cartographic intelligence into the rendering layer.
- Read relevant files before changing code. Identify the smallest change with highest ROI.
- Preserve backward compatibility unless explicitly asked to break it.
- Solve problems we have, not problems we might have.
- **Geography plugins:** admin1 geometry has `iso_3166_2` (reliable join key, use `direct_code`). Admin2/municipality files lack numeric codes — use `alias_crosswalk` via labels. Always include a label cleanup normalizer for bilingual/parenthetical suffixes.
- **Data source workflow:** Use `/connect-datasource` for new sources, `/connect-geography` for join plugins. Dispatch geography plugins one-per-country as parallel agents (genuinely independent work).
- **Eval modes:** Offline (`pnpm eval`) scores fixtures — never reads example-bank.ts. Online (`pnpm eval:online`) calls the AI pipeline. Only online mode tests prompt/example changes.

## Tech Stack

- pnpm 9.15 + Turborepo
- TypeScript 5.8, strict mode, ES2022
- Next.js 14 (App Router)
- MapLibre GL JS 5.19
- React 18.3
- Tailwind CSS 3.4
- AI: Anthropic Claude Sonnet 4.5 (primary), Opus 4.5 (fallback on low quality score < 60), Haiku 4.5 (utility)

---

## Workflow Engine

### File Locations

- All new skills: `.claude/skills/` (not `.agents/skills/`)
- Learned rules: `.claude/learned-rules.md`
- Reviewer and documenter sub-agents: `.claude/commands/`
- Follow format convention from `.agents/skills/` — YAML frontmatter (`name`, `description`, etc.) + markdown body
- Before creating the first skill: read an existing skill in `.agents/skills/` (e.g. `supabase-postgres-best-practices/SKILL.md`) to match structure
- Before creating commands: read Claude Code docs on commands and sub-agents (`/commands`) to use the correct format

### Pipeline

Every task follows this pipeline (unless explicitly skipped):

```
Prompt → Clarify → Contract → Plan → Build → Test → Reflect → Self-anneal → Review → Document → Done
```

- **Prompt**: User gives a task
- **Clarify**: If unclear, ask up to 5 clarifying questions BEFORE building. Without this, wrong assumptions get baked in silently.
- **Contract**: Show a contract with four parts:
  - GOAL — quantifiable success metric
  - CONSTRAINTS — hard boundaries
  - FORMAT — exact output form
  - FAILURE — explicit conditions for failure. Exists to prevent shortcuts that would otherwise be rationalized as acceptable.
- **Plan**: Break down into steps. Show plan. Wait for approval.
- **Build**: Implement step by step.
- **Test**: Run `pnpm typecheck && pnpm test`. Deterministic verification — never "looks good".
- **Reflect**: Does the output meet definition-of-done from the contract?
- **Self-anneal**: On failure → diagnose → fix → re-test → loop (max 5). On success → update approach. Log all self-modifications to learned-rules.md.
- **Review**: Spawn reviewer sub-agent (fresh context, sees only changed files). Critical issues → fix → re-review. Warnings → show user, continue. Max 3 review loops.
- **Document**: Run documenter sub-agent. Ensure CLAUDE.md, STATUS.md, and inline comments match reality.
- **Done**: Deliver.

### DOE — Deterministic Over Everything

Separate judgment (what to do) from execution (deterministic verification). Use intelligence for routing and decisions. Use code and tests for verification. If something can be verified with a script — do it. Never trust "it looks right".

### Self-modifying learned rules

At session start: ALWAYS read `.claude/learned-rules.md`.

Rules are added when:
- User corrects an output
- User rejects an output
- A bug stems from a wrong assumption
- Self-annealing reveals a pattern

Format: `[CATEGORY] NEVER/ALWAYS X because Y`

### Learned-rules → CLAUDE.md compilation

When `learned-rules.md` reaches **10+ rules**, trigger a compilation cycle:

1. Read all rules in `learned-rules.md`
2. Group by category — identify patterns (3+ rules in the same category = a pattern)
3. Distill each pattern into a single high-density bullet for CLAUDE.md (e.g., 3 PXWEB rules → one "PxWeb" bullet under Key Files or Development Rules)
4. Add the distilled bullets to the appropriate CLAUDE.md section
5. Keep the original rules in `learned-rules.md` (they have the detailed rationale)
6. Mark compiled rules with `[COMPILED]` suffix so they aren't re-compiled

This prevents rule loss during context compression — CLAUDE.md is always loaded, learned-rules.md may be truncated.

### 10x Rule

Only optimize if the improvement is at least 10x in a key metric (time, cost, accuracy). Marginal improvements (33%, 50%) introduce error risk rarely justified by the gain.

### Autonomy

Run the full pipeline autonomously. Come to the user ONLY when genuinely blocked or a contract needs approval. "Genuinely blocked" = at least 3 approaches tried and none work.

### Broadening Rule

If a sub-goal isn't met (e.g., test still fails), broaden the approach automatically before escalating. Try a fundamentally different solution, not the same approach with minor tweaks.

### Safety Guardrails

- Confirm before API calls costing more than $1
- NEVER modify credentials or API keys unless explicitly asked
- NEVER remove secrets from .env files or hardcode them
- Log all self-modifications as a changelog in affected files

### Human-in-loop Heuristic

- High impact + high quality sensitivity → ask (e.g., public API contracts, pricing logic, user-facing copy)
- High volume + low sensitivity → run autonomously (e.g., refactoring, test-fixes, internal tooling)
- If uncertain → ask

### Context Compression — Write Before Compression

Before context compression occurs, write important findings, decisions, and error-resolutions to files (learned-rules.md, scratch files). Context compression loses exact error messages, intermediate steps, and nuanced reasoning.

### Hierarchy — Most Specific Wins

```
Level 1: Global CLAUDE.md (user-wide rules)
Level 2: Project CLAUDE.md (repo-specific rules)
Level 3: Matched Skills (task-specific SOPs, loaded on demand)
Level 4: Inline Prompt (current specific instruction)
```

On conflict: most specific wins. Inline > Skill > Project CLAUDE.md > Global CLAUDE.md.

### Multi-model Awareness

For complex builds with clearly separable parts, suggest splitting work between sub-agents with isolated context. Consolidate results afterwards. Suggest — never force.
