---
name: codebase-review
description: >
  Systematic codebase audit that finds dead code, broken imports, stale workarounds, architectural
  inconsistencies, missing tests, and incorrect data flows — then produces a prioritized Markdown
  report with severity and effort ratings. Works package-by-package on any TypeScript/JavaScript
  monorepo or single-repo project. Use this skill whenever the user mentions "review the codebase",
  "audit the code", "find dead code", "clean up the repo", "what's broken", "code health check",
  "tech debt audit", "find unused code", "codebase inventory", or any request to systematically
  verify correctness and cleanliness across a project. Also trigger when the user wants to
  "go through every file", "find what's not used", "verify imports", or asks about code quality
  at a project-wide level.
---

# Codebase Review

Audit a codebase package-by-package. Read every file, trace how things connect, surface real problems. Output: a short, scannable Markdown report per package.

## Core Rule

Never claim something is "unused" or "broken" without having searched the repo and seen the evidence yourself. Cite the file path. If unsure, mark it "needs verification".

## Before You Start

1. Read CLAUDE.md / README at the repo root — understand the architecture and conventions.
2. Map packages: `find . -name "package.json" -not -path "*/node_modules/*"`
3. Understand the dependency graph between packages (needed to trace cross-package imports).

## What to Look For (per package)

Go through each category. "Nothing found" is fine — say so briefly.

**Unused code** — Exports nobody imports. Functions defined but never called. Commented-out blocks. Search the *entire repo*, not just the current package.

**Broken connections** — Imports pointing at moved/renamed things. Config read in one place but hardcoded elsewhere. Props passed but never used. `as any` / `@ts-ignore` hiding real type errors.

**Error handling** — Empty catch blocks. Errors logged but not handled. Async race conditions (stale results in React effects).

**Tests** — Source files with complex logic but no test file. Tests that run code but never call `expect()`.

**Dependencies** — Packages in package.json that aren't imported. Version mismatches across the monorepo.

**Consistency** — Mixed naming conventions. Two ways to do the same thing. Stale TODOs and outdated comments.

## Report Format

Keep it short. The user wants to scan findings and act — not read prose.

One file per package: `review-{package-name}.md`

```markdown
# {package-name}

{1 sentence: overall health verdict}

## Fix These (breaks things or hides bugs)

- **{title}** — `path/to/file.ts:42` — {what's wrong, 1 sentence}. Fix: {what to do}.
- ...

## Clean Up (dead code, unused stuff)

- **{title}** — `path/to/file.ts` — {what and why}. Fix: {delete / move / rename}.
- ...

## Nice to Have (style, consistency)

- **{title}** — {what}. Fix: {suggestion}.
- ...

## Looks Good

{Brief list of areas reviewed and found clean — confirms thoroughness.}
```

Plus one summary: `review-summary.md`

```markdown
# Review Summary

{2-3 sentences on overall health}

## Action List (by priority)

1. {most important fix} — `file` — effort: {5 min / 30 min / 2h+}
2. ...

## Per Package

| Package | Breaks | Cleanup | Nice to have |
|---------|--------|---------|--------------|
| ...     | N      | N       | N            |
```

## Writing Style

- **Short.** One sentence per finding. No filler.
- **Concrete.** "Delete `compareSeverity` from severity.ts — 0 imports in the repo" not "Consider evaluating the necessity of the compareSeverity export."
- **Actionable.** Every finding has a "Fix:" that tells the user exactly what to do.
- **Plain language.** Write like you're talking to someone who builds the product, not reviewing a CS paper. Avoid jargon when a simple word works.
- **Evidence.** File path for every finding. The user should be able to verify in 10 seconds.
- **Honest.** If something looks intentional (API surface for future use, etc.), say so instead of flagging it.
