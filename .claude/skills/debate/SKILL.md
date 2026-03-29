---
name: debate
description: Multi-perspective debate on a decision or architecture question. Agents with different roles argue their positions to surface blind spots. Use when the user says "debattera detta", "agent debate", "vilka perspektiv missar jag", or "devil's advocate".
triggers:
  - debate
  - debattera
  - agent debate
  - vilka perspektiv missar jag
  - devil's advocate
---

# Debate

Multiple perspectives debate a decision to find nuances and blind spots. Agents read each other's arguments and respond across rounds.

## Pipeline

1. **Understand** — User describes a decision or architecture question
2. **Assign roles** — Create 3-5 roles with different perspectives:
   - **Pragmatist** — "What works now with least risk?"
   - **Skeptic** — "What can go wrong?"
   - **User advocate** — "What's best for the end user?"
   - **Cost optimizer** — "What's cheapest/fastest?"
   - **Future thinker** — "What scales best in 6 months?"
   For N > 5, add roles that create productive tension with existing ones.

3. **Round 1 — Opening positions** — Spawn all agents in parallel. Each states their initial take:
   ```
   POSITION: [One-sentence stance]
   REASONING: [3-5 key points]
   PROPOSAL: [Concrete recommendation]
   CONCERNS: [What could go wrong with this approach]
   ```

4. **Rounds 2-3 — Debate** — Each agent reads ALL previous responses and responds:
   ```
   AGREEMENTS: [What other agents got right — concede good points]
   DISAGREEMENTS: [Where you still differ and why]
   REFINED PROPOSAL: [Updated recommendation based on discussion]
   CONFIDENCE: [1-10]
   ```
   Agents must engage with what others said. No repeating previous positions.

5. **Convergence check** — After each round, check if all agents have confidence 8+ and aligned proposals. If yes, stop early — no need for more rounds.

6. **Synthesize** — The orchestrator (not a sub-agent) reads the full debate and produces:
   - **Consensus** — What all roles agree on (high confidence)
   - **Disagreements** — Where roles remained split (genuine tradeoffs for user to decide)
   - **Outlier ideas** — Unique insights from individual roles
   - **Mind changes** — Where an agent changed position (strong signal)
   - **Recommended path forward** — Orchestrator's call, informed by debate

## Execution details

- Each round: spawn all agents in parallel via Agent tool with fresh context
- Pass full debate history to each agent in rounds 2+
- Default: 3 agents, 3 rounds (9 agent calls)
- User can override: "debattera med 5 perspektiv i 4 rundor"
