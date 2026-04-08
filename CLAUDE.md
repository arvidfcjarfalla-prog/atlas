# Atlas

**Session start:** Read `.claude/learned-rules.md` before doing anything else.

AI-driven map platform. Natural language prompts → MapManifest → MapLibre rendering.

**UI tasks:** Read `apps/web/CLAUDE.md` before changing components, styles, or pages.
**Process:** See `.claude/WORKFLOW-GUIDE.md` for full pipeline (contract, plan, build, test, reflect, review, document).
**Key files:** See `.claude/docs/key-files-reference.md` for file catalog.
**AI tools:** See `.claude/docs/ai-tools-reference.md` for tool inventory.

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

## Commands

```bash
pnpm dev          # Start dev server
pnpm build        # Build all packages
pnpm test         # Run all tests (Vitest)
pnpm typecheck    # Type-check all packages
pnpm lint         # Lint all packages
pnpm e2e          # Playwright smoke tests
pnpm eval         # Offline eval (fixtures, no API key)
pnpm eval:online  # Online eval (requires ANTHROPIC_API_KEY)
```

## Verification

After any code change: `pnpm typecheck && pnpm test`

## Tech Stack

pnpm 9.15 + Turborepo · TypeScript 5.8 strict · Next.js 14 App Router · MapLibre GL JS 5.19 · React 18.3 · Tailwind CSS 3.4 · AI: Sonnet 4.5 (primary), Opus 4.5 (fallback <60), Haiku 4.5 (utility)

## How Arvid Works

- Speaks Swedish. Respond in Swedish. Code and docs in English.
- **Vibe coder.** Explain non-technically. Describe behavior, not implementation.
- Sends detailed briefs for big work — execute directly.
- Short messages ("fixa", "kolla") mean act immediately.
- Runs parallel work streams deliberately.
- Don't over-explain — he reads diffs, not summaries.

## Behavioral Rules

- **Agents that loop:** Kill after ~2 min if no file output. Research agents search well, write poorly.
- **Verify data:** Never trust AI-generated lookup tables. Spot-check externally.
- **Discoverability:** New files/directories must be linked from CLAUDE.md or relevant docs.
- **Session continuity:** Write non-obvious decisions to `learned-rules.md` during session.
- **Analysis claims:** Never assert "duplicated/unnecessary/dead/equivalent" without reading the referenced files in this turn and citing file:line:content. A Stop hook verifies claims against actual files with fresh-context adversarial analysis — unverified claims are blocked.

## Development Rules

- Compiler stays dumb — no intent interpretation, no auto-fixes, no cartographic logic.
- Preserve backward compatibility unless explicitly asked to break it.
- Solve problems we have, not problems we might have.
- Read relevant files before changing code. Smallest change, highest ROI.
