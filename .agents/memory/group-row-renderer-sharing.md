---
name: Group payment row renderer sharing
description: Where the "Historial de Pagos Grupales" row UI lives and why it must stay shared between the per-group and cross-group views.
---

`GroupPaymentHistoryRow` and `PAYMENT_METHOD_LABELS` live in `client/src/components/group-payment-history-row.tsx`, imported by both `client/src/pages/group-detail.tsx` (per-group "Folio Grupal" tab) and `client/src/pages/reports.tsx` (cross-group Reportes › Grupos view).

**Why:** these two views must agree on what a group payment's money-relevant facts look like (comprobante/invoice status, receptor, método(s), retención, destino). They were originally two copies of the same component; duplicating them let one drift from the other silently.

**How to apply:** any change to how a group payment row renders (new badge, new field, new status) belongs in the shared component, not in either page. The component takes an optional `groupName` prop — pass it only in the cross-group context; the per-group page already has the group in scope.
