---
name: Reservation CC fiscal identity
description: Durable ownership and reporting rules for reservation Cuenta Corriente invoices.
---

Reservation Cuenta Corriente cargos must use the originating payment ID as their durable fiscal identity. Never infer the invoice/cargo relationship only from reservation, entity, and amount; equal-value advances make that ambiguous.

**Why:** Legacy payment-first invoice flows could leave the payment, invoice, Caja, and CC report only partially linked. Amount-based reconciliation risks assigning an invoice to the wrong debt or duplicating a cargo.

**How to apply:** Persist the selected company/agency on the payment, store its ID on the CC cargo, and use that identity for fiscal-report inclusion and idempotent repair. Treat invoices tied to a reservation as originating in Recepción regardless of their ARCA point of sale. Leave ambiguous legacy matches unresolved rather than guessing.