---
name: handoff
description: Write structured session state to a dated file for cross-session continuity. Use when ending a long session, before a break, or when context is getting long. Trigger with /handoff, "spara session", "handoff", or "sammanfatta session".
---

# Handoff

Save the current session's state so the next session can continue seamlessly.

## Steps

1. **Gather state** — review what was worked on, what changed, what was decided, and what remains.

2. **Write handover file** to `.claude/handovers/YYYY-MM-DD_HHMM.md`:

```markdown
---
date: YYYY-MM-DD HH:MM
goal: {one-line goal}
status: completed | partial | blocked
branch: {current branch}
files_changed: {number}
---

# Handover — {date} {time}

## Goal
{What we were working on this session}

## Accomplished
- {Change 1: behavior description, not code}
- {Change 2}

## Decisions
- {Decision}: {why we chose this}

## Remaining
- [ ] {Task not done}
- [ ] {Task not done}

## Known Issues
- {Any failing tests, broken state, or blockers}

## Next Session Should
1. {First thing to do}
2. {Second thing}

## Changed Files
{git diff --stat output}
```

3. **Update learned-rules.md** if any new rules were discovered.

4. **Report** the handover file path to the user.

## Rules

- Describe changes in terms of behavior ("maps now remember data when reopened"), not code ("added artifact_id FK").
- Include failed approaches so the next session doesn't retry them.
- Keep it under 40 lines — enough to resume, not a full transcript.
- Do NOT include anything already in CLAUDE.md or learned-rules.md.
