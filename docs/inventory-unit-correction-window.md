# Temporary correction of inventory base units

Requested catalogue cleanup, opened 2026-11-04. This corrects a mistakenly
selected base unit; it does not physically convert quantities. Stock 12 remains
12 after changing unidad to kg. Historical quantities/movements and recipe
quantities are retained. No automatic expiry was requested; close when the user
reports cleanup completed.

Authorisation follows the existing api:inventory:catalog permission. Defaults
include admin and resp_deposito (warehouse supervisor), plus other already
authorised catalogue editors. GET /api/inventory/unit-correction-mode provides
the actual server capability. Both normal item PATCH and the real metadata
editor recheck authorisation; client flags/request-body overrides cannot unlock.
Storage requires the trusted server option as well as the open window for
items with stock/history.

Changing base unit invalidates previous custom factors. The form displays a
warning and accepts new equivalences atomically with the unit change. Prior
factors are retained in audit_logs details together with before/after item and
actor/time. Required recipe factors must exist for the new base; a missing or
invalid equivalence rolls back the entire edit, including deletion of old
factors. Current recipe costs recalculate from the new valid basis, retaining
recipe quantities. Pending consumption jobs must be resolved before correction.
The mode does not grant quantity editing or bypass stock/deposit permissions.

## Close the window

Set inventoryUnitCorrectionWindow.enabled=false in
server/inventoryUnitCorrection.ts and deploy main. No data rollback. Capability
then returns false, the dropdown locks, both API paths reject changes even from
a stale page, and the storage history guard remains active. Ordinary edits with
an unchanged unit remain available. Tests exercise closure for admin and
resp_deposito.

Validation: 9 real local PostgreSQL correction tests, 9 UI/conversion tests,
12 existing inventory workflow PostgreSQL tests and 17 inventory access tests.
TypeScript and production build required before deployment. No operational
article/stock was changed by test fixtures.
