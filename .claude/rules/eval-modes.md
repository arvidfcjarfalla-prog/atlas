---
description: Eval system rules — offline vs online mode distinction and scoring dimensions
globs:
  - "test-data/eval-*"
  - "scripts/eval*"
  - "apps/web/scripts/eval*"
  - "**/eval*.ts"
---

# Eval System

Two modes, both use `quality-scorer.ts` (0–100):

- **Offline** (`pnpm eval`): Validate + compile + score pre-built fixtures in `test-data/eval-fixtures.json`. Deterministic, no API key. Never calls AI, never reads `example-bank.ts`.
- **Online** (`pnpm eval:online`): Generate manifests from prompts via live API. Costs tokens. Use for regression testing after model/prompt changes.

Only online eval tests prompt/example changes. Reports: `test-data/eval-report.json`.

**Scoring dimensions:** schema (20) + family (20) + color (20) + classification (15) + normalization (10) + legend (5) + runtime (10).
