#!/bin/bash
set -euo pipefail

# Maps changed files to the minimal test command.
# Usage: git diff --name-only | .claude/scripts/smart-test.sh
# Requires CLAUDE_PROJECT_DIR to be set (automatic in Claude hooks).
# Output: a test command string (or "pnpm test" as fallback)

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || { echo "pnpm test"; exit 0; }

CHANGED=$(cat)
TESTS=""

add_test() {
  local test_path="$1"
  # Avoid duplicates
  if [[ "$TESTS" != *"$test_path"* ]]; then
    TESTS="$TESTS $test_path"
  fi
}

# Map persistence (save/reopen/publish/duplicate/by-slug)
if echo "$CHANGED" | grep -qE "map-persistence|app/api/maps"; then
  add_test "lib/ai/__tests__/map-persistence.test.ts"
fi

# Data cache (L1/L2 TTL, refresh)
if echo "$CHANGED" | grep -qE "data-cache|data-search"; then
  add_test "lib/ai/__tests__/data-cache.test.ts"
fi

# Deterministic path + artifact fallback
if echo "$CHANGED" | grep -qE "generate-map|dataset-storage|deterministic"; then
  add_test "lib/ai/__tests__/generate-map-deterministic-fallback.test.ts"
  add_test "lib/ai/__tests__/fas3-determinism.test.ts"
fi

# Manifest compiler — lives in packages/map-core, not apps/web
if echo "$CHANGED" | grep -qE "manifest-compiler"; then
  echo "pnpm test"
  exit 0
fi

# Quality scorer
if echo "$CHANGED" | grep -qE "quality-scorer"; then
  add_test "lib/ai/__tests__/quality-scorer.test.ts"
fi

# Validators
if echo "$CHANGED" | grep -qE "validators/"; then
  add_test "lib/ai/__tests__/validators.test.ts"
fi

# Geography plugins
if echo "$CHANGED" | grep -qE "geography-plugins|geometry-registry|join-planner"; then
  add_test "lib/ai/__tests__/geography-plugins.test.ts"
fi

# PxWeb client
if echo "$CHANGED" | grep -qE "pxweb-client|pxweb-resolution"; then
  add_test "lib/ai/__tests__/pxweb-client.test.ts"
fi

# System prompt + example bank → eval-related tests
if echo "$CHANGED" | grep -qE "system-prompt|example-bank"; then
  add_test "lib/ai/__tests__/quality-scorer.test.ts"
fi

# Profiler
if echo "$CHANGED" | grep -qE "profiler\.ts"; then
  add_test "lib/ai/__tests__/profiler.test.ts"
fi

# AI API routes
if echo "$CHANGED" | grep -qE "app/api/ai/"; then
  add_test "lib/ai/__tests__/generate-map-deterministic-fallback.test.ts"
fi

# Data models — lives in packages/data-models, not apps/web
if echo "$CHANGED" | grep -qE "packages/data-models/"; then
  echo "pnpm test"
  exit 0
fi

if [ -z "$TESTS" ]; then
  echo "pnpm test"
else
  echo "cd apps/web && npx vitest run$TESTS"
fi
