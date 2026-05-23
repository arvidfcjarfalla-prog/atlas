#!/usr/bin/env bash
set -euo pipefail

# Color fingerprint check. Greps for banned hex codes, shadcn HSL defaults, and
# Tailwind class patterns across the diff or explicit files.

SKILL_DIR="${CLAUDE_SKILL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
TELLS="$SKILL_DIR/tells.json"

if [ ! -f "$TELLS" ]; then
  echo "color-fingerprint: tells.json not found at $TELLS" >&2
  exit 1
fi

# Build regex from tells.json.
HEX_REGEX="$(jq -r '.color_hex_ban | join("|")' "$TELLS")"
HSL_REGEX="$(jq -r '.shadcn_hsl_default_fingerprints | join("|") | gsub("[.]"; "\\\\.")' "$TELLS")"
CLASS_REGEX="$(jq -r '.tailwind_class_patterns | join("|")' "$TELLS")"

# Resolve files.
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
    *.claude/skills/anti-ai-ui/examples/negative/*) continue ;;
    *.claude/skills/anti-ai-ui/tells.json) continue ;;
    *.claude/skills/anti-ai-ui/references/anti-ai-fingerprint.md) continue ;;
  esac
  case "$f" in
    *.tsx|*.jsx|*.vue|*.css|*.mdx|*.html|*.ts|*.js) ;;
    *) continue ;;
  esac
  if grep -EHn "$HEX_REGEX|$CLASS_REGEX" "$f" 2>/dev/null; then FOUND=1; fi
  if [ -n "$HSL_REGEX" ] && grep -EHn "$HSL_REGEX" "$f" 2>/dev/null; then FOUND=1; fi
done

if [ "$FOUND" -eq 1 ]; then
  echo "BLOCK: color fingerprint hits — see above" >&2
  exit 2
fi
echo "OK"
exit 0
