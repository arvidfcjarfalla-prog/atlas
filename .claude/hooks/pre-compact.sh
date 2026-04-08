#!/bin/bash
set -euo pipefail

# Save session context before context compaction destroys granular details.
# Output goes to .claude/handovers/ as a dated file.

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

HANDOVER_DIR="$CLAUDE_PROJECT_DIR/.claude/handovers"
mkdir -p "$HANDOVER_DIR"

TIMESTAMP=$(date +%Y-%m-%d_%H%M)
OUTFILE="$HANDOVER_DIR/$TIMESTAMP.md"

{
  BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
  echo "---"
  echo "date: $(date '+%Y-%m-%d %H:%M')"
  echo "goal: pre-compaction snapshot"
  echo "status: partial"
  echo "branch: $BRANCH"
  echo "---"
  echo ""
  echo "# Pre-compaction snapshot — $TIMESTAMP"
  echo ""

  echo "## Recent changes"
  echo '```'
  git log --oneline -5 --stat 2>/dev/null | tail -20 || echo "(no commits)"
  echo '```'
  echo ""

  echo "## Staged"
  echo '```'
  git diff --cached --stat 2>/dev/null || echo "(nothing staged)"
  echo '```'
  echo ""

  echo "## Unstaged"
  echo '```'
  git diff --stat 2>/dev/null || echo "(nothing unstaged)"
  echo '```'
} > "$OUTFILE" 2>/dev/null || true

exit 0
