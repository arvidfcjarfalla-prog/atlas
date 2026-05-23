#!/usr/bin/env bash
set -euo pipefail

# Composite vibe-check. Reads patterns from tells.json (no hardcoded regexes).
# Counts per-file matches across the 10 composite items. If any file hits the
# threshold (default 3), prints the file + items to stderr and exits 2.
#
# Usage:
#   composite-vibe-check.sh                  # check git diff (vs HEAD)
#   composite-vibe-check.sh path/to/file.tsx # check one explicit file
#   composite-vibe-check.sh < /dev/null      # check empty input — exits 0

SKILL_DIR="${CLAUDE_SKILL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
TELLS="$SKILL_DIR/tells.json"

if [ ! -f "$TELLS" ]; then
  echo "composite-vibe-check: tells.json not found at $TELLS" >&2
  exit 1
fi

THRESHOLD="$(jq -r '.composite_vibe_check.threshold // 3' "$TELLS")"

# Resolve which files to check. Explicit args bypass the negative-examples skip.
FILES=()
EXPLICIT=0
if [ "$#" -gt 0 ]; then
  EXPLICIT=1
  for f in "$@"; do
    [ -f "$f" ] && FILES+=("$f")
  done
else
  if git rev-parse --git-dir >/dev/null 2>&1; then
    while IFS= read -r line; do
      [ -n "$line" ] && [ -f "$line" ] && FILES+=("$line")
    done < <(git diff --name-only HEAD 2>/dev/null || true)
    while IFS= read -r line; do
      [ -n "$line" ] && [ -f "$line" ] && FILES+=("$line")
    done < <(git diff --name-only --cached 2>/dev/null || true)
  fi
fi

# Filter to UI-relevant files only.
UI_FILES=()
for f in "${FILES[@]:-}"; do
  case "$f" in
    *.tsx|*.jsx|*.vue|*.css|*.mdx|*.html) UI_FILES+=("$f") ;;
  esac
done

if [ "${#UI_FILES[@]}" -eq 0 ]; then
  echo "OK"
  exit 0
fi

FAILED=0

for f in "${UI_FILES[@]}"; do
  # Skip our own counter-examples unless caller passed them explicitly.
  if [ "$EXPLICIT" -eq 0 ]; then
    case "$f" in
      *.claude/skills/anti-ai-ui/examples/negative/*) continue ;;
    esac
  fi

  hits=()

  # 1. Inter as sole font (no font-feature-settings nearby).
  if grep -Eq '"Inter"|font-family:[[:space:]]*Inter|font-sans.*Inter' "$f" 2>/dev/null; then
    if ! grep -q 'font-feature-settings' "$f" 2>/dev/null; then
      hits+=("inter_as_sole_font")
    fi
  fi

  # 2. Indigo/violet/purple gradient.
  if grep -Eq 'from-(indigo|violet|purple|fuchsia)-[0-9]+|to-(indigo|violet|purple|fuchsia|pink)-[0-9]+|via-(purple|violet|fuchsia)-[0-9]+|#(6366f1|4f46e5|8b5cf6|a855f7|ec4899|7c3aed|d946ef)' "$f" 2>/dev/null; then
    hits+=("any_indigo_violet_purple_gradient")
  fi

  # 3. Three-card feature row with Lucide 24 / stroke-1.5.
  if grep -Eq 'grid-cols-3' "$f" 2>/dev/null && \
     grep -Eq 'lucide-react' "$f" 2>/dev/null && \
     grep -Eq 'size=\{?24\}?|strokeWidth=\{?1\.5\}?' "$f" 2>/dev/null; then
    hits+=("three_card_feature_row_lucide_24_1_5")
  fi

  # 4. Hero pill badge + text-balance + gradient-text headline.
  if grep -Eq 'rounded-full.*(text-xs|px-3 py-1)' "$f" 2>/dev/null && \
     grep -Eq 'text-balance' "$f" 2>/dev/null && \
     grep -Eq 'bg-clip-text.*text-transparent|text-transparent.*bg-clip-text' "$f" 2>/dev/null; then
    hits+=("hero_pill_badge_plus_text_balance_plus_gradient_text_headline")
  fi

  # 5. shadcn Card/Button defaults unmodified (heuristic: imported but no className override).
  if grep -Eq 'from ["'\''"]@/components/ui/(card|button)["'\''"]' "$f" 2>/dev/null; then
    if ! grep -Eq 'className=' "$f" 2>/dev/null; then
      hits+=("shadcn_card_or_button_defaults_unmodified")
    fi
  fi

  # 6. Two or more banned verbs in copy.
  banned_count=$(grep -Eoi '\b(unlock|seamlessly|empower|supercharge|streamline|elevate|harness|leverage|revolutionize|powerful)\b' "$f" 2>/dev/null | wc -l | tr -d ' ')
  if [ "${banned_count:-0}" -ge 2 ]; then
    hits+=("copy_contains_two_or_more_banned_verbs")
  fi

  # 7. transition-all duration-300 or framer duration 0.5 without ease override.
  if grep -Eq 'transition-all[^"]*duration-300|duration-300[^"]*transition-all' "$f" 2>/dev/null; then
    hits+=("transition_all_duration_300_or_framer_duration_0_5_default")
  fi
  if grep -Eq 'duration:[[:space:]]*0\.5' "$f" 2>/dev/null && ! grep -Eq 'ease:' "$f" 2>/dev/null; then
    hits+=("transition_all_duration_300_or_framer_duration_0_5_default")
  fi

  # 8. Bento grid as section two — heuristic: grid-rows-* + grid-cols-* + named "bento".
  if grep -Eqi 'bento' "$f" 2>/dev/null; then
    hits+=("bento_grid_as_section_two")
  fi

  # 9. max-w-7xl mx-auto everywhere.
  mx_count=$(grep -Eo 'max-w-7xl' "$f" 2>/dev/null | wc -l | tr -d ' ')
  if [ "${mx_count:-0}" -ge 3 ]; then
    hits+=("max_w_7xl_mx_auto_on_every_section")
  fi

  # 10. Pure white or pure black — no warm off-whites.
  if grep -Eq '#fff(fff)?\b|#000(000)?\b|rgb\(255,[[:space:]]*255,[[:space:]]*255\)|rgb\(0,[[:space:]]*0,[[:space:]]*0\)' "$f" 2>/dev/null; then
    hits+=("pure_white_or_black_no_warm_off_whites")
  fi

  # Dedupe.
  unique_hits=()
  while IFS= read -r h; do unique_hits+=("$h"); done < <(printf '%s\n' "${hits[@]:-}" | sort -u | grep -v '^$' || true)

  count=${#unique_hits[@]}

  if [ "$count" -ge "$THRESHOLD" ]; then
    echo "BLOCK: $f hits $count vibe-check items (threshold $THRESHOLD):" >&2
    for h in "${unique_hits[@]}"; do
      echo "  - $h" >&2
    done
    FAILED=1
  fi
done

if [ "$FAILED" -eq 1 ]; then
  exit 2
fi

echo "OK"
exit 0
