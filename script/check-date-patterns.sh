#!/usr/bin/env bash
# Thin wrapper — delegates to the Node.js checker for multiline-aware matching.
set -euo pipefail
node script/check-date-patterns.js "$@"
