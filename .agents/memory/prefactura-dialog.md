---
name: PrefacturaDialog — unified checkout/billing
description: New unified dialog component replacing both the checkout wizard (steps 1-3) and the "Facturar Saldo" EmitirFacturaDialog entry point in reservations.tsx.
---

# PrefacturaDialog

## What it does
`client/src/components/PrefacturaDialog.tsx` — 2-step + result modal:
- **Step 1 (Prefactura):** All folio charges as checkboxes, editable descriptions, "ya cobrado" totals, "Facturar a" (guest/company/agency), auto-suggest tipo from condiciónIVA, POS selector, "Hacer check-out" checkbox.
- **Step 2 (Cobro):** Multiple payment rows (monto + método + referencia), retenciones per row, running totals.
- **Step 3 (Resultado):** Comprobante info, two-column summary, "Emitir otro" if balance remains.

## Entry points
1. **Check-out page** (`check-out.tsx`): `startCheckout(reservation)` now sets `prefacturaOpen=true` instead of `wizardStep=1`. The old 3-step wizard block is dead code but still compiles.
2. **Reservations page** (`reservations.tsx` ~line 5034): Replaced `showFacturar && (() => { ... EmitirFacturaDialog ...})()` block with `<PrefacturaDialog open={showFacturar} mode="billing" ... />`.

## Billing safety rules
- Emit the folio invoice before persisting new payment rows. The server's reservation lock can then reject a stale invoice without leaving an orphan payment.
- A partial collection must emit a partial invoice: both document items and `sourceChargeAmounts` are projected to the amount actually covered (including prior advances), never to the full selected charge.
- Fiscal recipient rules are shared by UI and server: Responsable Inscripto/Monotributo use A with a valid CUIT; Exento/Consumidor Final use B; T is only for a foreign guest with accommodation selected.
- `cuenta_corriente` is a sale condition, not a substitute label for a fiscal document or cash payment method. It requires an associated company/agency and creates the account charge without a reception cash payment.

**Why:** The folio can be open in multiple terminals and can contain advances, partial charges, or linked entities. Treating the selected charge total as an automatic invoice total creates irreconcilable folio balances and duplicate exposure.

**How to apply:** When changing Prefactura's amounts, calculate one deterministic per-source allocation and send that same allocation to the invoice API. Keep the API validation aligned with the selector rules; never rely on the client alone.

## Invoice types supported
FA, FB, FT, FM and the corresponding NC/ND flows; non-fiscal `cierre_habitacion`.

## Known deferred items
- `GET /api/reservations/:id/folio/pdf` endpoint does not exist yet — "Imprimir resumen" button will 404
- NC/ND from prefactura (complex, separate task)
- Transferencia de cargos entre habitaciones (separate task)

**Why:** Avoid duplicating the checkout wizard inline in check-out.tsx AND as a dialog from reservations.tsx. Single component handles both flows via `mode: 'checkout' | 'billing'` prop.
