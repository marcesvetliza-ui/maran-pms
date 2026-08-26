---
name: Group payment source of truth
description: Accounting rule for group receipts, room allocations, master-folio balances, and invoice association.
---

For group collections, the parent group receipt is the financial source of truth. Payments attached to rooms through that receipt are allocations for folio visibility and must not be added again to received totals.

**Why:** Counting both the received parent amount and every allocated room payment duplicates the same collection. The master folio and the group summary can then disagree, especially when a payment also covers group-only charges.

**How to apply:** Any new group collection destination must create one parent receipt atomically with its allocations, derive its balance from the applicable parent receipts, and link its fiscal document to the parent receipt. Validate the available balance only after serializing the group collection operation. When a share uses Cuenta Corriente, create its account cargo in that same transaction and retain the parent receipt reference so an allowed reversal cannot leave an orphaned receivable.