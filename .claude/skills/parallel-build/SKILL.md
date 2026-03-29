---
name: parallel-build
description: Build the same feature using 3+ different approaches in parallel, test all, pick the best. Use when the user says "parallel build", "testa flera approaches", "bygg tre varianter", or when a task has multiple viable implementation paths and the best one isn't obvious.
triggers:
  - parallel build
  - testa flera approaches
  - bygg tre varianter
  - vilken approach är bäst
---

# Parallel Build

Build the same thing N ways simultaneously. Test all. Pick the winner. Discard the rest.

**When to use:** The best implementation path isn't obvious, and trying one approach at a time wastes time if it turns out to be the wrong one. Exploring 3 approaches in parallel costs the same time as 1 sequential attempt.

**When NOT to use:** The task has one obvious approach, or is trivial enough that any approach works fine.

## Pipeline

1. **Understand** — User describes what they want to build.

2. **Generate approaches** — Ask the parent agent (or user) to describe 3-5 distinct implementation approaches. For each:
   - Name and one-sentence description
   - Key tradeoff (what it optimizes for vs what it sacrifices)
   - Expected complexity

3. **Set up isolation** — Create a folder per approach:
   ```
   tmp/parallel-build/
   ├── approach-1-{name}/
   ├── approach-2-{name}/
   └── approach-3-{name}/
   ```
   Each approach works in its own folder. No cross-contamination.

4. **Build in parallel** — Spawn one sub-agent per approach via the Agent tool. Each agent gets:
   - The original task description
   - Its specific approach assignment
   - The isolated folder path
   - Instructions to build AND test within that folder
   All agents run in parallel.

5. **Collect results** — When all agents finish, gather:
   - Did it work? (pass/fail)
   - Speed (if measurable)
   - Code complexity (lines, dependencies)
   - Test results
   - Any issues encountered

6. **Compare** — Present a side-by-side comparison:
   ```
   | Metric       | Approach 1    | Approach 2    | Approach 3    |
   |-------------|---------------|---------------|---------------|
   | Status      | PASS          | PASS          | FAIL          |
   | Speed       | 140ms         | 95ms          | -             |
   | Complexity  | 45 lines      | 120 lines     | -             |
   | Tradeoff    | Simple/slow   | Fast/complex  | -             |
   ```

7. **Pick winner** — User selects the best approach (or agent recommends based on results).

8. **Merge** — Move the winning implementation from `tmp/parallel-build/approach-N/` into the actual codebase. Run `pnpm typecheck && pnpm test`. Delete `tmp/parallel-build/`.

## Execution details

- Default: 3 approaches (user can override)
- Each sub-agent runs with fresh context via Agent tool
- Sub-agents have no knowledge of each other's approaches
- Failed approaches are still valuable — document WHY they failed in learned-rules.md if the failure reveals a non-obvious constraint
