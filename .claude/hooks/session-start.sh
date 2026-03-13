#!/bin/bash
set -euo pipefail

INPUT=$(cat)
SOURCE=$(echo "$INPUT" | jq -r '.source // "startup"')

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

CTX=""

# Recent commits — what was worked on last
COMMITS=$(git log --oneline -5 2>/dev/null || true)
if [ -n "$COMMITS" ]; then
  CTX+="Recent commits:"$'\n'"$COMMITS"$'\n\n'
fi

# Current branch and dirty state
BRANCH=$(git branch --show-current 2>/dev/null || true)
DIRTY=$(git diff --stat --cached 2>/dev/null || true)
UNSTAGED=$(git diff --stat 2>/dev/null || true)
if [ -n "$BRANCH" ]; then
  CTX+="Branch: $BRANCH"$'\n'
fi
if [ -n "$DIRTY" ]; then
  CTX+="Staged changes:"$'\n'"$DIRTY"$'\n'
fi
if [ -n "$UNSTAGED" ]; then
  CTX+="Unstaged changes:"$'\n'"$UNSTAGED"$'\n'
fi

# Test status snapshot — only on fresh startup to keep resume fast
if [ "$SOURCE" = "startup" ]; then
  TEST_RESULT=$(cd "$CLAUDE_PROJECT_DIR" && pnpm test 2>&1 | tail -1 || true)
  if echo "$TEST_RESULT" | grep -q "Failed"; then
    CTX+=$'\n'"Tests: FAILING — $TEST_RESULT"$'\n'
  fi
fi

if [ -n "$CTX" ]; then
  jq -n --arg ctx "$CTX" '{
    "hookSpecificOutput": {
      "hookEventName": "SessionStart",
      "additionalContext": $ctx
    }
  }'
fi

exit 0
