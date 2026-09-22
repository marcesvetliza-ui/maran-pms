---
name: Reservation invoice payment snapshots
description: Rules for keeping reservation invoice payment metadata consistent with the payments actually applied.
---

An advance describes when money was collected, not how it was collected. Invoice payment detail must preserve the original instrument (card, transfer, cash, etc.) and include only the exact amount applied to that invoice.

**Why:** A stale browser row and generic “advance” classification caused fiscal PDFs to show cash or advance amounts that did not match the folio or Caja. Separately linking an advance after invoice emission also allowed concurrent tabs to persist a payment snapshot that was no longer true.

**How to apply:** Build one deterministic allocation plan for released credit and ordinary advances. Send exact payment IDs and amounts with the invoice request, reserve them atomically before emission, reconcile them server-side, and require the persisted method detail to equal the invoice total. Unknown methods must never default to cash.