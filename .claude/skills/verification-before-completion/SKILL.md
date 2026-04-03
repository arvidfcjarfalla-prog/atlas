---
name: verification-before-completion
description: Iron law — no completion claims without fresh verification evidence. Auto-activates before any "done"/"fixed"/"passes" claim. Not user-invoked.
triggers: []
---

# Verification Before Completion

**The Iron Law:** NO completion claims without fresh verification evidence.

Before saying "done", "fixed", "passes", or "works" — you MUST have run the verification command and read its output in THIS conversation turn. Not "it should work". Not trusting a cached result. Not "I believe it passes".

This skill is not user-invoked. It activates automatically whenever you are about to claim work is complete.

## The Protocol

1. **Identify** — What claim am I about to make?
2. **Command** — What verifies it? (`pnpm typecheck && pnpm test`, `pnpm eval`, browser check)
3. **Execute** — Run the command NOW.
4. **Read** — Read the FULL output (not just exit code).
5. **Match** — Does the output actually confirm my claim?
6. **Claim** — Only now make the statement, citing the evidence.

## Red Flag Words — STOP and Verify

If you catch yourself writing any of these, you have not verified:

- **"should"** → "Tests should pass" — run them.
- **"probably"** → "This probably fixes it" — verify.
- **"I believe"** → "I believe the build succeeds" — run it.
- **"looks good"** → Run tests, don't eyeball.
- **"seems to"** → Run the verification command.

## Atlas Verification Commands

| Claim | Verification |
|---|---|
| "Tests pass" | `pnpm typecheck && pnpm test` — read output |
| "Build succeeds" | `pnpm build` — read output |
| "Bug is fixed" | Reproduce original bug, confirm it's gone |
| "Eval scores stable" | `pnpm eval` — compare against previous report |
| "No regressions" | `pnpm eval:online` (if examples/prompt changed) |
| "UI works" | Check browser console for errors |
| "Subagent succeeded" | Re-verify independently — don't trust agent reports blindly |

## What This Prevents

- False success reports ("tests pass" when they don't)
- Stale verification (tests passed earlier but code changed since)
- Trusting subagent claims without independent confirmation
- Declaring "done" based on code review alone (review ≠ test run)
