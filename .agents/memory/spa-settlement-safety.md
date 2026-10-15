---
name: SPA settlement safety
description: Financial consistency rules for closing a SPA appointment at creation
---

Legacy ownership protection must cover the whole awaited write, including
requests whose HTTP client disconnects; a precheck alone does not exclude
concurrent adoption.

**Why:** A writer can pass an unadopted check, pause, and then alter a folio after
another transaction adopts and reserves it. A disconnected client does not prove
that the database writer has stopped.

**How to apply:** Coordinate adoption and legacy writes with the same ownership
lock, keep it until the writer finishes, and resolve the owner from persisted
item/payment identities rather than trusting a body account ID.

Cargo a habitación closes the SPA folio by transferring one charge to the occupied room folio; it must never create a Caja movement. Voucher SPA closes against one direct payment and one non-fiscal Caja movement. A fiscal SPA invoice must claim its SPA folio before contacting ARCA. Only a designated settlement finalizer may create genuinely new SPA payments and Caja movements; invoicing existing collections must reuse their identities without repeating either.

**Why:** Invoice authorization and local linking are separate failure points. Without a durable pre-authorization claim, a process interruption can emit a duplicate fiscal document; with more than one Caja writer, recovery and normal linking can duplicate income.

**How to apply:** Keep the SPA account, SPA payment, Caja movement, and folio movements in one transaction when closing. Persist immutable invoice number, recipient, items, total, payment method, and SPA account before ARCA; resume that same claim after failure. Expose pending authorization and pending link states to operators. Duplicate-draft review decisions and their audit row must commit atomically; any later ARCA resume requires a server-validated, draft-specific written confirmation.

Existing-payment invoicing and new collection require distinct funding modes with one shared availability ledger. A fiscal retry or final link must never treat an existing paid folio as permission to create another full-value receipt.

**Why:** The user requires SPA to invoice recorded collections without duplicating Caja, using the same funding guarantees as reservation Folio corrections.

**How to apply:** Reserve identified payment applications before fiscal authorization, retain them through ambiguous outcomes, and finalize existing-only invoicing without new payments, Caja movements, or folio payment entries.

After CAE authorization or an ambiguous fiscal result, holds remain owned by the same durable operation until reconciliation. Age, timeout or a failed local link never releases them automatically.

**Why:** The user explicitly requires post-CAE recovery without issuing or collecting again; releasing the holds would let another operation spend an already-authorized invoice's funding.

**How to apply:** Recover the same fiscal claim, keep its snapshot immutable, and complete the same idempotent finalizer. An abort requires positive terminal rejection evidence and no unresolved new-money intent.

Synthetic PostgreSQL proofs and a prepared SPA interface do not authorize enabling the operational funding flow. Real fiscal recovery, validated document preparation/history adoption, transaction-bound stock and real authorization must be connected and verified first.

**Why:** The user explicitly requires all unconnected real dependencies to remain pending and blocked; a review handoff or branch push must not silently turn a demo into an operational circuit.

**How to apply:** Keep operational mounting disabled and reject missing bindings. Never substitute the synthetic gateway, permissive demo actor, invented fiscal documents or no-op stock callback in a real flow.