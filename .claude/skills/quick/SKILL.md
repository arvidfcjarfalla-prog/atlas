---
name: quick
description: Lightweight pipeline for trivial tasks. Skips contract, reviewer, and documenter. Use when the user says /quick or for tasks taking < 5 minutes.
triggers:
  - /quick
---

# Quick

Lightweight skill for trivial tasks. No contract, no reviewer, no documenter.

## Pipeline

1. **Plan** — Brief breakdown. No approval wait unless ambiguous.
2. **Build** — Implement.
3. **Test** — Run `pnpm typecheck && pnpm test`.
4. **Done** — Deliver result.
