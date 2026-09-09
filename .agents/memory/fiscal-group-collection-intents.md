---
name: Fiscal collection intents
description: Safety rules for recoverable fiscal settlement across group collections and reservation credit reapplications.
---

A fiscal group collection must persist a durable intent before contacting ARCA, but must not create its payment, allocations, account entries, or Caja movement until the invoice is emitted and atomically claimed.

**Why:** ARCA authorization and local settlement cannot be one database transaction. A browser reload or local failure after CAE must remain recoverable without recording money early or creating duplicate collections.

**How to apply:** Keep non-fiscal advances immediate. For fiscal group flows, store the exact collection intent with the pre-authorization invoice draft, derive final concepts and cent-exact payment rows from the confirmed invoice, reject invalid/negative rows, then claim the invoice and write all financial effects in one idempotent database transaction. The same claim must close the draft's reconciliation state; for historical rows, an existing payment-to-invoice link is authoritative evidence that reconciliation already completed.

After ARCA emits a group invoice, the UI may let the operator leave a failed linking dialog only after the persisted pending collection has been refreshed and is discoverable by the group recovery flow.

**Why:** Persisting the intent is not enough if the mounted group screen still has a stale empty recovery query; closing immediately can hide the pending collection until an incidental reload and invite an accidental re-emission.

**How to apply:** Block duplicate submission while linking. On link failure, refetch the group's pending fiscal collections before enabling return; other invoice-link flows without equivalent durable discovery must remain retry-only.

Authorization recovery and operational linking are one state machine: recovery is incomplete until the owner record points to the canonical emitted invoice.

**Why:** ARCA success alone does not restore the application relationship, and competing retries or client-provided fiscal data can create duplicate authorization attempts or false links.

**How to apply:** Serialize issuance and recovery under the same owner scope, finish the owner link before reporting recovery success, trust only stored emitted invoices, and keep every replay idempotent.

Reservation credit released by a partial/full NC uses the same saga: persist the exact credit allocations and uncovered settlement with the pre-authorization draft, reserve both payment credit and fiscal source capacity while unresolved, then reconcile from stored intent only.

**Why:** ARCA cannot participate in the local database transaction. A failure after CAE must not free the same credit/source for another invoice, lose the uncovered Caja/CC amount, or contact ARCA again on retry.

**How to apply:** Treat recipient, items, source mapping, amounts, and original invoice identity as immutable. Keep reconciliation status/error outside snapshot equality. Guard every payment mutation while an unresolved intent references it.

For reservation Cuenta Corriente invoices, persist specific ordinary advance allocations before ARCA and reconcile those allocations server-side; never let the browser consume advances after issuance. Only the uncovered remainder becomes a Cuenta Corriente payment/cargo, and it never creates Caja.

**Why:** Aggregate-only advance amounts or post-invoice browser linking allow response loss/concurrency to reuse an advance, overstate debt, or leave checkout blocked even though the account cargo exists.

**How to apply:** Reserve payment IDs with the draft, reconcile advance links plus the uncovered settlement idempotently, and keep the operation recoverable until checkout succeeds. Historical cargo-only repairs must adopt one exact, unambiguous cargo and claim it atomically.