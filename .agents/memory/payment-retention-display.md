---
name: Payment retention (IIBB/Ganancias) display
description: Where retention data lives and how to surface it on any new group/reservation money view
---

Retention withheld by a company/agency on a payment (IIBB/Ganancias) is stored as JSON on `payments.notes`, shape `{ retencion: { tipo, monto, neto } }` — this is the single source of truth, shared by both the single-reservation billing flow and group payments. There is no separate retention table/column.

**Why:** Reusing `payments.notes` let group payments piggyback on the exact rendering logic (`Otros Tributos` section) the single-reservation invoice PDF already had in `server/billing/invoicePdf.ts`, instead of building a parallel schema.

**How to apply:** Any new view that lists payments (folio, master-folio, group/reservation invoice PDF, payment history UI) must parse `payments.notes` for `retencion` and render it as a sub-line, not just the net/gross amount. Group invoices (`sales_invoices` rows with `group_id`, no `reserva_id`) need their own retention-aggregation branch keyed by `group_payment_id` in `server/billing/routes.ts`'s invoice-PDF endpoint — the existing branch only triggers on `factura.reserva_id`. Known gap (tracked as a follow-up): retentions entered on a Folio Maestro payment (non-room "__" allocation target) are silently dropped by `recordGroupPayment` since there's no room-level payment row to attach the JSON to — check before assuming retention data exists for master-folio-destined payments.
