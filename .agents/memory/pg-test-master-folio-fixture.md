---
name: Postgres test fixtures for group master-folio flows
description: How to give a group a real master-folio balance in a *.pg.test.ts without creating rooms/reservations/guests.
---

Real-database tests for group master-payment/master-folio routes (POST /api/groups/:groupId/master-payment,
DELETE /api/groups/:groupId/master-payments/:paymentId) don't need a full reservation graph. Insert a single
`group_charges` row for the group instead of reservations/rooms/guests — the master-folio balance calculation
sums `group_charges` alongside room accommodation, so one charge row alone produces a spendable balance. The
payment then allocates to the synthetic `__group_charges__` bucket, which creates a `group_payments` row and
(for non-cuenta_corriente rows) a `cash_movements` row via `registerGroupPaymentCashMovements`, but no
`payments` row — that only happens for room-tied allocations.

**Why:** Building real rooms/guests/reservations just to get a master-folio balance is a lot of unnecessary
fixture surface area for a route test; group_charges is the minimal real path to the same balance.

**How to apply:** When writing a `*.pg.test.ts` that needs to exercise the master-folio POST/DELETE routes end
to end, seed `groups` + one `group_charges` row, then call the real HTTP routes (mock only `../auth` and
`../audit`, not `db`/`db-storage`/`migrate`). Also remember `npm run test:postgres` in package.json lists pg
test files explicitly (no glob) — any new `*.pg.test.ts` must be added to that script by hand or it silently
never runs.

The `group_distribution` destination (direct "Pago Grupal" via POST /api/groups/:groupId/payment or the legacy
/payment/v2) is different: it requires at least one real `reservations` row (status confirmed/checked_in) linked
via `group_reservation_links`, because it allocates across active rooms rather than the `__group_charges__`
bucket. `reservations.guest_id/room_type_id/room_id` have no DB-level FK constraints, so fixture-only ids for
those columns are fine — no need to also insert `guests`/`rooms`/`room_types` rows.
