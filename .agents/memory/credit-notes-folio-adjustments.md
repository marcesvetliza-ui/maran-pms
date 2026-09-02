---
name: Credit notes and Folio adjustments
description: Business and safety rules for reservation credit notes, charges, payments, and Folio balances.
---

Reservation credit notes must retain the original charge and add a separately auditable negative Folio adjustment linked to the original charge. They do not cancel payments or create a cash refund; those are separate, explicit operations.

**Why:** A fiscal correction can happen after a charge is paid. Keeping the payment active allows the Folio to show the resulting guest credit instead of silently rewriting payment history or cash.

**How to apply:** Require a complete, explicit charge mapping before automating a reservation NC. Preserve fiscal receiver, document type, point of sale, sale condition, and payment method from the source invoice. Reject ambiguous historical mappings and serialize NCs with other reservation invoice operations.

The tagged negative Folio adjustment created by a reservation NC is audit history only: it must not reduce the operational source amount or its future invoice capacity. Restored capacity comes from the original invoice's credited source allocation.

**Why:** If both the negative adjustment and the credited invoice allocation reduce the same source, a total NC leaves the UI showing a restored charge while the server rejects its re-invoice as having zero capacity.

**How to apply:** Operational totals and invoice validation ignore tagged NC adjustments. Remaining fiscal capacity is original operational amount minus each sale invoice's net, source-level allocation after its credit notes.

The payment's original invoice reference is immutable history. A credit note releases a proportional amount of that payment as reusable advance, but a later re-invoice must not overwrite the original reference.

**Why:** Overwriting the payment link makes the original receipt disappear from the Folio and prevents explaining the invoice → NC → re-invoice sequence.

**How to apply:** For a partial NC, available advance is payment amount × credited/original invoice total; a fully credited invoice releases the full payment. Link only never-invoiced advances to a new invoice; record later uses as nested reapplications so they consume availability without replacing the original receipt.

Folio summaries must show operational/fiscal and collection figures separately: gross Folio balance, net invoiced, pending billing, registered collections, advances made available by NCs, and new collection required.

**Why:** After a paid invoice is fully credited, pending billing returns to the full operational charge while only the new cash needed is reduced by the preserved payment. A single “balance” label makes one of those two correct amounts look wrong.

**How to apply:** Keep NCs visible as fiscal adjustments without subtracting them from operational charges. Label the amount after reusable advances as “new collection required,” never as the total pending billing amount.

For fiscal NCs, persist a local authorization-pending record before contacting ARCA. Before retrying a pending authorization, query ARCA by the persisted voucher type, point of sale, and number; reconcile a recovered CAE, reauthorize only after an explicit “not found,” and leave any ambiguous response pending for finance review.

**Why:** A process or network failure can occur after ARCA authorizes a voucher but before the local record is updated. Reissuing in that state can leave an authorized fiscal NC without its Folio correction or risk a duplicate authorization.

**How to apply:** Make the original invoice update and negative Folio adjustments one idempotent database transaction after authorization. Mark its reconciliation state and expose a finance-restricted pending queue with an audited retry/reconcile action.