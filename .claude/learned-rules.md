# Learned rules

Rules accumulated from corrections, rejected outputs, and discovered patterns.
Format: [CATEGORY] NEVER/ALWAYS X because Y

[SETUP] ALWAYS specify exact file locations (which directory, which format) when adding workflow infrastructure because ambiguity between .agents/skills/ and .claude/skills/ caused a correction in the first setup session (2026-03-28).

[COMMANDS] NEVER rely on a single git diff strategy (e.g. `main...HEAD`) because it fails silently when on main, with uncommitted changes, or without a local main branch. Always implement a fallback chain: branch diff → staged → unstaged → untracked (2026-03-28).

[SKILLS] ALWAYS use relative thresholds (percentages) instead of absolute numbers when the input count is variable because the consensus skill had "7+ of 10" thresholds but only spawned 3-5 agents, making the thresholds impossible to reach (2026-03-28).

[SECURITY] ALWAYS check .gitignore for temp/cache directories that may contain credentials before committing because supabase/.temp/ contained project-ref and pooler connection strings and was not gitignored (2026-03-28).

[PIPELINE] ALWAYS run the reviewer sub-agent (/review) after self-anneal and before contract verification. It was skipped in the map-judge build, which broke the pipeline's quality gate (2026-03-28).

[PXWEB] NEVER use fixed count thresholds for wildcard table selection because SCB API returns 404 on requests with very long URLs (>1500 chars). Use URL string length instead of result count as threshold (2026-03-28).

[GEOGRAPHY] ALWAYS add SCB 4-digit municipality codes (scb_code property) to geometry features when available because they are the authoritative join key for Swedish statistical data. Match exactly against TAB638 or source registry (2026-03-28).

[AGENCY-HINT] ALWAYS short-circuit web search in clarify route when an unconnected source (like BRÅ for crime) covers the requested topic because Haiku selection is slow (30-40s). Return agency portal link + hint in <5s instead. Requires topic tag alignment in official-stats-resolver (2026-03-28).

[EVAL] NEVER use offline eval (`pnpm eval`) to test example-bank changes because offline eval scores pre-built fixture manifests directly — it never calls the AI and never reads example-bank.ts. Only online eval (`pnpm eval:online`) passes prompts through the AI pipeline where examples influence output (2026-03-29). [COMPILED]

[GEOGRAPHY] ALWAYS check admin1 geometry for `iso_3166_2` property first — it exists in almost all countries and is the most reliable join key. Use `direct_code` strategy with ISO prefix. Municipality/admin2 files almost never have numeric codes — default to `alias_crosswalk` via dimension labels (2026-03-29). [COMPILED]

[GEOGRAPHY] ALWAYS include a label cleanup normalizer in geography plugins because PxWeb dimensions often have bilingual suffixes ("Nordland - Nordlánnda"), date ranges ("Viken (2020-2023)"), or regional qualifiers ("/Capodistria") that prevent direct name matching (2026-03-29). [COMPILED]

[DATASOURCE] ALWAYS use `/connect-datasource` skill when adding new statistical sources and `/connect-geography` skill when building join plugins. These encode patterns from 10+ countries and prevent agents from re-discovering the same API quirks (2026-03-29). [COMPILED]

[PARALLEL-AGENTS] ALWAYS dispatch geography plugins one-per-country as background agents because they are genuinely independent (different geometry files, different APIs, different code patterns). Three plugins built in parallel took ~4 min vs ~12 min sequential (2026-03-29). [COMPILED]

[PXWEB-GEO] ALWAYS add new country's geography dimension names to GEO_PATTERNS in pxweb-client.ts when connecting a new PxWeb country. Without this, classifyDimension() marks the geo dimension as "regular" and selectDimensions() collapses it to a total — producing uniform choropleths with no variation. Each country uses its own language for "county"/"municipality" (Estonian: Maakond, Icelandic: Landshluti, Finnish: Maakunta, etc.) (2026-03-29).

[CLARIFY] NEVER interpret user opinions or observations as action requests. When the user states a preference ("jag gillar inte X"), ASK what they want done about it instead of immediately modifying code or artifacts. The pipeline says clarify first — this applies to conversational context too, not just build tasks (2026-03-29).

[GEOGRAPHY-PLUGIN] NEVER set level: "municipality" as the default in knownDimensions() for a dimension name that can represent multiple admin levels (e.g. Finnish "Alue", "Area", "Område" appear in both regional and municipal PxWeb tables). Wrong default level causes the join planner to look up the wrong geometry entry — MK codes matched against a municipality file yield zero hits and "tabular_only". Instead: (1) map dimension names that are region-specific (e.g. "Alue", "Area") to "admin1", (2) add explicit entries for municipality-specific names (e.g. "Kunta"), (3) keep confidence ≤0.5 so matchCodes() can override the level from actual code patterns (MK vs KU prefix) (2026-03-29).
