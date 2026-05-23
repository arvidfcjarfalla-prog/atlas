#!/usr/bin/env bash
set -euo pipefail

# Pre-commit format hook. Runs prettier + eslint on staged files if available.
# Non-blocking on missing tooling — only fails if a present tool fails.

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

STAGED="$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx|css|md|mdx|json)$' || true)"
[ -z "$STAGED" ] && exit 0

if command -v pnpm >/dev/null 2>&1 && [ -f "package.json" ]; then
  if pnpm list prettier >/dev/null 2>&1; then
    # shellcheck disable=SC2086
    echo "$STAGED" | xargs -r pnpm exec prettier --check || {
      echo "pre-commit-format: prettier check failed. Run: pnpm exec prettier --write <files>" >&2
      exit 1
    }
  fi
  if pnpm list eslint >/dev/null 2>&1; then
    # shellcheck disable=SC2086
    echo "$STAGED" | grep -E '\.(ts|tsx|js|jsx)$' | xargs -r pnpm exec eslint --max-warnings=0 || {
      echo "pre-commit-format: eslint failed" >&2
      exit 1
    }
  fi
fi

exit 0
