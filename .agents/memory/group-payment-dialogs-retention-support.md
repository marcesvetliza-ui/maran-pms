---
name: Which group-payment dialog supports retenciones
description: Only one of two group-payment dialogs in group-detail.tsx has retención (IIBB/Ganancias) fields; the other silently has none.
---

`client/src/pages/group-detail.tsx` has two different dialogs that can register a payment against a group's Folio Maestro (master, non-room balance):

1. **"Pago Grupal"** (`showGroupPaymentDialog`, button `button-group-payment`) — supports a destino toggle (per-room vs `master`). When destino is `master`, each payment row can attach a `retention: { tipo, monto }` and POSTs to `/api/groups/:groupId/master-payment`. This is the **only** entry point that can produce a `group_payments.retention_detail` row.
2. **"Pago al Folio Maestro"** (`showMasterPaymentDialog`) — a legacy, simpler dialog with no retención fields at all.

**Why:** Task #396 fixed retentions being silently dropped on Folio Maestro payments, but the fix (and any regression test for it) only applies to the "Pago Grupal" dialog's `master` destino path. The legacy dialog can't exercise retention behavior no matter what because it has no UI for it. This is also why a follow-up task exists to retire the legacy dialog now that "Pago Grupal" covers the same ground.

**How to apply:** Any future work on Folio Maestro retenciones (UI, tests, bug fixes) must anchor on the "Pago Grupal" dialog's `master` destino path, not `showMasterPaymentDialog`. If the legacy dialog is ever extended instead of retired, it would need its own retención fields added from scratch.
