---
name: Company/agency entity selector field names
description: Companies and agencies have no `.name` field; dropdowns must use razonSocial/nombreFantasia. Also covers the two-step CC voucher dialog pre-fill gotcha.
---

## companies/agencies have no `.name` field

The `companies` and `agencies` tables only have `razonSocial` and `nombreFantasia` — there is no `name` column. Any Cuenta Corriente entity selector (`<SelectItem>{e.name}</SelectItem>`) silently renders blank/empty labels instead of erroring, because JS doesn't complain about `undefined` in JSX.

**Why:** This bug was copy-pasted into three separate CC entity selectors (billing.tsx, restaurant.tsx, group-detail.tsx) during the same feature rollout — each looked fine in isolated code review but broke in e2e testing because the option text was invisible/unselectable.

**How to apply:** Always render entity names as `e.razonSocial || e.nombreFantasia || e.name || e.id`. When adding a new company/agency selector anywhere, grep the codebase for the existing pattern (`razonSocial || nombreFantasia`) and reuse it rather than trusting `.name`.

## Two-step "emit voucher then auto-register payment" dialogs need pre-filled receptor

When a payment/close flow first opens a secondary `EmitirFacturaDialog` (to emit a voucher/comprobante) and only calls the actual payment-recording mutation in that dialog's `onSuccess`, the secondary dialog's required "Razón Social / Nombre" receptor field must be pre-filled via `initialValues.razonSocial`. If left empty, the dialog's own validation silently blocks submission (toast fires but is easy to miss in fast UI flows), so the outer payment mutation never runs and the parent flow looks like a totally unrelated "payment not recorded" bug.

**Why:** Discovered when a Grupos "Cuenta Corriente + Voucher Habitaciones" payment appeared to do nothing — the real cause was the nested EmitirFacturaDialog having an empty razonSocial that failed client-side validation.

**How to apply:** When wiring any flow that opens `EmitirFacturaDialog` as an intermediate step before a follow-up mutation, always pass `initialValues.razonSocial` (e.g. from the selected CC entity's razonSocial/nombreFantasia, or a sensible fallback like the group/guest name).
