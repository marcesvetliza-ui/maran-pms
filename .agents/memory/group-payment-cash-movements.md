---
name: Group payments and unified cash reporting
description: Group payments are one financial event that can fan out into per-room ledger rows and cash-register entries; any aggregate report must pick exactly one representation
---

A single group payment (Pago Grupal / Pagar Folio Maestro) can simultaneously: (a) create one ledger row per room it was allocated to, tagged with the parent group-payment id, and (b) be represented as its own single event for cash-register/report purposes. Both representations carry the *same* money.

**Why:** any report or aggregate that unions "per-reservation payments" with "per-group payments" without excluding the linked rows on one side double-counts every group payment that was distributed to rooms — the room-level rows and the group-level row are two views of one collection, not two collections. This is easy to miss because each query looks correct in isolation.

**How to apply:** when adding a new cash/report aggregate that reads both individual-reservation payments and group payments, explicitly exclude reservation-payment rows that are tagged as belonging to a group payment (or otherwise pick one canonical source), then verify with a distributed (multi-room) group payment specifically — a master-folio-only payment won't expose the bug since it has no room-level rows to duplicate.

Separately: a payment type that never produces a cash-register movement (as group payments didn't, unlike individual reservation payments) silently excludes itself from daily cash reconciliation even though real money changed hands. When adding a new payment flow, check whether it needs to register a cash movement the same way existing flows do. A withheld retención is not itself a cash movement — it's a non-cash deduction, so only the actually-collected amount should register.

Group-payment persistence is atomic: the parent receipt, child room allocations, and cash-only Caja movements must commit or roll back together, and cash-bearing rows require an open reception shift.

**Why:** a best-effort Caja write after the payment commit can reduce operational debt while silently omitting the money from Caja. Also, PostgreSQL leaves a transaction aborted after any failed statement even if application code catches the exception; later statements then fail and can hide the original cause.

**How to apply:** keep every representation of one group collection in the same database transaction and lock scope. Do not catch a SQL error inside that transaction and continue unless using a savepoint; validate optional writes up front or let the whole operation roll back.

Reservation collections follow the same rule: a cash-bearing payment, its Caja row, its folio movement, and the folio aggregate update are one transaction. Cuenta Corriente and room charges are non-cash and must not create Caja income.

**Why:** the former best-effort Caja write could fail after the payment was accepted, leaving checked-out rooms visible in folios but absent from reception cash reconciliation.

**How to apply:** normalize and validate the amount once, lock the folio while recalculating, and never swallow a Caja failure after accepting a reservation payment.
