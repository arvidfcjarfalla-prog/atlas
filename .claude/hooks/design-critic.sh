#!/usr/bin/env bash
set -euo pipefail

# anti-ai-ui Stop-hook gate.
# 1. Reads hook-input JSON from stdin.
# 2. Checks stop_hook_active recursion guard — if true, exit 0 immediately.
# 3. Runs the composite-vibe-check against the current diff.
# 4. Exit 0 if clean, exit 2 + stderr if any file fails the vibe-check.

INPUT="$(cat || true)"

if [ -n "$INPUT" ] && command -v jq >/dev/null 2>&1; then
  if [ "$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)" = "true" ]; then
    exit 0
  fi
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
VIBE_CHECK="$PROJECT_DIR/.claude/skills/anti-ai-ui/scripts/composite-vibe-check.sh"

if [ ! -x "$VIBE_CHECK" ]; then
  # Script missing → don't block on infrastructure error.
  exit 0
fi

if ! CLAUDE_SKILL_DIR="$PROJECT_DIR/.claude/skills/anti-ai-ui" "$VIBE_CHECK"; then
  echo "design-critic: anti-ai-ui vibe-check blocked. Fix the listed files before declaring done." >&2
  exit 2
fi

exit 0
