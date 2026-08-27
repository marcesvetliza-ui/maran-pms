---
name: npm test now globs all server tests (no more hand-maintained allowlist)
description: How server-side tests are wired into npm test / npm run test:postgres, and the mock-drift failure mode that surfaces once orphaned tests actually run.
---

`npm test` and `npm run test:postgres` used to invoke a hand-picked list of filenames instead of a glob, so a fully-correct new test file could sit in `server/tests/` and never execute as part of the standard test command. This is fixed: `vitest.server.config.ts` globs every `server/tests/**/*.test.ts` except `*.pg.test.ts`, and a new `vitest.server.pg.config.ts` globs every `server/tests/**/*.pg.test.ts`. Adding a new server test file no longer requires editing package.json — just follow the `*.test.ts` / `*.pg.test.ts` naming convention.

**Why:** discovered while adding a regression test for report-filter logic — the obvious place to add the test turned out to be invisible to the standard test run despite living in the conventional test directory. Fixing the allowlist then surfaced two more test files that had rotted silently (see below) because they'd also never run in the ordinary `npm test` flow.

**How to apply:** after adding any new server-side test file, confirm it matches `*.test.ts` (unit, no DB) or `*.pg.test.ts` (needs real Postgres, self-skips via `describe.skip` when `DATABASE_URL` is unset) — no further wiring is needed. `npm run test:postgres` still fails loudly if `DATABASE_URL` is missing rather than silently passing.

**Mock-drift failure mode to watch for:** two previously-orphaned tests (`group-folio-tag-strip.test.ts`, `master-folio-retention-badge.test.ts`) turned 500 once actually run, not because of an app bug but because their `vi.mock(...)` bodies had drifted from the real modules they mock: one was missing a newly-added export the route now imports (`assertMasterFacturaTAllowed` from `../billing/groupInvoiceScope`), the other was missing a mocked storage method the route had been refactored to call (`storage.getGroupReservationLedger` — the shared per-reservation ledger now backs `/master-folio`'s `rooms[]`, not `storage.getCharges` directly). When a test that mocks a whole module 500s unexpectedly, check the route's current imports/calls against the mock's exported keys before assuming a real bug.
