#!/bin/bash
set -euo pipefail

npm install --no-audit --no-fund

# Use the application's idempotent migration path. Unlike drizzle-kit push,
# this command never opens destructive confirmation prompts.
npm run db:migrate:ci

npm run build
