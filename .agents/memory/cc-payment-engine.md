---
name: Cuenta Corriente payment engine (companies/agencies/guests)
description: Shared payment-with-allocations + retentions + PDF receipt design used across all 3 CC entity types
---

The Cuenta Corriente module (companies, agencies, guests) shares one engine: a single `CCPaymentDialog` component (`client/src/components/cc-payment-dialog.tsx`) parameterized by `entityType` (`company`/`agency`/`guest`), used identically on all three pages.

**Sign convention:** `cargo` movements are positive amount, `pago` movements negative. Pending balance per cargo = `cargo.amount - sum(allocations for that cargoId)`.

**Allocations vs retentions are distinct but both settle debt:** the payment methods represent cash/transfer value, while retentions (IIBB, Ganancias, IVA, SUSS, TISHPYS, Otras) are also applied to the account balance. The movement's accounting amount is payment methods plus retentions; retentions are additionally stored as JSON metadata on the movement (`retentions`) for reporting/receipt purposes.

**Why:** the retained amount is withheld from the payer but credited against the receivable, so subtracting it from the movement would leave the debt overstated and make allocation totals inconsistent.

**How to apply:** when adding new payment/allocation UI or backend logic, keep `createPaymentWithAllocations` (in `server/db-storage.ts`, transactional via `db.transaction()`) as the single write path for all 3 entity types — do not duplicate payment logic per entity.

**Multiple methods:** submit all methods of one payment together, then persist one `pago` movement for their summed value plus retentions. Its allocation total must equal that persisted accounting amount exactly; never accept a client-declared total as proof. Put the method breakdown in the movement description and use `paymentMethod="varios"` when applicable.

**Concurrent allocations:** pending-balance validation must run inside the same transaction as payment creation, after locking each selected cargo with `FOR UPDATE`.

**Why:** two requests can both read the same pre-transaction balance; without a row lock and a second balance check, each can allocate the full amount and overpay the cargo.

**How to apply:** keep the lock ordering deterministic, recalculate prior allocations only after the locks are acquired, and reject the complete transaction when an allocation exceeds the remaining balance.

**Receipt PDF:** auto-opens via `window.open` on successful payment (manual download/print only, never auto-emailed). Endpoint is `GET /api/account-movements/:id/receipt-pdf` in `server/exports.ts`; watch for route collisions (see express-route-param-collision.md).

**Sandbox note:** `npm run db:push` hangs on the interactive TUI in this sandbox (no TTY) — use direct `psql "$DATABASE_URL"` DDL matching Drizzle's snake_case naming for schema changes when this happens.

**Client-side validation must be duplicated per entry point:** `reservations.tsx`'s own multi-payment form (`handleAddMultiPayment`, separate from `CCPaymentDialog`) did not block submitting method=`cuenta_corriente` + billingTarget=`company`/`agency` without an actual companyId/agencyId selected, while `check-out.tsx` did have that guard. Result: historical payments/account_movements created with a company/agency billing target but a null company_id/agency_id — invisible in Cuentas Corrientes. Fixed by adding the same guard (toast + block submit) in reservations.tsx. **Why:** any UI surface that can create a CC payment needs its own explicit validation — there's no shared form component enforcing it outside `CCPaymentDialog`. **How to apply:** when adding a new payment-entry surface, grep for how check-out.tsx validates billingTarget+companyId/agencyId and mirror it exactly, and consider backfilling/reconciling any legacy null company_id/agency_id rows.
