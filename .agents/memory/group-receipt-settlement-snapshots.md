---
name: Group receipt settlement snapshots
description: Why group receipts must preserve their invoice, advance, and new-collection split at fiscal confirmation time.
---

Persist the group receipt settlement split at confirmation time: document total, previously collected advances applied, and the new collection. Treat it as immutable receipt evidence rather than recalculating it from current group balances.

**Why:** Later invoices, credit notes, collections, and non-fiscal extras change the aggregate ledger. In particular, a close-out collection can exceed the fiscal portion while still applying more prior advances than `document total - new collection`, so the original split cannot be reconstructed reliably afterward.

**How to apply:** Carry the split in the pre-emission fiscal intent, validate it again when the emitted invoice is claimed, and render the same stored values in history, individual receipts, and consolidated group PDFs. Keep payment methods and retentions as separate detail beneath the new-collection total.

Historical reconstruction must require one unambiguous emitted invoice across every available legacy linkage signal. If links conflict, the intent is missing, or its totals do not match the immutable invoice and receipt values, mark the split as not reconstructible rather than choosing a candidate or deriving amounts from balances.

**Why:** Equal invoice and collection totals do not prove two legacy links refer to the same fiscal event; choosing one could attach a different applied-advance amount to the receipt.

**How to apply:** Treat persisted fiscal intent as evidence only after unique-link and cent-level consistency checks. Preserve and expose whether a split was captured contemporaneously, reconstructed from intent, or could not be reconstructed.