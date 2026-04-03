#!/bin/bash
set -euo pipefail

# When Claude reads a file in docs/, check for last-reviewed date.
# Warn if the doc is old or has no date at all.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only check docs/ files
case "$FILE_PATH" in
  */docs/*.md|*/docs/**/*.md) ;;
  *) exit 0 ;;
esac

# Look for last-reviewed in first 10 lines
if [ -f "$FILE_PATH" ]; then
  REVIEWED=$(head -10 "$FILE_PATH" | sed -n 's/.*last-reviewed:[[:space:]]*\([0-9-]*\).*/\1/p' | head -1)

  if [ -z "$REVIEWED" ]; then
    echo "NOTE: This doc has no last-reviewed date. It may be stale — verify claims against code before using for decisions."
  else
    # Check if older than 60 days
    REVIEWED_TS=$(date -j -f "%Y-%m-%d" "$REVIEWED" "+%s" 2>/dev/null || date -d "$REVIEWED" "+%s" 2>/dev/null || echo "0")
    NOW_TS=$(date "+%s")
    DAYS_OLD=$(( (NOW_TS - REVIEWED_TS) / 86400 ))

    if [ "$DAYS_OLD" -gt 60 ]; then
      echo "WARNING: This doc was last reviewed $DAYS_OLD days ago ($REVIEWED). Verify claims against current code."
    fi
  fi
fi

exit 0
