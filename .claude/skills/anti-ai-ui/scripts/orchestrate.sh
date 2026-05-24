#!/usr/bin/env bash
set -euo pipefail

# Deterministic 4-phase orchestration via Claude SDK headless.
# Use when you want hard guarantees that all phases run in order.
# Alternative: invoke /anti-ai-review which uses prompt-based orchestration.
#
# Usage:
#   orchestrate.sh "<feature description>"
#   orchestrate.sh "pricing page for SaaS X — 3 tiers, FAQ"
#
# Exit codes:
#   0  All phases passed, critique returned ok
#   1  Usage error or claude CLI not available
#   2  A phase failed or critique blocked after max loops

FEATURE="${1:-}"
MAX_CRITIQUE_LOOPS="${MAX_CRITIQUE_LOOPS:-3}"

if [ -z "$FEATURE" ]; then
  echo "usage: orchestrate.sh \"<feature description>\"" >&2
  echo "       MAX_CRITIQUE_LOOPS=<n> orchestrate.sh \"...\"  (default 3)" >&2
  exit 1
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "orchestrate.sh: claude CLI not on PATH." >&2
  echo "Fall back to prompt-based orchestration: /anti-ai-review $FEATURE" >&2
  exit 1
fi

phase() {
  printf '\n=== %s ===\n' "$1" >&2
}

phase "1/4 discover"
DISCOVER_OUT="$(claude --skill discover -p "$FEATURE")"
printf '%s\n' "$DISCOVER_OUT"

phase "2/4 ux-architecture"
UX_OUT="$(claude --skill ux-architecture -p "Based on this brief, write the spec to docs/ux/. Brief: $DISCOVER_OUT")"
printf '%s\n' "$UX_OUT"

UX_SPEC="$(find docs/ux -name '*.md' -newer .claude 2>/dev/null | head -1 || true)"
if [ -z "$UX_SPEC" ]; then
  echo "orchestrate.sh: no fresh spec in docs/ux/ after ux-architecture phase." >&2
  exit 2
fi
echo "spec: $UX_SPEC" >&2

phase "3/4 implement-page (loop until critique ok, max ${MAX_CRITIQUE_LOOPS})"

attempt=0
while [ "$attempt" -lt "$MAX_CRITIQUE_LOOPS" ]; do
  attempt=$((attempt + 1))
  printf '\n--- attempt %d/%d ---\n' "$attempt" "$MAX_CRITIQUE_LOOPS" >&2

  if [ "$attempt" -eq 1 ]; then
    IMPL_PROMPT="Implement per spec: $UX_SPEC"
  else
    IMPL_PROMPT="Re-implement per spec: $UX_SPEC. Previous critique blocked with: $CRITIQUE_REASON"
  fi
  claude --skill implement-page -p "$IMPL_PROMPT"

  DIFF_STAT="$(git diff --stat HEAD 2>/dev/null || true)"
  if [ -z "$DIFF_STAT" ]; then
    echo "orchestrate.sh: implement-page produced no diff." >&2
    exit 2
  fi

  phase "4/4 critique-ui (attempt $attempt)"
  CRITIQUE_RAW="$(claude --skill critique-ui -p "review the current diff")"
  printf '%s\n' "$CRITIQUE_RAW"

  if printf '%s' "$CRITIQUE_RAW" | jq -e '.ok == true' >/dev/null 2>&1; then
    echo "" >&2
    echo "orchestrate.sh: all phases passed. Diff is clean." >&2
    exit 0
  fi

  CRITIQUE_REASON="$(printf '%s' "$CRITIQUE_RAW" | jq -r '.reason // "(no reason given)"' 2>/dev/null || echo "(parse error)")"
  echo "orchestrate.sh: critique blocked — $CRITIQUE_REASON" >&2
done

echo "" >&2
echo "orchestrate.sh: hit max critique loops ($MAX_CRITIQUE_LOOPS). Last reason: $CRITIQUE_REASON" >&2
exit 2
