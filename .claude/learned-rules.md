# Learned rules

Rules accumulated from corrections, rejected outputs, and discovered patterns.
Format: [CATEGORY] P{0-3} NEVER/ALWAYS X because Y
Severity: P0 = data loss/security, P1 = breaks build/pipeline, P2 = quality/correctness, P3 = style/convention

[SETUP] P3 ALWAYS specify exact file locations (which directory, which format) when adding workflow infrastructure because ambiguity between .agents/skills/ and .claude/skills/ caused a correction in the first setup session (2026-03-28).

[COMMANDS] P1 NEVER rely on a single git diff strategy (e.g. `main...HEAD`) because it fails silently when on main, with uncommitted changes, or without a local main branch. Always implement a fallback chain: branch diff → staged → unstaged → untracked (2026-03-28).

[SKILLS] P2 ALWAYS use relative thresholds (percentages) instead of absolute numbers when the input count is variable because the consensus skill had "7+ of 10" thresholds but only spawned 3-5 agents, making the thresholds impossible to reach (2026-03-28).

[SECURITY] P0 ALWAYS check .gitignore for temp/cache directories that may contain credentials before committing because supabase/.temp/ contained project-ref and pooler connection strings and was not gitignored (2026-03-28).

[PIPELINE] P1 ALWAYS run the reviewer sub-agent (/review) after self-anneal and before contract verification. It was skipped in the map-judge build, which broke the pipeline's quality gate (2026-03-28).

[PXWEB] P1 NEVER use fixed count thresholds for wildcard table selection because SCB API returns 404 on requests with very long URLs (>1500 chars). Use URL string length instead of result count as threshold (2026-03-28).

[GEOGRAPHY] P2 ALWAYS add SCB 4-digit municipality codes (scb_code property) to geometry features when available because they are the authoritative join key for Swedish statistical data. Match exactly against TAB638 or source registry (2026-03-28).

[AGENCY-HINT] P3 ALWAYS short-circuit web search in clarify route when an unconnected source (like BRÅ for crime) covers the requested topic because Haiku selection is slow (30-40s). Return agency portal link + hint in <5s instead. Requires topic tag alignment in official-stats-resolver (2026-03-28).

[EVAL] → COMPILED to .claude/rules/eval-modes.md (2026-03-29)
[GEOGRAPHY] → COMPILED to .claude/rules/pxweb-geography.md (2026-03-29)
[DATASOURCE] → COMPILED to .claude/rules/pxweb-geography.md (2026-03-29)
[PARALLEL-AGENTS] → COMPILED to .claude/rules/pxweb-geography.md (2026-03-29)
[PXWEB-GEO] → COMPILED to .claude/rules/pxweb-geography.md (2026-03-29)

[CLARIFY] P2 NEVER interpret user opinions or observations as action requests. When the user states a preference ("jag gillar inte X"), ASK what they want done about it instead of immediately modifying code or artifacts. The pipeline says clarify first — this applies to conversational context too, not just build tasks (2026-03-29).

[GEOGRAPHY-PLUGIN] P1 NEVER set level: "municipality" as the default in knownDimensions() for a dimension name that can represent multiple admin levels (e.g. Finnish "Alue", "Area", "Område" appear in both regional and municipal PxWeb tables). Wrong default level causes the join planner to look up the wrong geometry entry — MK codes matched against a municipality file yield zero hits and "tabular_only". Instead: (1) map dimension names that are region-specific (e.g. "Alue", "Area") to "admin1", (2) add explicit entries for municipality-specific names (e.g. "Kunta"), (3) keep confidence ≤0.5 so matchCodes() can override the level from actual code patterns (MK vs KU prefix) (2026-03-29).

[AGENTS] P2 NEVER delegate file-creation tasks to research-type agents. They loop endlessly planning what to write without actually writing. Use them for web search and analysis only, then write files yourself from their findings. Three crosswalk agents looped in this pattern in one session (2026-04-03).

[CROSSWALKS] P0 ALWAYS verify AI-generated lookup tables against an external source before shipping. Indonesia BPS province codes 34 (Yogyakarta) and 35 (East Java) were swapped — caught only because a review agent spot-checked against Wikipedia. Silent misjoin bugs are the worst kind (2026-04-03).

[DOCS] P2 ALWAYS check docs against actual code when reading them. Blueprint v3.2 described migrations 013/014 as resolution_outcomes/generation_records but the actual files are data_cache_pinned_and_meta/durable_dataset_storage. Following the blueprint blindly would have produced wrong migration numbers (2026-04-03).

[DISCOVERABILITY] P2 ALWAYS link new files/directories from CLAUDE.md Key Files section. crosswalks/ with 15 JSON files was invisible until explicitly added. If CLAUDE.md doesn't mention it, future sessions won't find it (2026-04-03).

[CACHE] P1 NEVER enable clarify cache (`ATLAS_ENABLE_CLARIFY_CACHE`) until the learning phase is activated. The cache masks code improvements — same prompt returns stale results instead of running the improved pipeline. This burned debugging time twice (2026-04-04). Gate: `ATLAS_ENABLE_CLARIFY_CACHE=true` in `.env.local`.

[SUPABASE] P0 ALWAYS have timeouts on Supabase calls. The Supabase JS client has no default request timeout — if PostgREST hangs (connection pool saturated, egress throttled), every route that touches Supabase hangs forever with zero bytes returned. Fixed via `AbortSignal.timeout(8_000)` on the global fetch in `lib/supabase/service.ts` + `withTimeout()` wrapper for critical-path queries (2026-04-04).

[THUMBNAILS] P2 ALWAYS use real GeoJSON data projected at build time for map-type previews, NEVER hand-draw abstract polygons. Hand-drawn shapes (13 European country blobs) read as student illustration, not cartographic tool. Fix: generator scripts in `apps/web/scripts/generate-*-thumbnails.mjs` read `public/geo/*.geojson`, project with `cos(meanLat)` correction, output static TypeScript. Bundle cost ~385 KB (gzipped ~100 KB) is acceptable for the credibility gain (2026-04-05).

[EDITORIAL-COLOR] P3 NEVER use a green (sage) palette for choropleth thumbnails even though sage is a brand token. Default data visualizations are overwhelmingly blue/green — gold on dark reads as rare and premium instead of "another eco-dashboard". Reserve sage/brand accents for UI chrome; let gold own the data layer. Debate consensus between bencium-innovative-ux-designer and frontend-design skills (2026-04-05).

[EXAMPLE-THUMBNAILS] P3 NEVER render family-level map SVGs inside per-template example cards. Templates vary in geographic scope (Europe, world, Sweden) but share a family — showing the same Sweden SVG for an "Europe population" template reads as slarv/placeholder. Fix: text-forward ExampleThumb with family color tint + Georgia italic title + small family label, no map illustration. The big PreviewContainer above still carries the family visual (2026-04-05).

[EDITORIAL-LAYOUT] P3 NEVER add decorative vertical spines or "atlas binding" metaphors if execution ends up literal. The sage vertical line + notched chapter markers tested as "plåttrigt" (cheap-looking) — an idea that reads well in debate notes but lands as over-designed geometry in actual rendering. When an editorial detail feels fussy, kill it and let typography carry the weight (2026-04-05).

[REDUCED-MOTION] P1 NEVER rely only on skipping the IntersectionObserver to honor `prefers-reduced-motion`. Must ALSO set `transition: none` on the animated properties, otherwise the state change from `visible=false → true` still triggers CSS transitions. Correct pattern: return both `visible` and `animate` from the reveal hook; set `animate=false` when reduced motion is detected; apply `transition: animate ? "opacity..." : "none"` at the use site (2026-04-05).

[API-VERIFY] P2 ALWAYS verify third-party API constants against the actual bundle source via grep, never against blog posts or memory. Pattern: when you hit "API behaves unexpectedly" with a library you haven't used before, download the bundle via curl and grep it immediately — do not guess twice (2026-04-05).

[FRAMER-MOTION] P3 framer-motion `^12.38.0` is now installed in `apps/web` — added 2026-04-05 after research confirmed rocket.new uses framer-motion's `useScroll` hook plus Rive for their animations. Atlas uses framer-motion only (no Rive). The earlier "zero new deps" constraint is formally broken for this package. Use `useInView`, `useScroll`, `useTransform`, `motion.*` components freely in new marketing sections (2026-04-05).

[HOOKS-BLOCKING] P0 NEVER use ok:false in UserPromptSubmit hooks for routing. ok:false blocks the prompt BEFORE it reaches the assistant — creating a Catch-22 where the user is told to "use /build pipeline" but can't because the hook blocks every attempt. CLARIFY mode with ok:false is even worse: it locks the user out completely since even "stop using clarify" gets classified as needing clarification. Routing must always be ok:true with instructions in the reason field (2026-04-08).
