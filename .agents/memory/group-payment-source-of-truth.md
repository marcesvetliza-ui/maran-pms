---
name: Group payment source of truth
description: Accounting rule for group receipts, room allocations, master-folio balances, and invoice association.
---

For group collections, the parent group receipt is the financial source of truth. Payments attached to rooms through that receipt are allocations for folio visibility and must not be added again to received totals.

**Why:** Counting both the received parent amount and every allocated room payment duplicates the same collection. The master folio and the group summary can then disagree, especially when a payment also covers group-only charges.

**How to apply:** Any new group collection destination must create one parent receipt atomically with its allocations, derive its balance from the applicable parent receipts, and link its fiscal document to the parent receipt. Validate the available balance only after serializing the group collection operation. When a share uses Cuenta Corriente, create its account cargo in that same transaction and retain the parent receipt reference so an allowed reversal cannot leave an orphaned receivable.

For directed checkout initiated from the master folio, record the receipt as an explicit room distribution, not as a global master-folio receipt. Allocate only the operator-confirmed room balances. Do not spread it over unselected rooms or group-only charges; those remain on the master folio. Closing reservations, creating room allocations, changing room status, and creating housekeeping work must be one transaction.

**Why:** A global master receipt is scoped by the master configuration (often accommodation-only), so it cannot settle room extras required for a zero-balance checkout. A weighted distribution can also use shared services or general charges to settle the wrong reservation, and swallowing a housekeeping insert failure commits only part of the checkout.

**How to apply:** Require cent-exact per-reservation assignments, revalidate each selected room under the group lock, and let any allocation or housekeeping failure roll back the parent receipt and every status change.