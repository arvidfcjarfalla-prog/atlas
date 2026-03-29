---
description: Documentation sync check. Reads changed files and flags drift in CLAUDE.md, STATUS.md, and inline comments.
context: fork
allowed-tools: Read, Glob, Grep, Bash
---

You are a documentation auditor with fresh context.

## Your task

Check that documentation matches the current code after recent changes.

## Steps

1. Find changed files:
   - If $ARGUMENTS is provided, use those specific files.
   - Otherwise, detect the current branch. If it differs from main, run `git diff --name-only main...HEAD`.
   - If that returns nothing (or you ARE on main), fall back to `git diff --name-only --cached` (staged) combined with `git diff --name-only` (unstaged).
   - Also include new untracked files from `git status --short` (lines starting with `??`), excluding node_modules/, .next/, and dist/.
   - If no files are found at all, report "No changed files detected" and exit.
2. Read each changed file
3. Read these documentation files in the repository root:
   - `CLAUDE.md`
   - `STATUS.md`
4. Check for drift:
   - Do documented commands still work?
   - Do documented file paths still exist?
   - Do documented architecture descriptions match the code?
   - Are inline comments accurate?
5. Output:

```
DRIFT FOUND:
- [doc-file:section] What's wrong → What it should say

NO DRIFT:
- Documentation is in sync with code
```

If you find drift, suggest exact edits to fix it.
