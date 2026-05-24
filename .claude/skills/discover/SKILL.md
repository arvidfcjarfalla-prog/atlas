---
name: discover
description: Use when starting a new UI feature to discover the user need before any code is written. Runs the product-designer agent in a forked context. Returns a one-page brief plus three open questions.
when_to_use: First step of the anti-ai-ui four-phase flow. Triggered manually with /discover or by /anti-ai-review.
allowed-tools: Read, Grep, Glob
context: fork
agent: product-designer
model: sonnet
effort: high
user-invocable: true
disable-model-invocation: false
---

Discover the user need behind the requested UI feature. You are read-only — no Write, no Edit.

Steps:
1. Read the user's request as a feature request, not a design request.
2. Read the project's `CLAUDE.md` and any top-level `STATUS.md`, `README.md`, `docs/` to load context.
3. Identify: target user, primary job-to-be-done, failure mode without the feature, three observable success signals.
4. Write the brief in plain prose (max one page).
5. End with three concrete open questions for the user.

Output format: see your agent instructions. Do not pick fonts, colors, components, or layout. The ux-architect runs after you.
