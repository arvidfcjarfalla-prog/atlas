#!/usr/bin/env bash
set -euo pipefail

# Pre-commit anti-ai-ui vibe-check. Runs the composite check against staged
# files. Exit 2 + stderr if any file trips the threshold.

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
VIBE_CHECK="$PROJECT_DIR/.claude/skills/anti-ai-ui/scripts/composite-vibe-check.sh"
[ ! -x "$VIBE_CHECK" ] && exit 0

STAGED_FILES=()
while IFS= read -r f; do
  [ -n "$f" ] && [ -f "$f" ] && STAGED_FILES+=("$f")
done < <(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(tsx|jsx|vue|css|mdx|html)$' || true)

[ "${#STAGED_FILES[@]}" -eq 0 ] && exit 0

if ! CLAUDE_SKILL_DIR="$PROJECT_DIR/.claude/skills/anti-ai-ui" "$VIBE_CHECK" "${STAGED_FILES[@]}"; then
  echo "pre-commit-vibe-check: anti-ai-ui vibe-check failed. See messages above." >&2
  exit 2
fi
exit 0
