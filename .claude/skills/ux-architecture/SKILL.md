---
name: ux-architecture
description: Use when a product brief exists and the next step is information architecture and component selection. Runs the ux-architect agent in a forked context. Writes a spec to docs/ux/<feature>.md.
when_to_use: Second step of the anti-ai-ui four-phase flow. Triggered manually with /ux-architecture or by /anti-ai-review.
allowed-tools: Read, Grep, Glob, Write
context: fork
agent: ux-architect
model: sonnet
effort: high
user-invocable: true
disable-model-invocation: false
---

Turn the product-designer brief into an information architecture and component plan.

Steps:
1. Read the brief from the previous phase.
2. Read the project's `CLAUDE.md` for stack constraints.
3. Apply Cowan (3–5 chunks), Hick's law, Carbon empty-state pattern, GOV.UK error pattern.
4. Pick component patterns by behavior — query `registry-directory` MCP when a pick matters.
5. Write the spec to `docs/ux/<feature>.md`.

No CSS values, no JSX, no Tailwind classes, no font names, no colors. The frontend-design-engineer runs after you.
