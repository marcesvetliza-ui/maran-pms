#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(mktemp -d /tmp/booking-engine-isolated.XXXXXX)
cleanup() {
  pg_ctl -D "$ROOT/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$ROOT"
}
trap cleanup EXIT
mkdir "$ROOT/socket"
initdb -D "$ROOT/data" -U runner --no-locale --encoding=UTF8 --auth=trust >/dev/null
pg_ctl -D "$ROOT/data" -l "$ROOT/postgres.log" -o "-h '' -k $ROOT/socket -p 55461" -w start >/dev/null
createdb -U runner -h "$ROOT/socket" -p 55461 booking_engine_synthetic
# This URL addresses only our newly created Unix-socket test cluster. Never
# inherits or reads the workspace/production connection string.
export DATABASE_URL="postgresql://runner@localhost:55461/booking_engine_synthetic?host=$ROOT/socket"
export BOOKING_ENGINE_ISOLATED_TEST=1
export BOOKING_ENGINE_ISOLATED_SOCKET="$ROOT/socket"
env -u DATABASE_URL npx drizzle-kit export --dialect postgresql --schema ./shared/schema.ts > "$ROOT/schema.sql"
psql -U runner -h "$ROOT/socket" -p 55461 -d booking_engine_synthetic -v ON_ERROR_STOP=1 -q \
  -c "CREATE SEQUENCE group_payments_receipt_number_seq;" >/dev/null
psql -U runner -h "$ROOT/socket" -p 55461 -d booking_engine_synthetic -v ON_ERROR_STOP=1 -q -f "$ROOT/schema.sql" >/dev/null
npx vitest run --config vitest.booking-engine.config.ts
