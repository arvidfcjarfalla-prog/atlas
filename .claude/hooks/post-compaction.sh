#!/bin/bash
set -euo pipefail

# After context compaction, re-inject critical facts that must survive.
# Without this, Claude loses track of project state mid-session.

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

CTX="POST-COMPACTION REMINDER:"$'\n'
CTX+="- Project: Atlas (AI map platform). Monorepo: packages/data-models, map-core, map-modules, ui + apps/web."$'\n'
CTX+="- Verify: pnpm typecheck && pnpm test"$'\n'
CTX+="- Respond in Swedish. Code/docs in English."$'\n'
CTX+="- Read learned-rules.md at .claude/learned-rules.md if you haven't this session."$'\n'

# Current branch
BRANCH=$(git branch --show-current 2>/dev/null || true)
if [ -n "$BRANCH" ]; then
  CTX+="- Branch: $BRANCH"$'\n'
fi

jq -n --arg ctx "$CTX" '{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": $ctx
  }
}'

exit 0
