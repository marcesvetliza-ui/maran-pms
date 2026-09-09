---
name: Historical Caja recovery
description: Rules for assigning legacy reservation collections to historical shifts without corrupting closed-shift reconciliation.
---

Legacy reservation payments contain a calendar date but no trustworthy collection time. Automatically assign one to Caja only when exactly one reception shift overlaps that Argentina operational date; otherwise require a supervisor to confirm a candidate.

**Why:** Treating the date as midnight or using the server's UTC day can choose the wrong shift. Historical data may also use either `reception` or `recepcion`.

**How to apply:** Include both reception aliases, compare shift instants by their Buenos Aires calendar day, and never fall back to the current open shift.

When adding a recovered movement to a closed shift, update its expected income, method totals, and transaction count atomically, but do not increase the stored cash count.

**Why:** The cash total captured at closing represents money physically counted. Adding the recovered ledger amount to it would double-count cash that may already have been present even though its movement was missing.

**How to apply:** Preserve the closed summary's physical cash value while updating total expected income and non-cash method buckets in the same transaction as the movement and audit record.

Cuenta Corriente and voucher settlements belong in the reception shift closure as informational, shift-bound events even though they are not physical cash.

**Why:** Omitting them makes the shift report fail to reconcile closed rooms; treating them as income or expense corrupts expected cash and the counting difference.

**How to apply:** Show and persist separate non-monetary totals and counts, exclude them from physical cash and `totalGeneral`, and link each event idempotently to its payment. Creation, close, repair, and void must lock and update the event, folio, account ledger, and any closed summary atomically.