---
name: Fiscal group collection intents
description: Safety rule for group invoices whose collection must not reach Caja before fiscal confirmation.
---

A fiscal group collection must persist a durable intent before contacting ARCA, but must not create its payment, allocations, account entries, or Caja movement until the invoice is emitted and atomically claimed.

**Why:** ARCA authorization and local settlement cannot be one database transaction. A browser reload or local failure after CAE must remain recoverable without recording money early or creating duplicate collections.

**How to apply:** Keep non-fiscal advances immediate. For fiscal group flows, store the exact collection intent with the pre-authorization invoice draft, derive final concepts and cent-exact payment rows from the confirmed invoice, reject invalid/negative rows, then claim the invoice and write all financial effects in one idempotent database transaction. The same claim must close the draft's reconciliation state; for historical rows, an existing payment-to-invoice link is authoritative evidence that reconciliation already completed.