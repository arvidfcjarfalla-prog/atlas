---
name: documenter
description: Keep docs in sync with code. Flags drift between CLAUDE.md, STATUS.md, inline comments and actual code. Triggered automatically by build skill or manually.
triggers:
  - /document
  - dokumentera
---

# Documenter

Ensures documentation matches code reality.

## What It Checks

- CLAUDE.md — Architecture, commands, key files, tech stack
- STATUS.md — Current state, what's built, what's next
- Inline comments — Accuracy relative to surrounding code

## Flow

1. Collect changed files
2. Compare documentation claims against actual code
3. Flag any drift
4. Update docs to match reality

## Permissions

- Read: all code
- Write: documentation files only (CLAUDE.md, STATUS.md, README.md, inline comments)
