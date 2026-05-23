#!/usr/bin/env bash
set -euo pipefail

# Workaround for Issue #23478: path-based rules trigger only on Read, not on
# Write/Edit. After every Write/Edit, this hook does `head -200` on the file
# as a side effect so the rules-trigger pathway picks it up.

INPUT="$(cat || true)"
if [ -z "$INPUT" ] || ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

FILE_PATH="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"
[ -z "$FILE_PATH" ] && exit 0
[ ! -f "$FILE_PATH" ] && exit 0

head -200 "$FILE_PATH" >/dev/null 2>&1 || true
exit 0
