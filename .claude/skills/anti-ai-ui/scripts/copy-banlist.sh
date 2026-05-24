#!/usr/bin/env bash
set -euo pipefail

# Copy banlist check. Greps regex patterns from tells.json against markdown,
# mdx, and tsx files (where marketing copy tends to live).

SKILL_DIR="${CLAUDE_SKILL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
TELLS="$SKILL_DIR/tells.json"

if [ ! -f "$TELLS" ]; then
  echo "copy-banlist: tells.json not found at $TELLS" >&2
  exit 1
fi

PATTERNS="$(jq -r '.copy_banlist | join("|")' "$TELLS")"

FILES=()
if [ "$#" -gt 0 ]; then
  for f in "$@"; do
    [ -f "$f" ] && FILES+=("$f")
  done
else
  if git rev-parse --git-dir >/dev/null 2>&1; then
    while IFS= read -r line; do
      [ -n "$line" ] && [ -f "$line" ] && FILES+=("$line")
    done < <(git diff --name-only HEAD 2>/dev/null || true)
  fi
fi

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "OK"
  exit 0
fi

FOUND=0
for f in "${FILES[@]}"; do
  case "$f" in
    *node_modules*|*.claude/skills/anti-ai-ui/examples/negative/*|*.claude/skills/anti-ai-ui/references/anti-ai-fingerprint.md|*.claude/skills/anti-ai-ui/tells.json) continue ;;
  esac
  case "$f" in
    *.tsx|*.jsx|*.mdx|*.md|*.html) ;;
    *) continue ;;
  esac
  if grep -EiHn "$PATTERNS" "$f" 2>/dev/null; then FOUND=1; fi
done

if [ "$FOUND" -eq 1 ]; then
  echo "BLOCK: copy banlist hits — see above" >&2
  exit 2
fi
echo "OK"
exit 0
