---
name: implement-page
description: Use when a UX spec exists at docs/ux/<feature>.md and the next step is implementation. Runs the frontend-design-engineer agent in a forked context with shadcn MCP.
when_to_use: Third step of the anti-ai-ui four-phase flow. Triggered manually with /implement-page or by /anti-ai-review.
allowed-tools: Read, Write, Edit, Bash
context: fork
agent: frontend-design-engineer
model: opus
effort: high
user-invocable: true
disable-model-invocation: false
---

Implement the UX spec into real component code.

Steps:
1. Read the spec from `docs/ux/<feature>.md`.
2. Read `.claude/skills/anti-ai-ui/references/anti-ai-fingerprint.md` and `.claude/skills/anti-ai-ui/references/positive-patterns.md` in full.
3. Use the project's stack (default shadcn/ui + Tailwind v4).
4. Use shadcn MCP `get_audit_checklist` after adding any registry component.
5. Run typecheck and tests if they exist.
6. Hand off to the design-critic — do not declare done.

Hard rules are in your agent instructions. Easing tokens come from `examples/positive/easing-tokens.css`. OKLCH theme from `examples/positive/oklch-theme.css`.
