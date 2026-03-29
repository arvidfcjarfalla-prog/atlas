---
name: consensus
description: Explore a problem from multiple angles simultaneously. Spawns N sub-agents with different framings, collects answers, and ranks by agreement. Use when the user says "ge mig approaches", "utforska alternativ", "consensus", or "vad finns det för sätt att...".
triggers:
  - consensus
  - ge mig approaches
  - utforska alternativ
  - vad finns det för sätt att
---

# Consensus

Stochastic consensus — like asking multiple experts instead of 1.

## Pipeline

1. **Understand** — User describes a problem or question. Determine output type:
   - **Ranking** — "rank these options" → each agent ranks, aggregate by points
   - **Recommendation** — "what should we do" → each agent proposes ideas, group by similarity
   - **Scoring** — "evaluate these options" → each agent scores 1-10, report mean + std dev
   - **Binary** — "should we do X" → each agent says YES/NO with reasons

2. **Generate framings** — Create N variants (default 5) with different perspectives:
   - Neutral baseline ("analyze objectively")
   - Risk-averse ("weigh downside risks heavily")
   - Growth-oriented ("optimize for upside potential")
   - Contrarian ("challenge conventional wisdom")
   - First-principles ("reason from fundamentals, ignore convention")
   - User-empathy ("think from end-user perspective")
   - Resource-constrained ("assume limited time and budget")
   - Long-term ("optimize for 12-month outcome")
   - Data-driven ("focus only on what's measurable")
   - Systems thinker ("map second and third-order effects")
   For N > 10, cycle through. For N < 10, pick the first N.

3. **Define structured output** — Before spawning, define what each agent must return. Must be mechanically aggregatable:
   - Ranking: "Rank from best to worst as a numbered list"
   - Recommendation: "Propose top 3 recommendations with name, rationale, confidence 1-10"
   - Scoring: "Score each option 1-10 on [criteria]. Output as Option: Score"
   - Binary: "YES or NO, then top 3 reasons"

4. **Spawn sub-agents** — Run all N in parallel via Agent tool with fresh context. Each gets: framing + problem + context + output schema.

5. **Aggregate** — Method depends on output type:

   **Ranking:** Assign points (1st = N, 2nd = N-1...), sum across agents, report final ranking.

   **Recommendation:** Group similar ideas (fuzzy match), count how many agents proposed each:
   | Agreement | Category | Action |
   |-----------|----------|--------|
   | 80%+ of N | **CONSENSUS** | High confidence. Recommend directly. |
   | 40-79% of N | **DIVERGENCE** | Genuine tradeoff. Present alternatives, let user decide. |
   | <40% of N | **OUTLIER** | Potentially brilliant OR hallucinated. Flag for review. |

   **Scoring:** Calculate mean, median, and standard deviation per option. Flag options with std dev > 2 (agents disagree).

   **Binary:** Count YES vs NO. Report the split and summarize strongest arguments from each side.

6. **Present** — Summary with:
   - Top 3 consensus items
   - Most interesting divergence (where user judgment is needed)
   - Most interesting outlier (creative idea worth considering)
   - Recommended path forward

## Execution details

- Default: 5 agents with sonnet (cost-efficient)
- User can override: "kör consensus med 10 agenter"
- For binary decisions, 3 agents is sufficient
- Each agent returns output directly (no file writes)
