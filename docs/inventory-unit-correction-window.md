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
actor/time. Update authorised 2026-11-05: existing recipes with incompatible units no
longer block an authorised base-unit correction. The complete cost cascade runs
inside a savepoint. Only INVENTORY_UNIT_EQUIVALENCE_REQUIRED may defer it: all
cascade cost writes roll back, while the article's unit saves. Recipe units and
quantities stay unchanged; previous recipe costs are retained. Persistent
unit_correction_pending/unit_correction_note fields show the review notice in
Inventory and Recipes, and before/after audit captures it. Technical errors and
invalid submitted factors still roll back the whole edit. Ordinary cost updates
and consumption remain strict. A successful full recalculation (for example,
saving corrected equivalences) clears the review marker. Pending consumption jobs must be resolved before correction.
The mode does not grant quantity editing or bypass stock/deposit permissions.

## Close the window

Set inventoryUnitCorrectionWindow.enabled=false in
server/inventoryUnitCorrection.ts and deploy main. No data rollback. Existing review notices remain until successful recalculation. Capability
then returns false, the dropdown locks, both API paths reject changes even from
a stale page, and the storage history guard remains active. Ordinary edits with
an unchanged unit remain available. Tests exercise closure for admin and
resp_deposito.

Validation of the 2026-11-05 extension: 18 local PostgreSQL cases cover both
roles, persistent warnings, unchanged costs/quantities, later recalculation,
window closure, permissions, pending consumption, invalid factors and SQL
failure rollback. UI tests cover the editor, warning persistence and recipe-page
visibility before opening a dialog. TypeScript and build are required before
publication. No operational article/stock was changed by test fixtures.
