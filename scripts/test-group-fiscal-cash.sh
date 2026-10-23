#!/usr/bin/env bash
# No operational DATABASE_URL or provider credentials enter this process.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${GROUP_FISCAL_CASH_ISOLATED:-}" != 1 ]]; then
  exec env -i PATH="$PATH" HOME="$HOME" GROUP_FISCAL_CASH_ISOLATED=1 bash "$0"
fi
BASE=$(mktemp -d /tmp/maran-group-fiscal-cash.XXXXXX)
cleanup() {
  pg_ctl -D "$BASE/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$BASE"
}
trap cleanup EXIT
mkdir -p "$BASE/socket"
initdb -D "$BASE/data" -A trust -U runner --no-locale -E UTF8 > "$BASE/init.log"
pg_ctl -D "$BASE/data" -l "$BASE/postgres.log" \
  -o "-k $BASE/socket -p 55482 -h 127.0.0.1" start
createdb -h 127.0.0.1 -p 55482 -U runner group_fiscal_cash_disposable_test
export DATABASE_URL="postgresql://runner@127.0.0.1:55482/group_fiscal_cash_disposable_test"
export ALLOW_DESTRUCTIVE_PG_TESTS=true
export XDG_CONFIG_HOME="$BASE/config"
# Export is non-interactive. This fixture needs the declarative schema, not
# operational startup seeds or unrelated incremental-migration readiness gates.
npx --no-install drizzle-kit export --schema ./shared/schema.ts --dialect postgresql \
  > "$BASE/schema.sql"
# Legacy group-payment DEFAULT references this non-declarative sequence.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
  'CREATE SEQUENCE group_payments_receipt_number_seq'
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$BASE/schema.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
  "INSERT INTO role_permissions(role, resource_key) VALUES ('admin', 'api:billing:nc-reconciliation')"
npx --no-install vitest run --config vitest.server.pg.config.ts \
  server/tests/group-credit-recovery.pg.test.ts
