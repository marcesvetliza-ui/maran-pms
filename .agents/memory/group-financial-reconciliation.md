---
name: Group financial views share one ledger
description: Why Folio Grupal, Folio Maestro (JSON + PDF) and Resumen del Grupo must all read the same per-reservation ledger function, and what stays intentionally separate
---

Group billing had three (really four, once the master-folio PDF route is counted) independent per-reservation loops computing "what a group owes" — each with its own subtly different bugs (accommodation from `nights * rate` instead of `totalRoomAmount`, missing `anulado` filters, missing group-payment dedup, or ignoring master-destined group payments entirely in the PDF). They drifted apart after multiple partial payments/charges.

**Why:** A full migration of group data into the shared `accountMovements`/`accountMovementAllocations` ledger (used for companies/agencies/guests) was considered but rejected as too invasive for what was actually a duplication bug — `accountMovements` has no `"group"` entity type and no `groupId` column, only an indirect `groupPaymentId` FK. Migrating it risked losing/duplicating historical movements, which was explicitly out of bounds.

**How to apply:** Any group financial view (folio, master-folio JSON, master-folio PDF, group invoice/resumen, and any future one) must source its per-reservation facts from `storage.getGroupReservationLedger(groupId)` (server/db-storage.ts) rather than re-querying `charges`/`payments` itself. That function is the single place that: filters cancelled reservations, filters `status === "anulado"` charges/payments, and returns `accommodationTotal` from `totalRoomAmount` (never `nights * rate`). Callers still apply their own view-specific rules on top (e.g. master-folio's dedup of room payments against `groupPaymentId`s that are master-destined, or config-dependent extras inclusion) — those differences are legitimate and should stay, only the underlying facts must be shared.

Kept intentionally separate inside one shared financial snapshot: operational balance is total charges minus money collected, while fiscal availability is eligible charges minus invoiced amounts. A non-fiscal advance is collected minus invoiced; when invoicing the remainder, apply that advance first and collect only invoice total minus the applicable advance.

**Why:** Requiring the new payment to equal the invoice total double-charges advances and blocks checkout. For 360,000 owed, 90,000 collected, and 30,000 invoiced, the correct result is 270,000 operational balance, 60,000 non-fiscal advance, 330,000 fiscal availability, and only 270,000 new money for a 330,000 invoice.

**How to apply:** Group summary, folio/master folio, payment dialogs, server validation, and checkout must use cent-rounded values from the same snapshot. Validate invoice amount against fiscal availability. For partial payments, new money equals invoice less advances; for full close, it equals the complete operational balance and must cover at least that fiscal portion, because non-facturable adjustments can make the balances diverge.

When touching any group money code, grep for other `for (const reservation of group.reservations)` loops nearby — a duplicate hand-rolled computation (like the master-folio PDF route had) is the recurring failure mode here, not just the JSON API you're looking at.
