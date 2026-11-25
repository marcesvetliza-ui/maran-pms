#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# The existing OTA suites explicitly allow this local fixture address only.
# Start our own cluster first; if the port is occupied, startup fails before tests.
ROOT=$(mktemp -d /tmp/booking-engine-ota-isolated.XXXXXX)
cleanup() {
  pg_ctl -D "$ROOT/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$ROOT"
}
trap cleanup EXIT
mkdir "$ROOT/socket"
initdb -D "$ROOT/data" -U postgres --no-locale --encoding=UTF8 --auth=trust >/dev/null
pg_ctl -D "$ROOT/data" -l "$ROOT/postgres.log" -o "-h 127.0.0.1 -k $ROOT/socket -p 55448" -w start >/dev/null
createdb -U postgres -h "$ROOT/socket" -p 55448 channex_inbound_test
createdb -U postgres -h "$ROOT/socket" -p 55448 channex_test
export DATABASE_URL=postgresql://postgres@127.0.0.1:55448/channex_inbound_test
export CHANNEX_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55448/channex_test
env -u DATABASE_URL npx drizzle-kit export --dialect postgresql --schema ./shared/schema.ts > "$ROOT/schema.sql"
psql -U postgres -h "$ROOT/socket" -p 55448 -d channex_inbound_test -v ON_ERROR_STOP=1 -q \
  -c "CREATE SEQUENCE group_payments_receipt_number_seq;" >/dev/null
psql -U postgres -h "$ROOT/socket" -p 55448 -d channex_inbound_test -v ON_ERROR_STOP=1 -q -f "$ROOT/schema.sql" >/dev/null
# Legacy OTA fixtures omit these timestamps and expect the migration defaults.
# Supply them only in this disposable database, without running hotel seed data.
psql -U postgres -h "$ROOT/socket" -p 55448 -d channex_inbound_test -v ON_ERROR_STOP=1 -q \
  -c "ALTER TABLE channex_room_type_mappings ALTER COLUMN created_at SET DEFAULT now(); ALTER TABLE channex_rate_plan_mappings ALTER COLUMN created_at SET DEFAULT now();" >/dev/null
# Transports in these suites are synthetic callbacks, never real OTA requests.
npx vitest run --config vitest.server.pg.config.ts server/tests/channex-ari.pg.test.ts \
  server/tests/channex-inbound.pg.test.ts server/tests/channex-usd-conversion.pg.test.ts
