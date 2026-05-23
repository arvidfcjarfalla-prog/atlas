---
name: anti-ai-ui
description: Use when reviewing, building, or critiquing UI to prevent AI-slop aesthetics. Always-relevant context bundle covering Rauno interface rules, Kowalski motion principles, color/copy/structure fingerprints, and positive design tokens. Pairs with the four-phase agent workflow (product-designer, ux-architect, frontend-design-engineer, design-critic) and a blocking Stop-hook gated by tells.json.
when_to_use: Load before any UI generation, edit, or review. Read references/anti-ai-fingerprint.md and references/positive-patterns.md before writing components. Reference tells.json as the single source of truth for what to flag.
allowed-tools: Read, Grep, Glob
user-invocable: true
disable-model-invocation: false
---

# anti-ai-ui

This skill is the always-relevant context bundle for any UI work in this project. It does not run a flow on its own — it primes Claude with the rules, the negative fingerprints, and the positive patterns.

The flow is gated by the `/anti-ai-review` orchestrator and by the Stop-hook in `.claude/hooks/design-critic.sh`. Those tools read the same `tells.json` that lives here.

## What is in this skill

- `tells.json` — single source of truth for banned hex, banned classes, banned copy, structural tells, composite vibe-check threshold, and positive signals.
- `references/anti-ai-slop.md` — the Anthropic cookbook `DISTILLED_AESTHETICS_PROMPT` verbatim.
- `references/anti-ai-fingerprint.md` — what AI-generated UI looks like and why.
- `references/positive-patterns.md` — what taste-tier UI looks like (Vercel/Linear/Radix/Vaul canon).
- `references/rauno-rules.md` — Rauno Freiberg's 56 interface rules verbatim.
- `references/kowalski-motion.md` — Emil Kowalski's motion values and curves.
- `references/design-sources.md` — distilled constants from Carbon, GOV.UK, WCAG, Apple HIG, Material.
- `references/mcp-setup.md` — shadcn and registry-directory MCP configuration.
- `references/pressure-scenarios.md` — three test cases that bait AI-slop output.
- `references/internals.md` — Claude Code 2.1.150 specifics: paths vs globs, stop_hook_active, agent-hook fallback.
- `references/security.md` — `~/.claude` plaintext warning, cleanupPeriodDays, MCP trust model.
- `examples/positive/` — paste-ready CSS for easing tokens, OKLCH theme, font-feature-settings, @starting-style, view-transitions.
- `examples/negative/` — counter-examples that hit the composite vibe-check.
- `scripts/composite-vibe-check.sh`, `color-fingerprint.sh`, `copy-banlist.sh`, `em-dash-density.sh` — read regexes from `tells.json`, exit 2 on violations.

## How to use

When you touch UI in this project:

1. Read `references/anti-ai-fingerprint.md` and `references/positive-patterns.md` in full. They are short and complete.
2. Open `tells.json` and skim the lists. The composite vibe-check is the bar you must clear.
3. Implement. Use the easing tokens from `examples/positive/easing-tokens.css` and the OKLCH theme from `examples/positive/oklch-theme.css` as starting points.
4. Before declaring done, run the four scripts in `scripts/` against your diff or let the Stop-hook do it.

## What this skill does not do

It does not invoke other skills. It does not run flows. It does not mutate code. It is a context bundle plus a regex library plus a scripts library. The orchestration lives in `/anti-ai-review` and the gating lives in the Stop-hook.

## Stack assumption

Default: shadcn/ui + Tailwind (v4 with `@theme`). Override from the project's `CLAUDE.md` if the stack differs. Vanilla CSS, vanilla HTML, and vite-plugin-pwa apps are also covered — see `references/positive-patterns.md` for stack-neutral guidance.
