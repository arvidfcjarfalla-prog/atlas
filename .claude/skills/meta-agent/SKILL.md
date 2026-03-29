---
name: meta-agent
description: Create new skills from natural language descriptions. Use when the user says "skapa en skill för...", "ny skill:", "meta-agent", or "jag behöver en skill som...".
triggers:
  - meta-agent
  - skapa en skill
  - ny skill
  - jag behöver en skill som
---

# Meta-agent

Creates new skills from natural language descriptions.

## Pipeline

1. **Understand** — User describes what they want a skill for
2. **Read existing skills** — Read ALL skills in `.claude/skills/` and `.agents/skills/` to understand format, structure, and conventions
3. **Read CLAUDE.md** — Understand the pipeline pattern and project rules
4. **Generate** — Create a complete SKILL.md with:
   - YAML frontmatter: `name`, `description`, `triggers`
   - Markdown body: purpose, step-by-step pipeline, definition-of-done
   - If the skill needs a sub-agent: also generate a matching command in `.claude/commands/` with `context: fork`
5. **Show** — Present the generated skill to the user. Wait for approval.
6. **Save** — Write to `.claude/skills/<name>/SKILL.md`

## Constraints

- Every generated skill must follow the same structure as existing skills
- Must not create skills that break rules in CLAUDE.md or `.claude/learned-rules.md`
- Must include a trigger description so Claude knows WHEN to use the skill
- Skills go in `.claude/skills/`, never in `.agents/skills/`
