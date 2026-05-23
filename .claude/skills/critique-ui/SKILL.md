---
name: critique-ui
description: Use when /critique-ui is called manually or by the Stop-hook to adversarially review the current diff against anti-AI fingerprints. Runs the design-critic agent in a forked context and returns JSON ok/block.
when_to_use: Fourth step of the anti-ai-ui four-phase flow. Also invoked by .claude/hooks/design-critic.sh as a Stop-hook gate.
allowed-tools: Read, Grep, Glob, Bash
context: fork
agent: design-critic
model: opus
effort: xhigh
user-invocable: true
disable-model-invocation: true
---

Adversarially review the current diff against the anti-ai-ui rules.

Steps:
1. List changed files with `git diff --name-only`.
2. For each changed file, run the four scripts in `.claude/skills/anti-ai-ui/scripts/`.
3. Read `.claude/skills/anti-ai-ui/tells.json` for the regex source of truth.
4. Apply the decision rule from your agent instructions.

Output: exactly one JSON object on stdout — `{ "ok": true }` or `{ "ok": false, "reason": "<file>:<line> — <tell> — <fix direction>" }`. No prose outside the JSON.
