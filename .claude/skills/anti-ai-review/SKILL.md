---
name: anti-ai-review
description: Use when the user wants the full four-phase anti-ai-ui flow on a new feature. Orchestrates discover → ux-architecture → implement-page → critique-ui sequentially from the main thread with hard step-gating.
when_to_use: Triggered manually with /anti-ai-review <feature description>. For deterministic sequencing without relying on prompt compliance, use scripts/orchestrate.sh instead.
allowed-tools: Read, Grep, Glob, Bash
user-invocable: true
disable-model-invocation: true
arguments:
  - name: feature
    description: Short description of the feature to build
argument-hint: <feature description>
---

You are in the anti-ai-review orchestrator phase. Feature: $ARGUMENTS.

## Hard rules — do not deviate

- **Do NOT write code in this turn.**
- **Do NOT skip phases.**
- **Do NOT compress phases into a single combined invocation.**
- **Do NOT respond to the user with summary text until step 4 has returned `{ "ok": true }` or you have hit the loop ceiling.**

Skills cannot programmatically call other skills, so you (the main thread) are the sequencer. Execute the four steps below in exact order. Do not begin step N+1 until step N has produced its expected artifact.

## Phases

### STEP 1 — Discover
Invoke `/discover` with `$ARGUMENTS`. Wait for the brief.
- Expected artifact: a one-page brief plus open questions.
- If the brief lists open questions: present them to the user. STOP. Resume from step 2 after user answers.
- If no brief returns: report the failure and STOP — do not proceed.

### STEP 2 — UX architecture
Invoke `/ux-architecture` with the discover brief.
- Expected artifact: `docs/ux/<feature-slug>.md` on disk.
- Verify the file exists with `ls docs/ux/` before proceeding.
- If the spec is missing: report and STOP.

### STEP 3 — Implement
Invoke `/implement-page` referencing the spec path.
- Expected artifact: non-empty `git diff` against HEAD.
- Verify with `git diff --stat HEAD` before proceeding.
- If diff is empty: report and STOP.

### STEP 4 — Critique
Invoke `/critique-ui`.
- If it returns `{ "ok": true }`: report success to user. DONE.
- If it returns `{ "ok": false, "reason": "..." }`: surface the reason, route back to STEP 3 with the reason as additional context, then re-critique. Maximum **three** STEP 3 → STEP 4 loops.
- After 3 failed loops: escalate to user with the accumulated reasons and STOP.

## Compliance check

If you skipped any step:
- The design-critic in STEP 4 will likely block because the implementation drifted without spec.
- The Stop-hook (`.claude/hooks/design-critic.sh`) will block on AI-slop in the diff.
- The user will see in the transcript that the flow was not followed.

There is no shortcut. The flow exists because Claude defaults to AI-slop without it.

## What this skill does not do

- It does not declare success itself. The Stop-hook is the final gate.
- It does not run the four phases in parallel.
- It does not skip ahead when the user's brief "seems clear" — discovery still runs.

## Deterministic alternative

If you want hard runtime sequencing instead of prompt compliance, run:
```
.claude/skills/anti-ai-ui/scripts/orchestrate.sh "<feature description>"
```
That script uses the Claude SDK headless mode (`claude --skill ...`) to invoke each phase as a separate subprocess. Sequence is enforced by bash, not by prompt. Requires `claude` CLI on PATH.
