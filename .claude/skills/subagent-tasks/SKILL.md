---
name: subagent-tasks
description: Dispatch one subagent per task with two-stage review (spec compliance + code quality). Use for plans with 3+ independent tasks where fresh-context review improves quality.
triggers:
  - /subagent-tasks
  - kör med subagenter
  - dispatch tasks
  - subagent build
---

# Subagent-Driven Task Execution

Fresh subagent per task + two-stage review = high quality, fast iteration.

**When to use:** Approved plan with 3+ discrete, independent tasks touching different files.

**When NOT to use:** Tasks are tightly coupled (each depends on previous), single task (do inline), trivial changes (use /quick), or budget-constrained (~3x tokens per task).

## Pipeline

### 1. Load Plan

Extract discrete tasks from the /build contract or standalone plan. Each task needs:
- Description of what to implement
- Files to modify
- Acceptance criteria (from FAILURE conditions)

### 2. Assess Independence

Check each pair of tasks: do they modify the same file?

- **Same file** → sequential (one must finish before the other starts)
- **Different files** → parallel (dispatch simultaneously)

```
Task A (manifest.ts) ─┐
                       ├─ sequential
Task B (manifest.ts) ─┘

Task C (compiler.ts) ─── parallel with A/B
Task D (validators/) ─── parallel with A/B and C
```

### 2.5. Assemble Context Bundle

For each task, based on FILES TO MODIFY, assemble relevant project rules:
- Always include: CLAUDE.md, last 10 entries from `.claude/learned-rules.md`
- If files match `pxweb*`, `geography*` → include `.claude/rules/pxweb-geography.md`
- If files match `marketing/`, `landing*`, `editorial*` → include `.claude/rules/editorial-landing.md`
- If files match `eval*`, `scorer*`, `example-bank*` → include `.claude/rules/eval-modes.md`
- If files match `test*`, `e2e*`, `playwright*` → include `.claude/rules/testing-workflow.md`
- If files match `*.mjs` Node scripts → include `.claude/rules/node-script-imports.md`

Pass as CONTEXT BUNDLE in the agent prompt alongside TASK, FILES, ACCEPTANCE CRITERIA.

### 3. Dispatch Implementer

Spawn one Agent per task with this context:

```
TASK: {task description}
FILES TO READ: {list of files to read before modifying}
FILES TO MODIFY: {list of files to change}
ACCEPTANCE CRITERIA: {from plan}
PROJECT RULES: Read /Users/arvidhjartberg/atlas/CLAUDE.md for conventions.

After implementation:
1. Run: pnpm typecheck
2. Report: files changed, typecheck result, decisions made
```

Rules for implementers:
- They CAN ask clarifying questions (return question instead of code)
- They MUST read files before modifying
- They MUST run `pnpm typecheck` after changes
- They should NOT run full test suite (that's for integration)

Dispatch all independent implementers simultaneously via the Agent tool.

### 4. Spec Review

After each implementer finishes, spawn a spec reviewer:

```
You are reviewing whether an implementation matches its specification.

TASK SPEC: {original task + acceptance criteria}
CHANGES MADE: {implementer's report}
FILES TO READ: {modified files}

Review ONLY spec compliance:
- Does it do what the spec asked?
- Are all acceptance criteria met?
- Is anything missing?
- Is anything added that wasn't in the spec? (scope creep)

VERDICT: PASS | FAIL
ISSUES: {spec violations, if any}
```

If FAIL → send issues back to implementer for fix. Max 2 fix cycles.

### 5. Code Quality Review

After spec review passes, spawn a code quality reviewer:

```
You are reviewing code quality for an Atlas project change.
Read CLAUDE.md at /Users/arvidhjartberg/atlas/CLAUDE.md for project rules.

Review the changed files for:
- Correctness: logic errors, null safety, edge cases
- Atlas rules: AI never generates raw MapLibre; compiler stays dumb
- Code quality: naming, dead code, unused imports
- Security: injection, XSS, secret exposure
- Backward compatibility: breaking public types or APIs

VERDICT: PASS | ISSUES_FOUND
CRITICAL: {must fix — blocks merge}
WARNINGS: {should fix — doesn't block}
```

CRITICAL → fix cycle (max 2). WARNINGS reported but non-blocking.

### 6. Integration

After all tasks pass both reviews:

1. Run `pnpm typecheck && pnpm test`
2. If failures → identify which task caused it, dispatch fix agent for that task only
3. Report to user

### 7. Summary

```
Subagent Tasks — Complete
═════════════════════════
Tasks: N total, M passed, K needed fixes

Task 1: {description} — PASS
  Spec: PASS | Quality: PASS
  Files: file1.ts, file2.ts

Task 2: {description} — PASS (1 fix cycle)
  Spec: PASS | Quality: PASS after fix
  Files: file3.ts

Integration: typecheck ✓ | tests ✓
```

## Execution Details

- **Parallel tasks:** dispatch all independent implementers simultaneously
- **Sequential tasks:** wait for dependency before dispatching
- **Clarifying questions:** if implementer asks, answer from plan context, re-dispatch
- **Token cost:** ~3x per task (implement + 2 reviews). 5 tasks ≈ 15 agent calls.
- **Model:** use default model for all agents (no model override)
- **Context:** each agent gets fresh context — no conversation history passed
