---
name: Cuenta Corriente payment engine (companies/agencies/guests)
description: Shared payment-with-allocations + retentions + PDF receipt design used across all 3 CC entity types
---

The Cuenta Corriente module (companies, agencies, guests) shares one engine: a single `CCPaymentDialog` component (`client/src/components/cc-payment-dialog.tsx`) parameterized by `entityType` (`company`/`agency`/`guest`), used identically on all three pages.

**Sign convention:** `cargo` movements are positive amount, `pago` movements negative. Pending balance per cargo = `cargo.amount - sum(allocations for that cargoId)`.

**Allocations vs retentions are orthogonal:** a payment's recorded `amount` always equals the full allocated total against selected cargos (i.e. the cargo is fully/partially cancelled by that amount). Retenciones (IIBB, Ganancias, IVA, SUSS, TISHPYS, Otras) are stored as JSON metadata on the movement (`retentions` column) for reporting/receipt purposes only — they do NOT reduce the amount applied to cancel the cargo. Only the "efectivo/transferencia recibido" figure shown to the user (amount − retentions) reflects actual cash received.

**Why:** this matches accounting reality — the invoice is legally cancelled for the full allocated amount even when part of it was withheld as a tax retention by the payer.

**How to apply:** when adding new payment/allocation UI or backend logic, keep `createPaymentWithAllocations` (in `server/db-storage.ts`, transactional via `db.transaction()`) as the single write path for all 3 entity types — do not duplicate payment logic per entity.

**Receipt PDF:** auto-opens via `window.open` on successful payment (manual download/print only, never auto-emailed). Endpoint is `GET /api/account-movements/:id/receipt-pdf` in `server/exports.ts`; watch for route collisions (see express-route-param-collision.md).

**Sandbox note:** `npm run db:push` hangs on the interactive TUI in this sandbox (no TTY) — use direct `psql "$DATABASE_URL"` DDL matching Drizzle's snake_case naming for schema changes when this happens.
