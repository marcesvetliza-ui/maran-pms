#!/usr/bin/env bash
# Isolated PostgreSQL over a Unix socket. NEVER consumes the caller's DATABASE_URL or fiscal secrets.
set -euo pipefail
cd "$(dirname "$0")/.."
BASE=/tmp/maran-nightly-folio-demo
SOCKET="$BASE/socket"
PORT_DB=55478
export DATABASE_URL='postgresql://runner@/maran_nightly_folio_demo?host=%2Ftmp%2Fmaran-nightly-folio-demo%2Fsocket&port=55478'
if [[ "${1:-}" == "--prepare" ]]; then
  mkdir -p "$SOCKET"
  if [[ ! -f "$BASE/data/PG_VERSION" ]]; then initdb -D "$BASE/data" -A trust -U runner --no-locale -E UTF8 > "$BASE/init.log"; fi
  if ! pg_ctl -D "$BASE/data" status >/dev/null 2>&1; then
    pg_ctl -D "$BASE/data" -l "$BASE/postgres.log" -o "-k $SOCKET -p $PORT_DB -h ''" start
  fi
  if [[ "$(psql -h "$SOCKET" -p "$PORT_DB" -U runner -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname='maran_nightly_folio_demo'")" == 0 ]]; then
    createdb -h "$SOCKET" -p "$PORT_DB" -U runner maran_nightly_folio_demo
  fi
  # Existing schema uses this explicitly created sequence in a text default.
  psql -h "$SOCKET" -p "$PORT_DB" -U runner -d maran_nightly_folio_demo -v ON_ERROR_STOP=1 \
    -c 'CREATE SEQUENCE IF NOT EXISTS group_payments_receipt_number_seq'
  HAS_RESERVATIONS=$(psql -h "$SOCKET" -p "$PORT_DB" -U runner -d maran_nightly_folio_demo -Atc "SELECT to_regclass('reservations') IS NOT NULL")
  if [[ "$HAS_RESERVATIONS" != t ]]; then
    env -i PATH="$PATH" HOME="$HOME" XDG_CONFIG_HOME="$BASE/config" DATABASE_URL="$DATABASE_URL" npx --no-install drizzle-kit push --force
  fi
  HAS_RESERVATIONS=$(psql -h "$SOCKET" -p "$PORT_DB" -U runner -d maran_nightly_folio_demo -Atc "SELECT to_regclass('reservations') IS NOT NULL")
  test "$HAS_RESERVATIONS" = t
  # Existing readiness gate expects this manually maintained unique index.
  psql -h "$SOCKET" -p "$PORT_DB" -U runner -d maran_nightly_folio_demo -v ON_ERROR_STOP=1 \
    -c 'CREATE UNIQUE INDEX IF NOT EXISTS purchase_invoice_lines_invoice_position_unique ON purchase_invoice_lines(invoice_id,line_number)'
  env -i PATH="$PATH" HOME="$HOME" XDG_CONFIG_HOME="$BASE/config" DATABASE_URL="$DATABASE_URL" npx --no-install tsx scripts/seed-nightly-folio-demo.ts
elif [[ "${1:-}" == "--test" ]]; then
  # Run BEFORE --serve: the app must not hold connections to the template DB.
  bash "$0" --prepare
  env -i PATH="$PATH" HOME="$HOME" XDG_CONFIG_HOME="$BASE/config" DATABASE_URL="$DATABASE_URL" \
    npx --no-install vitest run --config vitest.server.pg.config.ts server/tests/nightly-pricing.pg.test.ts
elif [[ "${1:-}" == "--serve" ]]; then
  # Complete app, real authentication and handlers, only synthetic DB/config.
  if ! pg_ctl -D "$BASE/data" status >/dev/null 2>&1; then
    pg_ctl -D "$BASE/data" -l "$BASE/postgres.log" -o "-k $SOCKET -p $PORT_DB -h ''" start
  fi
  test -f dist/index.cjs || { echo "Run npm run build before --serve" >&2; exit 2; }
  env -i PATH="$PATH" HOME="$HOME" XDG_CONFIG_HOME="$BASE/config" \
    npx --no-install tsx script/build.ts --nightly-demo-server
  env -i PATH="$PATH" HOME="$HOME" XDG_CONFIG_HOME="$BASE/config" USER=runner NODE_ENV=development \
    DATABASE_URL="$DATABASE_URL" SESSION_SECRET=synthetic-nightly-demo-session-not-for-production \
    NIGHTLY_DEMO_STATIC=1 PORT=8008 node dist/nightly-demo/index.cjs
else
  echo 'Usage: bash scripts/nightly-folio-demo.sh --prepare | --test | --serve' >&2; exit 2
fi
