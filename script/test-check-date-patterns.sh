#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# test-check-date-patterns.sh
#
# Fixture-based tests for check-date-patterns.js.
# Creates temporary .tsx files under client/src, runs the checker, then
# removes them.  Exits 1 if any test fails.
# ---------------------------------------------------------------------------

set -euo pipefail

PASS=0
FAIL=0
TMPPREFIX="client/src/_date_check_fixture_$$"

cleanup() {
  rm -f "${TMPPREFIX}"_*.tsx
}
trap cleanup EXIT

# run_test <description> <file-content> <expected-exit-code>
run_test() {
  local name="$1"
  local content="$2"
  local expect="$3"
  local tmpfile="${TMPPREFIX}_${PASS}_${FAIL}.tsx"

  printf '%s\n' "$content" > "$tmpfile"

  local actual=0
  node script/check-date-patterns.js > /dev/null 2>&1 || actual=$?

  rm -f "$tmpfile"

  if [[ "$actual" == "$expect" ]]; then
    printf '  PASS  %s\n' "$name"
    PASS=$((PASS + 1))
  else
    printf '  FAIL  %s  (expected exit %s, got %s)\n' "$name" "$expect" "$actual"
    FAIL=$((FAIL + 1))
  fi
}

echo "Running date-pattern checker fixture tests…"
echo ""

# ── Should PASS (exit 0) — clean code ───────────────────────────────────────
run_test "clean file — no pattern"                   'const x = 1;'                                                                        0
run_test "import from canonical — not a definition"  'import { getArgentinaToday } from "@/lib/date-utils";'                              0
run_test "call canonical — not a local definition"   'const today = getArgentinaToday();'                                                   0
run_test "comment DQ — should be ignored"            '// const d = new Date().toISOString().split("T")[0];'                               0
run_test "comment SQ — should be ignored"            "// const d = new Date().toISOString().split('T')[0];"                               0
run_test "inline comment after code — should be ignored"  'const x = 1; // toISOString().split("T")[0]'                                  0
run_test "JSDoc continuation * — should be ignored"  $'/**\n * Use toISOString().split("T")[0] — do not do this\n */'                    0
run_test "JSDoc opening /** — should be ignored"     '/** toISOString().split("T")[0] */'                                                  0
run_test "block comment body — should be ignored"    $'/* toISOString().split("T")[0] */'                                                  0
run_test "unrelated split call"                      'const p = str.split("T");'                                                           0
run_test "toLocaleDateString correct usage"          'return new Date().toLocaleDateString("en-CA",{timeZone:"America/Argentina/Buenos_Aires"});' 0

# ── Should FAIL (exit 1) — violations ───────────────────────────────────────
run_test "double-quote inline"                       'const today = new Date().toISOString().split("T")[0];'                              1
run_test "single-quote inline"                       "const today = new Date().toISOString().split('T')[0];"                              1
run_test "whitespace in split arg"                   'const d = new Date().toISOString().split( "T" )[0];'                                1
run_test "whitespace in bracket"                     'const d = new Date().toISOString().split("T")[ 0 ];'                                1
run_test "multiline method chain"                    $'const today = new Date()\n  .toISOString()\n  .split("T")[0];'                     1
run_test "local function declaration"                'function getArgentinaToday() { return ""; }'                                         1
run_test "local const arrow"                         'const getArgentinaToday = () => "";'                                                 1
run_test "local let arrow"                           'let getArgentinaToday = () => "";'                                                   1
run_test "local var assignment"                      'var getArgentinaToday = function() { return ""; };'                                  1
run_test "typed const declaration (TS annotation)"   'const getArgentinaToday: () => string = () => "";'                                  1
run_test "export function declaration"               'export function getArgentinaToday(): string { return ""; }'                         1
run_test "export const arrow"                        'export const getArgentinaToday = () => "";'                                          1
run_test "export default function"                   'export default function getArgentinaToday() { return ""; }'                          1
run_test "async function declaration"                'async function getArgentinaToday() { return ""; }'                                   1
run_test "export async function"                     'export async function getArgentinaToday(): Promise<string> { return ""; }'           1
run_test "export default async function"             'export default async function getArgentinaToday() { return ""; }'                    1

echo ""
printf 'Results: %d passed, %d failed\n' "$PASS" "$FAIL"
echo ""

if [[ $FAIL -eq 0 ]]; then
  echo "✓ All fixture tests passed."
  exit 0
else
  echo "✗ ${FAIL} fixture test(s) failed."
  exit 1
fi
