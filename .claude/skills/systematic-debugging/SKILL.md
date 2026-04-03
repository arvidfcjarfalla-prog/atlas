---
name: systematic-debugging
description: Structured 4-phase debugging that forces root cause analysis before any fix attempt. Use when something fails, breaks, or behaves unexpectedly.
triggers:
  - /debug
  - debugga
  - felsök
  - why is this failing
  - this doesn't work
---

# Systematic Debugging

Find the root cause before attempting fixes. Symptom fixes are failure.

**When to use:** Any bug, test failure, unexpected behavior, performance problem, build failure, wrong AI output, broken rendering.

**When NOT to use:** The problem is obvious (typo, missing import) — just fix it directly.

## Phase 1 — Root Cause Investigation

Do ALL of these before forming any hypothesis:

1. **Read the full error** — stack trace, console output, validation warnings. Never skim.
2. **Reproduce** — run the failing test, hit the failing endpoint, trigger the broken UI state.
3. **Check recent changes** — `git diff HEAD~3`. Did a recent change cause this?
4. **Locate the failure in the pipeline:**

```
Symptom → Where to look
─────────────────────────────────────────────────────
Wrong map family chosen     → system-prompt.ts family catalog, example-bank.ts
Missing/wrong colors        → manifest colorScheme, data-models color palettes
Validation passes but wrong → cartographic validator gaps
"Cannot read property X"    → Manifest shape mismatch, check LayerManifest types
MapLibre expression error   → manifest-compiler.ts compiled output
Legend doesn't match map    → compileLegendItems() in compiler
Eval score dropped          → eval-report.json per-dimension breakdown
Blank map / no layers       → useManifestRenderer, data source URL
AI returns empty/malformed  → system-prompt.ts, API route error handling
Profiler misreads data      → profiler.ts, input GeoJSON shape
```

5. **Gather evidence** — log intermediate values, save response payloads, capture compiled output.

## Phase 2 — Pattern Analysis

1. Find a **working** example of the same family/feature.
2. Compare working vs broken — what's different?
3. Is the issue specific to one map family or systemic?
4. Check validator output — did validation pass when it shouldn't have? (validator gap)
5. Check eval report — regression or always broken?

## Phase 3 — Hypothesis & Testing

1. Form **ONE** hypothesis about root cause.
2. Design a **minimal** test to confirm or reject it.
3. Run the test.
4. If confirmed → Phase 4.
5. If rejected → **new** hypothesis (don't tweak the same one).
6. **Max 3 hypotheses** before escalating to the user with evidence gathered so far.

## Phase 4 — Implementation

1. Write a **failing test** that captures the bug (if testable).
2. Implement the **smallest possible fix** — change one thing.
3. Verify: `pnpm typecheck && pnpm test`
4. If fix touches AI pipeline: run `pnpm eval` to check for regressions.
5. If fix touches compiler/renderer: check smoke test visually.

## Red Flags — STOP If You Catch Yourself

- "Let me just try changing X" — without understanding why → go back to Phase 1
- Fixing symptoms instead of root cause → you skipped Phase 1–3
- Skipping investigation because "I think I know" → you don't, verify first
- More than 2 fix attempts without a confirmed hypothesis → slow down
- Changing multiple things at once → can't tell what fixed it

## Output

```
ROOT CAUSE: {what was actually wrong}
FIX: {what was changed and why}
EVIDENCE: {test/eval that confirms the fix}
PREVENTION: {optional — how to prevent this class of bug}
```
