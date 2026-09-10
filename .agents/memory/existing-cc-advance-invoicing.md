---
name: Existing Cuenta Corriente advance invoicing
description: Rules for invoicing an already-recorded reservation advance without redirecting or duplicating its financial settlement.
---

An invoice for an existing reservation advance must reuse that payment as its immutable financial source. The stored payment method and explicit billing-target type take priority; any missing entity identity must come from the matching reservation relationship, never from a different entity type. Fiscal recipient data must belong to that exact owner.

**Why:** Treating the invoice as a new collection can duplicate the payment, Cuenta Corriente debt, folio movement, or Caja event. Using reservation precedence after the advance exists can redirect historical debt when the reservation has multiple entities or was later reassigned.

**How to apply:** When invoicing an existing advance, do not run a new collection flow. Keep its financial identity immutable, link the invoice to the original payment, make retries idempotent, and preserve a way to resume invoicing after reload.
Cuenta Corriente is an operational settlement for hotel checkout even though the debt remains open on the customer/company account. If the CC cargo and invoice exist but the folio payment marker is missing, adopt the existing cargo and create only the missing informational links.

**Why:** Treating the room as unpaid traps it in check-in; creating another CC cargo fixes checkout by duplicating the customer's debt.

**How to apply:** Recover an unambiguous existing CC invoice/cargo into the reservation folio and informational Caja ledger before evaluating checkout balance. Never create a second account movement.