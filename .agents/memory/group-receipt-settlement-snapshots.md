---
name: Group receipt settlement snapshots
description: Why group receipts must preserve their invoice, advance, and new-collection split at fiscal confirmation time.
---

Persist the group receipt settlement split at confirmation time: document total, previously collected advances applied, and the new collection. Treat it as immutable receipt evidence rather than recalculating it from current group balances.

**Why:** Later invoices, credit notes, collections, and non-fiscal extras change the aggregate ledger. In particular, a close-out collection can exceed the fiscal portion while still applying more prior advances than `document total - new collection`, so the original split cannot be reconstructed reliably afterward.

**How to apply:** Carry the split in the pre-emission fiscal intent, validate it again when the emitted invoice is claimed, and render the same stored values in history, individual receipts, and consolidated group PDFs. Keep payment methods and retentions as separate detail beneath the new-collection total.