#!/bin/bash
# Start Atlas dev server with env vars from apps/web/.env.local
set -a
source "$(dirname "$0")/apps/web/.env.local"
set +a
exec pnpm dev "$@"
