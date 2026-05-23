---
name: anti-ai-review
description: Use when the user wants the full four-phase anti-ai-ui flow on a new feature. Orchestrates discover → ux-architecture → implement-page → critique-ui sequentially from the main thread.
when_to_use: Triggered manually with /anti-ai-review <feature description>.
allowed-tools: Read, Grep, Glob, Bash
user-invocable: true
disable-model-invocation: true
arguments:
  - name: feature
    description: Short description of the feature to build
argument-hint: <feature description>
---

Run the anti-ai-ui four-phase flow for the feature: $ARGUMENTS.

This skill runs in the main thread and dispatches each phase as a forked-context skill. It does not invoke other skills via skill mechanism — it tells the orchestrator what to do, and the orchestrator delegates.

## Phases

1. **Discover.** Run the discover skill. Read its brief. If the brief has open questions, surface them to the user before proceeding.
2. **UX architecture.** Run the ux-architecture skill. Read the spec at `docs/ux/<feature>.md`.
3. **Implement.** Run the implement-page skill. The engineer writes code.
4. **Critique.** Run the critique-ui skill. If it returns `{ "ok": false }`, surface the reason, route back to implement-page with the reason, and re-critique. Maximum three loops before escalating to the user.

## Stop conditions

- All three loop iterations fail → stop and ask the user how to proceed.
- Critique returns `{ "ok": true }` → stop and report success.
- Any phase exits with an error → surface the error and stop.

## What this skill does not do

It does not declare success itself. The Stop-hook (`.claude/hooks/design-critic.sh`) is the final gate.
