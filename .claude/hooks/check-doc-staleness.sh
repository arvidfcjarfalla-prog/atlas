#!/bin/bash
set -euo pipefail

# When Claude reads a file in docs/, check for last-reviewed date.
# Warn if the doc is old or has no date at all.

command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only check docs/ and experience/ files
case "$FILE_PATH" in
  */docs/*.md|*/docs/**/*.md) ;;
  */experience/*.md|*/experience/**/*.md) ;;
  *) exit 0 ;;
esac

# Look for last-reviewed in first 10 lines
if [ -f "$FILE_PATH" ]; then
  REVIEWED=$(head -10 "$FILE_PATH" | grep -o 'last-[a-z]*: *[0-9-]*' | head -1 | sed 's/.*: *//')

  if [ -z "$REVIEWED" ]; then
    echo "NOTE: This doc has no last-reviewed date. It may be stale — verify claims against code before using for decisions."
  else
    # Experience docs expire faster (14 days) than reference docs (60 days)
    case "$FILE_PATH" in
      */experience/*) MAX_AGE=14 ;;
      *) MAX_AGE=60 ;;
    esac

    REVIEWED_TS=$(date -j -f "%Y-%m-%d" "$REVIEWED" "+%s" 2>/dev/null || date -d "$REVIEWED" "+%s" 2>/dev/null || echo "0")
    NOW_TS=$(date "+%s")
    DAYS_OLD=$(( (NOW_TS - REVIEWED_TS) / 86400 ))

    if [ "$DAYS_OLD" -gt "$MAX_AGE" ]; then
      echo "WARNING: This doc was last verified $DAYS_OLD days ago ($REVIEWED, max $MAX_AGE days). Verify claims against current code."
    fi
  fi
fi

exit 0
