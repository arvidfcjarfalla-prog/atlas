---
name: reviewer
description: Fresh-context code review sub-agent. Spawns with no history — sees only changed files. Use via /review command or automatically from the build skill.
triggers:
  - /review
  - granska
---

# Reviewer

Fresh-context code review. The reviewer sees ONLY changed files — no accumulated history, no sunk-cost bias, no memory of failed approaches.

## Why Fresh Context

- Implementer: 200K+ tokens of accumulated context, blind to own mistakes
- Reviewer: Empty context. Sees only the end result. Catches what the implementer missed.

## What It Reviews

- **Correctness** — Logic errors, off-by-one, null safety
- **Edge cases** — Empty arrays, missing keys, concurrent access
- **Security** — Injection, auth bypass, secret exposure
- **Backward compatibility** — Breaking changes to public APIs or types
- **Atlas-specific rules** — AI never generates raw MapLibre; manifest compiler is the only path; compiler stays dumb

## Output Format

```
VERDICT: PASS | FAIL

CRITICAL (must fix):
- [file:line] Description

WARNINGS (should fix):
- [file:line] Description

NOTES:
- Observations that don't block merge
```

## Flow

1. Collect list of changed files (git diff or explicit list)
2. Spawn sub-agent with fresh context containing only: changed files + CLAUDE.md rules
3. Sub-agent reviews and returns structured verdict
4. If FAIL → implementer fixes → re-review (max 3 loops)
5. If PASS (or warnings-only) → continue
