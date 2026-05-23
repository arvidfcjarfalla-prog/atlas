#!/usr/bin/env bash
set -euo pipefail

# Em-dash density check. For each .md / .mdx file in the diff, count em-dashes
# and words. Flag any file with density > 1 per 100 words.

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
    *node_modules*|*.claude/skills/anti-ai-ui/examples/negative/*) continue ;;
  esac
  case "$f" in
    *.md|*.mdx) ;;
    *) continue ;;
  esac

  em=$(grep -o '—' "$f" 2>/dev/null | wc -l | tr -d ' ')
  words=$(wc -w < "$f" | tr -d ' ')
  [ "${words:-0}" -eq 0 ] && continue

  density=$(awk -v e="$em" -v w="$words" 'BEGIN { if (w == 0) print 0; else printf "%.3f", (e * 100) / w }')

  is_over=$(awk -v d="$density" 'BEGIN { print (d > 1.0) ? 1 : 0 }')
  if [ "$is_over" -eq 1 ]; then
    printf '%s: %s em-dashes / %s words = %s per 100 words\n' "$f" "$em" "$words" "$density" >&2
    FOUND=1
  fi
done

if [ "$FOUND" -eq 1 ]; then
  echo "BLOCK: em-dash density > 1 per 100 words" >&2
  exit 2
fi
echo "OK"
exit 0
