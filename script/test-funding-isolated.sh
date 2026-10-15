#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# No operational DATABASE_URL is read, exported, copied or passed to this suite.
base=/tmp/folio-funding-isolated
mkdir -p "$base/socket"
if [ ! -f "$base/data/PG_VERSION" ]; then
  initdb -D "$base/data" --auth-local=trust --auth-host=reject --no-locale >"$base/init.log"
fi
if ! pg_ctl -D "$base/data" status >/dev/null 2>&1; then
  pg_ctl -D "$base/data" -l "$base/pg.log" -o "-k $base/socket -p 55439 -c listen_addresses=''" start
fi
if ! psql -h "$base/socket" -p 55439 -U "$(id -un)" -d postgres -Atc \
  "SELECT datname FROM pg_database WHERE datname='folio_funding_synthetic'" | grep -qx folio_funding_synthetic; then
  createdb -h "$base/socket" -p 55439 -U "$(id -un)" folio_funding_synthetic
fi
# Ancestor node_modules is intentional for the existing dependencies only.
node --import tsx --test server/tests/payment-funding.isolated.pg.test.ts
