#!/bin/bash
set -euo pipefail

command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)

# Prevent infinite loop when stop_hook_active
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

# Skip if not a git repo
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# NOTE: main-guard intentionally removed — solo dev workflow, commits are local-only.
# Checkpoint commits provide crash recovery. Squash before push.

# Skip if no changes
git diff-index --quiet HEAD 2>/dev/null && [ -z "$(git ls-files --others --exclude-standard 2>/dev/null)" ] && exit 0

# Stage all changes
git add -A 2>/dev/null || exit 0

# Unstage sensitive files — safety net regardless of .gitignore
git reset HEAD -- '**/.env*' '.env*' 'CLAUDE.local.md' '.claude/settings.local.json' 2>/dev/null || true

# Build commit message from changed files
CHANGED=$(git diff --cached --name-only 2>/dev/null | head -5 | tr '\n' ', ' | sed 's/,$//')
TOTAL=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')

MSG="checkpoint: $CHANGED"
if [ "$TOTAL" -gt 5 ]; then
  MSG="checkpoint: $CHANGED (+$((TOTAL - 5)) more)"
fi

git commit -m "$MSG" 2>/dev/null || true

exit 0
