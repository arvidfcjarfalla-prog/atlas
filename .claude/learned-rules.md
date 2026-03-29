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
