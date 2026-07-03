---
name: Factura C / IVA preview totals
description: Rules for invoice item IVA preview math in billing.tsx and restaurant.tsx — mutually-exclusive alicuota buckets and tipo-switch cleanup.
---

# Factura C and IVA preview totals

## The rule
When reducing invoice items into IVA preview buckets (`neto`, `iva21`, `iva105`, `exento`, `ng`), each item belongs to **exactly one** bucket based on `alicuotaIva`. Never add to `acc.neto` unconditionally and then also add to `exento`/`ng` — that double-counts the item into TOTAL.

**Why:** The original reduce did `acc.neto += it.subtotalNeto` unconditionally on every item, then separately added to `exento`/`no_gravado` buckets too. This was a latent bug for any "Exento"/"No Grav." item, but went unnoticed until Factura C was fixed to force ALL items to `alicuotaIva = "no_gravado"` — at that point every FC invoice showed double the real total.

**How to apply:**
- Use `if/else if` chains keyed on `alicuotaIva`, matching the backend's switch-based `calcularMontos()` in `server/billing/invoiceService.ts` (which was already correct).
- Factura C (monotributista) never discriminates IVA: unit price = final total, forced `alicuotaIva: "no_gravado"`.
- When switching the invoice `tipo` selector (FC → FA/FB or vice versa), items that had `alicuotaIva` force-set to `"no_gravado"` by FC must be reset to a real rate (e.g. `"21"`) on exit, otherwise they stay stuck in the wrong preview bucket and show "Importe Neto: $0,00" even though TOTAL looks right. `recalcForTipo`/`recalcCompItemsForTipo` need the *previous* tipo passed in to know when this reset applies.
- This pattern exists in both `client/src/pages/billing.tsx` (EmitirFacturaDialog) and `client/src/pages/restaurant.tsx` (duplicate "Emitir Comprobante" dialog) — keep them in sync.
