---
name: Credit notes and Folio adjustments
description: Business and safety rules for reservation credit notes, charges, payments, and Folio balances.
---

Reservation credit notes must retain the original charge and add a separately auditable negative Folio adjustment linked to the original charge. They do not cancel payments or create a cash refund; those are separate, explicit operations.

**Why:** A fiscal correction can happen after a charge is paid. Keeping the payment active allows the Folio to show the resulting guest credit instead of silently rewriting payment history or cash.

**How to apply:** Require a complete, explicit charge mapping before automating a reservation NC. Preserve fiscal receiver, document type, point of sale, sale condition, and payment method from the source invoice. Reject ambiguous historical mappings and serialize NCs with other reservation invoice operations.

For fiscal NCs, persist a local authorization-pending record before contacting ARCA. Before retrying a pending authorization, query ARCA by the persisted voucher type, point of sale, and number; reconcile a recovered CAE, reauthorize only after an explicit “not found,” and leave any ambiguous response pending for finance review.

**Why:** A process or network failure can occur after ARCA authorizes a voucher but before the local record is updated. Reissuing in that state can leave an authorized fiscal NC without its Folio correction or risk a duplicate authorization.

**How to apply:** Make the original invoice update and negative Folio adjustments one idempotent database transaction after authorization. Mark its reconciliation state and expose a finance-restricted pending queue with an audited retry/reconcile action.