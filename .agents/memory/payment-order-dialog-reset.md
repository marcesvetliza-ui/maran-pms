---
name: Payment order (OP) dialog session bug
description: Why "Emitir Orden de Pago" only worked once per session and how the fix works.
---

# Payment Order (OP) dialog — state reset & response parsing

## The bug
Users had to log out and back in to create a second Orden de Pago (payment order) in the same session. Second attempt failed with `400: Facturas no pendientes: #N (pagado)`.

**Root causes (in `client/src/pages/purchase-invoices.tsx`, `PaymentOrderDialog`):**
1. The dialog component is never unmounted between opens (parent always renders it, toggling `open`/`supplier` props only) — but no effect reset `selectedInvoices` / `createdOpId` / `form` when it reopened. The previous OP's already-paid invoice ID stayed selected and got resubmitted.
2. Separately, `createMut`'s `mutationFn` returned the raw `apiRequest` `Response` object instead of `res.json()`, so `data?.id` / `data?.numero` in `onSuccess` were always `undefined` — the success screen (with PDF download buttons) never rendered, only the toast showed.

**Why:** `apiRequest` (in `client/src/lib/queryClient.ts`) intentionally returns the raw `Response`, not parsed JSON — callers must `await res.json()` themselves in `mutationFn`. This is the established pattern elsewhere in the file (see the purchase-invoice creation `createMut`).

**How to apply:**
- Any dialog that isn't unmounted between opens must explicitly reset all local state in a `useEffect` keyed on the `open`/entity-id transition — don't assume closing clears it.
- Always parse `apiRequest`'s Response with `res.json()` inside `mutationFn`, never rely on the raw Response object having your API's fields.
