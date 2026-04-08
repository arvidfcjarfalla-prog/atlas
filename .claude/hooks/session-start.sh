#!/bin/bash
set -euo pipefail

command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
SOURCE=$(echo "$INPUT" | jq -r '.source // "startup"')

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

# Prune handovers older than 7 days
find "$CLAUDE_PROJECT_DIR/.claude/handovers" -name "*.md" -mtime +7 -delete 2>/dev/null || true

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

# --- FULL learned rules (not just tail -5) ---
RULES_FILE="$CLAUDE_PROJECT_DIR/.claude/learned-rules.md"
if [ -f "$RULES_FILE" ]; then
  RULE_COUNT=$(wc -l < "$RULES_FILE" | tr -d ' ')
  RULES_CONTENT=$(cat "$RULES_FILE")
  CTX+="Learned rules ($RULE_COUNT lines):"$'\n'"$RULES_CONTENT"$'\n\n'

  # Staleness check: count uncompiled rules per category tag
  UNCOMPILED=$(grep -c '^\[' "$RULES_FILE" 2>/dev/null || echo "0")
  COMPILED=$(grep -c 'COMPILED' "$RULES_FILE" 2>/dev/null || echo "0")
  ACTIVE=$((UNCOMPILED - COMPILED))
  if [ "$ACTIVE" -gt 10 ]; then
    # Find categories with >3 uncompiled rules
    HEAVY_TAGS=$(grep '^\[' "$RULES_FILE" | grep -v 'COMPILED' | sed 's/^\[\([A-Z_-]*\)\].*/\1/' | sort | uniq -c | sort -rn | awk '$1 > 3 {print $2 " (" $1 ")"}')
    if [ -n "$HEAVY_TAGS" ]; then
      CTX+="NOTE: $ACTIVE uncompiled learned rules. Categories with >3 rules:"$'\n'"$HEAVY_TAGS"$'\n'"Consider consolidating into .claude/rules/ files."$'\n\n'
    fi
  fi
fi

# --- Latest handover (full content) ---
LATEST_HANDOVER=$(ls -t "$CLAUDE_PROJECT_DIR/.claude/handovers/"*.md 2>/dev/null | head -1 || true)
if [ -n "$LATEST_HANDOVER" ] && [ -f "$LATEST_HANDOVER" ]; then
  HANDOVER_NAME=$(basename "$LATEST_HANDOVER")
  HANDOVER_CONTENT=$(cat "$LATEST_HANDOVER")
  CTX+="Latest handover ($HANDOVER_NAME):"$'\n'"$HANDOVER_CONTENT"$'\n\n'
fi

# --- Key files reference (full content) ---
KEY_FILES="$CLAUDE_PROJECT_DIR/.claude/docs/key-files-reference.md"
if [ -f "$KEY_FILES" ]; then
  CTX+="$(cat "$KEY_FILES")"$'\n\n'
fi

# --- AI tools reference (full content) ---
AI_TOOLS="$CLAUDE_PROJECT_DIR/.claude/docs/ai-tools-reference.md"
if [ -f "$AI_TOOLS" ]; then
  CTX+="$(cat "$AI_TOOLS")"$'\n\n'
fi

# --- STATUS.md pointer ---
STATUS_FILE="$CLAUDE_PROJECT_DIR/STATUS.md"
if [ -f "$STATUS_FILE" ]; then
  CTX+="Read STATUS.md for project roadmap and current state ($(wc -l < "$STATUS_FILE" | tr -d ' ') lines)."$'\n'
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
