---
name: auto-research
description: Karpathy-style optimization loop for map generation quality. Mutates example-bank.ts, measures eval score, keeps improvements, reverts regressions. Use when the user says "auto-research", "optimize prompts", "förbättra eval score", or "kör karpathy-loop".
triggers:
  - /auto-research
  - auto-research
  - optimize prompts
  - förbättra eval score
  - kör karpathy-loop
  - improve map quality
---

# Auto-Research

Autonomous optimization loop: mutate examples → eval → keep if better, revert if worse.

**When to use:** You want to systematically improve AI map generation quality without manual trial-and-error.

**When NOT to use:** The problem is a broken rule, missing validator, or scorer bug — those need human judgment, not automated search.

## Offline vs Online — Critical Distinction

**Offline eval (`pnpm eval`) scores pre-built fixture manifests.** It does NOT call the AI and does NOT read `example-bank.ts`. Mutating examples has zero effect on offline scores. Offline eval is useful for testing the scorer and validator, not for optimizing AI output.

**Online eval (`pnpm eval:online`) sends prompts to the AI API.** The AI reads `example-bank.ts` via the system prompt. Mutating examples directly affects online scores. This is the only mode that makes sense for the auto-research loop.

**Therefore: this skill REQUIRES online mode.** It needs a running dev server (`pnpm dev`) and costs API tokens (~$1–4 per iteration depending on prompt count). Budget accordingly.

## Invariants

**READ-ONLY during auto-research — these files must not be modified by this skill:**
- `apps/web/lib/ai/system-prompt.ts` (cartographic rules — may be modified by /build or manual Phase 1A work, but never by auto-research)
- `apps/web/lib/ai/quality-scorer.ts` (scoring logic)
- `apps/web/lib/ai/validators/` (validation rules)
- `apps/web/test-data/eval-fixtures.json` (eval data)
- `apps/web/test-data/eval-prompts.json` (eval prompts)

**MUTABLE — only this file:**
- `apps/web/lib/ai/example-bank.ts` (few-shot examples)

**Why:** The scorer is the measurement instrument. Mutating it while optimizing against it is Goodhart's Law — the metric gets gamed, not the quality. Validators are correctness guards. System-prompt rules encode hard-won cartographic knowledge. Examples are the safe lever.

## Pipeline

### 0. Setup

Ensure the log directory exists:

```bash
mkdir -p tmp/auto-research
```

### 1. Verify Prerequisites

Confirm the dev server is running:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/ai/generate-map 2>/dev/null
```
If not 405 (method not allowed = server is up), tell the user to run `pnpm dev` first.

### 2. Baseline

Run **online** eval and record the starting score. The eval runner exits with code 1 when any prompt fails — this is expected, not an error. Always read the JSON report regardless of exit code.

```bash
cd apps/web && npx tsx scripts/eval-runner.ts --online --base-url http://localhost:3000 || true
```

Read `test-data/eval-report.json`. Record:
- `avgQualityScore` (the metric)
- Per-prompt scores and per-dimension breakdown (for train/holdout split)
- Total pass/fail counts
- Which families were generated vs expected

### 3. Train/Holdout Split

Count prompts in `test-data/eval-prompts.json`. Split into train (~60%) and holdout (~40%), rounding train up:
- **N=10:** Train 6, Holdout 4
- **N=20:** Train 12, Holdout 8
- **N=30:** Train 18, Holdout 12

Choose the split to maximize family diversity in the train set. Record the split as the first entry in the mutation log (iteration 0):

```json
{
  "iteration": 0,
  "operator": "setup",
  "description": "Train/holdout split",
  "train": ["prompt-id-1", "prompt-id-2", ...],
  "holdout": ["prompt-id-3", "prompt-id-4", ...],
  "baselineTrainScore": 78.0,
  "baselineHoldoutScore": 82.0,
  "timestamp": "2026-03-29T14:00:00Z"
}
```

The split is fixed for the entire run — never re-split mid-loop.

### 4. Read Current Examples

Read `apps/web/lib/ai/example-bank.ts`. Understand:
- How many examples exist
- Which map families they cover
- The `selectExamples()` function signature
- The structure of each example entry

### 5. Mutation Loop

Run iterations until budget is exhausted. Each iteration:

#### 4a. Choose Mutation Operator

Two primary operators (choose based on bottleneck analysis):

1. **Add example** — Generate a new high-quality MapManifest example for an underrepresented family. The example must be a valid manifest that would pass validation and score ≥80. Guard against duplication: do not add if the family + geometry type combination already has 2+ examples.

2. **Remove example** — Identify the weakest example (lowest quality contribution, redundant family coverage, or known to produce confusing guidance). Remove it.

Choose the operator that addresses the most likely bottleneck based on the previous iteration's results. If first iteration, start with "add example" for the family with lowest train scores.

Note: Reordering examples only affects online eval (where the AI reads them). In offline mode, example order has no impact on pre-built fixture scoring. Reserve reorder for online-gate iterations.

#### 4b. Stash and Mutate

```bash
git stash push -m "auto-research-iter-N" -- apps/web/lib/ai/example-bank.ts
```

Apply the chosen mutation to `example-bank.ts`.

#### 4c. Verify and Evaluate

First, typecheck the mutation (catches malformed examples):

```bash
cd apps/web && npx tsc --noEmit apps/web/lib/ai/example-bank.ts 2>&1 | head -20
```

If typecheck fails, auto-reject this mutation (skip eval, go to 4d reject).

Then run online eval:

```bash
cd apps/web && npx tsx scripts/eval-runner.ts --online --base-url http://localhost:3000 || true
```

Read `test-data/eval-report.json`. Extract per-prompt `qualityScore.total` values. Compute unrounded averages for train and holdout sets (do not use the report's rounded `avgQualityScore` — use raw per-prompt totals for finer granularity).

#### 4d. Accept or Reject

**Score gate** — BOTH must hold:
- Train avg score improved by ≥1 point vs previous accepted state
- Holdout avg score did not regress (≥0 delta)

**Simplicity gate** — if `trainDelta < 1.0` (borderline gain):
- Measure file size before and after: `wc -c < apps/web/lib/ai/example-bank.ts`
- Accept only if `new_bytes <= old_bytes` (net deletion or neutral)
- If the mutation adds code for a marginal gain, reject it. Log reason as `"simplicity-rejected"`.
- Rationale: at high scores, marginal gains that increase complexity degrade maintainability and make future mutations harder. A borderline improvement from deletion proves genuine redundancy was found.

If `trainDelta >= 1.0`, accept regardless of size change (a strong improvement justifies added complexity).

On accept, drop the now-unnecessary stash:
```bash
git stash drop
```

**Reject** if either gate fails — restore pre-mutation state:
```bash
git stash pop
```

#### 4e. Log

Append to `tmp/auto-research/mutation-log.json`:

```json
{
  "iteration": 1,
  "operator": "add",
  "description": "Added flow example with trade routes",
  "trainDelta": 2.3,
  "holdoutDelta": 0.5,
  "accepted": true,
  "trainScore": 78.3,
  "holdoutScore": 82.0,
  "timestamp": "2026-03-29T14:30:00Z"
}
```

#### 4f. Budget Check

After each iteration, estimate cumulative cost:
```
cost_per_iter = num_prompts × $0.15  (conservative estimate)
cumulative_cost = iterations × cost_per_iter
```

Print running cost in the iteration log: `"Iteration N — cumulative cost: ~$X.XX / $BUDGET"`

**Stop** when `cumulative_cost > budget`. Default budget: **$20**. User can override: "kör med budget $50".

Do NOT stop on plateau. If stuck, think harder — try more radical mutations, combine near-misses, try deletion-only runs. The budget is the only gate. When budget is exhausted, proceed to step 5.

### 5. Results

After the loop ends (budget exhausted), present:

```
Auto-Research Results
═══════════════════════════════════════
Iterations:      N
Accepted:        M mutations
Baseline score:  X.X (train) / Y.Y (holdout)
Final score:     X.X (train) / Y.Y (holdout)
Net improvement: +Z.Z points

Per-dimension deltas (train):
  schemaCompleteness:    +X
  familyAppropriateness: +X
  colorSchemeQuality:    +X
  classificationQuality: +X
  normalization:         +X
  legendCompleteness:    +X
  runtimeQuality:        +X

Accepted mutations:
  1. [add] Added flow example — train +2.3, holdout +0.5
  2. [remove] Removed redundant point example — train +1.1, holdout +0.2

Plateau: YES/NO (after iteration K)
```

### 6. Plateau Recommendations

If the loop plateaued, analyze the mutation log and per-dimension breakdown to recommend:

- Which scorer dimensions showed the least improvement (candidates for human rule audit)
- Which map families are stuck (need better system-prompt rules or validator adjustments)
- Whether expanding the eval fixtures (more test cases) would help more than further example mutations

Present these as recommendations for human review — never auto-expand scope to scorer or validator mutations.

## Execution Details

- **Requires:** Running dev server (`pnpm dev`) and `ANTHROPIC_API_KEY` in env
- **Cost:** ~$0.15 × num_prompts per iteration. With 24 prompts: ~$3.60/iteration.
- **Budget:** Default $20 (~5 iterations). User can override: "kör med budget $50"
- No iteration cap. No plateau early-stop. Budget is the only gate.
- All work happens in `apps/web/` — no other packages affected
- Mutation log persists in `tmp/auto-research/` (ensure `tmp/` is in `.gitignore`)
- Each iteration is atomic: stash → mutate → typecheck → eval → accept/reject → log
- The eval runner exits with code 1 when prompts fail — this is expected, not a crash. Always read the JSON report.
- On any unexpected error (git conflict, missing file, unrecoverable crash), stop the loop and present the log so far
