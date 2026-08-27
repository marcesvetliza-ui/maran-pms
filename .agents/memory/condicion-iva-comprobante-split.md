---
name: Condición IVA → tipo de comprobante split
description: Which Condición IVA values are allowed to receive Factura A vs Factura B, a rule that must be identical on client and server
---

The intended business rule (confirmed against a QA report, not just inferred from code) is a strict, mutually exclusive split:
- **Responsable Inscripto** and **Exento** → only Factura A / MiPyme A.
- Everything else (Monotributista, Consumidor Final, unknown) → only Ticket / Factura B.

**Why:** this is counterintuitive enough that it had drifted out of sync — one place bucketed Monotributista with Responsable Inscripto and Exento the opposite way from the other. A receptor allowed a comprobante type by one side and rejected by the other silently breaks invoice emission (client shows an option the server then 400s on).

**How to apply:** this rule must be enforced in exactly two kinds of places — the server-side validation at the single point of invoice emission (shared by reservations/groups/spa/events), and any client-side comprobante-type selector that filters options by Condición IVA before submit. Grep for "condicion" + comprobante-type checks in both server invoice routes and client billing dialogs before changing the split in only one place.
