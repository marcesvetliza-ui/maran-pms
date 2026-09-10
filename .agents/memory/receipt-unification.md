---
name: Receipt type unification across sale modules
description: How sale receipt types (Factura A/B/C, tickets, vouchers, Cuenta Corriente) are scoped per module and where Nota de Crédito lives
---

Sale-side receipt type lists are centralized in `shared/receiptTypes.ts` and consumed by Restaurant, SPA, Grupos, and Recepción (via `client/src/components/emitir-comprobante-button.tsx` and `EmitirFacturaDialog`/`NotaCreditoDialog` in `client/src/pages/billing.tsx`).

Rules:
- Universal across all sale modules: Factura A, Factura B, Cuenta Corriente (a payment method, not a document type).
- Factura C is sale-side removed everywhere; it only remains in `client/src/pages/purchase-invoices.tsx` (Compras/purchases).
- Factura T remains readable for historical documents but must not be offered or accepted for new sales until its tourism-specific regime is fully implemented.
- Fiscal PDFs for supported A/B families carry the official ARCA QR. Transparency fiscal is shown only for the B family and uses the persisted IVA amounts by rate.
- Restaurant-only: Ticket, Voucher Justo, Voucher PedidosYa.
- Recepción-only: Cierre de Habitación.
- SPA-only: Cierre de SPA.
- Grupos keeps its own folio/charges UI, but real Factura A/B emission routes through the same `EmitirFacturaDialog` AFIP engine as Recepción (filtered to universal types only).
- Nota de Crédito is always a separate "Emitir Comprobante" action, never inside a POS/close-account dialog, and supports partial amounts (backend `POST /api/billing/invoices/:id/nota-credito` accepts optional `monto`; partial NC does not void/anular the original invoice).

**Why:** Confirmed directly with the user: the hotel issues Factura A and B, not C, and does not need Factura T in the short term. Historical compatibility must remain intact.

**How to apply:** When adding any new sale flow or module, import types from `shared/receiptTypes.ts` rather than hardcoding a list, and route new-invoice emission through the shared `EmitirFacturaDialog`/`emitir-comprobante-button.tsx` components instead of building a bespoke dialog.
