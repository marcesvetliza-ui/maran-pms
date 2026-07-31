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

## API flow on submit
1. `POST /api/payments` for each payment row (one call per row)
2. `POST /api/billing/invoices` with `reservaId`, no `cashArea` (AFIP record only)
3. `POST /api/reservations/:id/check-out` if mode='checkout' && doCheckout=true

## Invoice types supported
FA, FB, FC, NCA, NCB, cierre_habitacion, ticket. FT/MiPyME need backend changes (not yet).

## Known deferred items
- `GET /api/reservations/:id/folio/pdf` endpoint does not exist yet — "Imprimir resumen" button will 404
- NC/ND from prefactura (complex, separate task)
- Transferencia de cargos entre habitaciones (separate task)

**Why:** Avoid duplicating the checkout wizard inline in check-out.tsx AND as a dialog from reservations.tsx. Single component handles both flows via `mode: 'checkout' | 'billing'` prop.
