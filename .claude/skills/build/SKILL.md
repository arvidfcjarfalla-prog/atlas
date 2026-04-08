---
name: build
description: Full pipeline with contract, verification loop, reviewer, and documenter. Use when the user says /build, "bygg", "implementera", "skapa", or any task requiring planning.
triggers:
  - /build
  - bygg
  - implementera
  - skapa
---

# Build

Full-pipeline skill for non-trivial tasks. Follows the pipeline from `.claude/WORKFLOW-GUIDE.md`.

## Pipeline

1. **Clarify** — Surface assumptions before building.
   - First: check `tmp/experience/` for an existing experience doc matching this domain (e.g. `tmp/experience/auth.md`, `tmp/experience/maps.md`). If one exists, read it — skip questions already answered there.
   - **Staleness check:** Before trusting an experience doc, check its first line for `<!-- last-verified: YYYY-MM-DD -->`. If missing or >14 days old, warn: "Experience doc may be stale — cross-checking key claims." If the doc references file paths, check if those files were modified more recently than the experience doc.
   - Ask up to 5 questions (minus those already answered by experience docs), prioritized by impact. For each question:
     - State the assumption you'd make if not asked
     - Ask the question
     - Explain why a different answer would change the implementation
   - If the user skips a question, use the stated default assumption and note it.
   - If the codebase already answers a question (patterns, conventions, existing code), skip it.
   - After the user answers: save the Q&A to `tmp/experience/{domain}.md` with a staleness header:
     ```
     <!-- last-verified: {today's date} -->
     <!-- depends-on: {file paths referenced in the doc} -->
     ```
     This creates a flywheel — each task adds context, so future tasks need fewer questions.

2. **Contract** — Present:
   - GOAL — quantifiable success metric (include a number: "handles 50K req/sec", not "handles high traffic")
   - CONSTRAINTS — hard boundaries (technology, scope, compatibility — non-negotiable)
   - FORMAT — exact output form (files, structure, what's included and excluded)
   - FAILURE — explicit conditions for failure. Think: how could this "technically work" but actually be wrong? Missing edge cases, performance misses, silent failures, over-engineering.
   Wait for user approval before continuing.

3. **Plan** — Break into steps. Show plan. Wait for OK.

4. **Build** — Implement step by step.

   **Before writing code:** Enumerate each FAILURE condition from the contract as a checklist and state how you will ensure it doesn't trigger. This is a planning artifact, not executable tests — it proves you understand the contract before coding. Example:
   ```
   FAILURE guard:
   - "Legend missing" → I will call compileLegendItems() and assert legendItems.length > 0 in the test
   - "Performance < 50ms" → I will benchmark compileLayer() in the test with a 500-feature dataset
   ```

   **If uncertain about approach:** Prototype in `tmp/` first. Verify the approach works in isolation, then port to the real codebase. Mandatory: delete `tmp/` artifacts before proceeding to step 5. No `tmp/` state survives between steps.

5. **Test** — Run `pnpm typecheck`, then use `.claude/scripts/smart-test.sh` for focused tests during iteration:
   ```bash
   { git diff --name-only; git diff --cached --name-only; } | sort -u | .claude/scripts/smart-test.sh
   ```
   If smart-test returns a focused command, run that. Run full `pnpm test` at final verification (step 6).

5.1. **Eval gate** (conditional — only for AI pipeline files)
   - Skip if no changed files match: `manifest-compiler`, `quality-scorer`, `validators/`, `example-bank`, `system-prompt`, `profiler`
   - Read current `avgQualityScore` from `test-data/eval-report.json`
   - Run: `pnpm eval`
   - Read new `avgQualityScore` from `test-data/eval-report.json`
   - If delta < -2.0: **STOP** — this is a regression. Diagnose before proceeding.
   - If delta >= -2.0: proceed.

5.5. **Live QA** (optional — only for UI-facing changes)
   - Skip this step if the change is backend-only (types, validators, API logic, tests).
   - Trigger when changed files include paths under `app/`, `components/`, `packages/map-core/`, or `packages/map-modules/`.
   - Run 3 reverse prompts through localhost targeting the changed feature area.
   - Use the `live-qa` skill: it navigates localhost, types prompts, screenshots maps, spawns `/map-judge` for visual evaluation.
   - If any scenario returns FAIL → fix before proceeding to Verify.
   - If all scenarios return PASS or ISSUES (minor only) → proceed.

6. **Verify** — Run through every FAILURE condition as a checklist:
   ```
   Contract Verification:
   - [ ] FAILURE 1: {condition} → VERIFIED: {how you confirmed it passes}
   - [ ] FAILURE 2: {condition} → VERIFIED: {how you confirmed it passes}
   - [ ] GOAL metric met: {evidence}
   - [ ] All CONSTRAINTS respected: {confirmation}
   - [ ] FORMAT matches spec: {confirmation}
   ```
   If any condition is violated, fix it before proceeding. "Any of these = not done" — respect that literally.

7. **Self-anneal** — On failure: diagnose → fix → re-test → re-verify → loop (max 5). On success after fix: update approach, log to `.claude/learned-rules.md`.

8. **Review** — Run `/review` (reviewer command, fresh context, changed files only). If reviewer returns ISSUES_FOUND → spawn resolver (fresh context, sees BOTH original code + review critique). Resolver either FIXES, DECLINES, or WONTFIX each issue with reasoning. If resolver returns WONTFIX items, pass to re-review: "Exclude the following resolved issues from your review: {WONTFIX list with reasoning}". Re-review resolved output. Max 3 loops.

9. **Document** — Run documenter command. Ensure CLAUDE.md, STATUS.md, and inline comments match reality.

10. **Done** — Deliver result with contract status:
    ```
    Contract status: ALL PASS | N FAILURES
    GOAL: ✓/✗ {metric achieved — show evidence}
    CONSTRAINTS: ✓/✗ {all respected}
    FORMAT: ✓/✗ {matches spec}
    FAILURE conditions: ✓/✗ {all verified — none triggered}
    ```

## Definition of Done

- All tests pass
- All FAILURE conditions verified with evidence
- Reviewer verdict: PASS (or warnings-only, acknowledged by user)
- Docs updated if behavior changed
- Contract status delivered to user
