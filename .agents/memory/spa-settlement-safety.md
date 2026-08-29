---
name: SPA settlement safety
description: Financial consistency rules for closing a SPA appointment at creation
---

Cargo a habitación closes the SPA folio by transferring one charge to the occupied room folio; it must never create a Caja movement. Voucher SPA closes against one direct payment and one non-fiscal Caja movement. A fiscal SPA invoice must claim its SPA folio before contacting ARCA, and only the final account-link operation may create the SPA payment, Caja movement, and folio settlement.

**Why:** Invoice authorization and local linking are separate failure points. Without a durable pre-authorization claim, a process interruption can emit a duplicate fiscal document; with more than one Caja writer, recovery and normal linking can duplicate income.

**How to apply:** Keep the SPA account, SPA payment, Caja movement, and folio movements in one transaction when closing. Persist immutable invoice number, recipient, items, total, payment method, and SPA account before ARCA; resume that same claim after failure. Expose pending authorization and pending link states to operators.