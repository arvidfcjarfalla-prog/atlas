#!/bin/bash
set -euo pipefail

# Auto-write a mini-handover if significant work happened without /handoff.
# Safety net — not a replacement for /handoff (which writes rich prose).

command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)

# Prevent infinite loop when stop_hook_active
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

# Count changed files (staged + unstaged + untracked)
CHANGED_COUNT=0
STAGED=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')
UNSTAGED=$(git diff --name-only 2>/dev/null | wc -l | tr -d ' ')
UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d ' ')
CHANGED_COUNT=$((STAGED + UNSTAGED + UNTRACKED))

# Skip if fewer than 4 changed files
[ "$CHANGED_COUNT" -lt 4 ] && exit 0

# Skip if a handover was written recently (within last 30 minutes)
HANDOVER_DIR="$CLAUDE_PROJECT_DIR/.claude/handovers"
mkdir -p "$HANDOVER_DIR"

LATEST_HANDOVER=$(ls -t "$HANDOVER_DIR/"*.md 2>/dev/null | head -1 || true)
if [ -n "$LATEST_HANDOVER" ] && [ -f "$LATEST_HANDOVER" ]; then
  # Check if handover is less than 30 minutes old
  if [ "$(uname)" = "Darwin" ]; then
    HANDOVER_AGE=$(( $(date +%s) - $(stat -f %m "$LATEST_HANDOVER") ))
  else
    HANDOVER_AGE=$(( $(date +%s) - $(stat -c %Y "$LATEST_HANDOVER") ))
  fi
  [ "$HANDOVER_AGE" -lt 1800 ] && exit 0
fi

# Write a mini-handover (not full prose — just safety net)
TIMESTAMP=$(date +%Y-%m-%d_%H%M)
OUTFILE="$HANDOVER_DIR/${TIMESTAMP}_auto.md"

BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
CHANGED_FILES=$(git diff --name-only 2>/dev/null | head -10)
STAGED_FILES=$(git diff --cached --name-only 2>/dev/null | head -5)
UNTRACKED_FILES=$(git ls-files --others --exclude-standard 2>/dev/null | head -5)

{
  echo "---"
  echo "date: $(date '+%Y-%m-%d %H:%M')"
  echo "goal: auto-captured (no /handoff run)"
  echo "status: partial"
  echo "branch: $BRANCH"
  echo "files_changed: $CHANGED_COUNT"
  echo "---"
  echo ""
  echo "# Auto-handover — $TIMESTAMP"
  echo ""
  echo "## Files"
  echo '```'
  if [ -n "$STAGED_FILES" ]; then
    echo "Staged:"
    echo "$STAGED_FILES"
  fi
  if [ -n "$CHANGED_FILES" ]; then
    echo "Unstaged:"
    echo "$CHANGED_FILES"
  fi
  if [ -n "$UNTRACKED_FILES" ]; then
    echo "Untracked:"
    echo "$UNTRACKED_FILES"
  fi
  echo '```'
  echo ""
  echo "## Recent commits"
  echo '```'
  git log --oneline -3 2>/dev/null || echo "(none)"
  echo '```'
} > "$OUTFILE" 2>/dev/null || true

exit 0
