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

Authorization to develop operational bindings is not authorization to access
operational data, enable routes/UI, migrate history, emit real invoices or deploy.

**Why:** The user explicitly separated isolated binding development and synthetic
verification from a later joint Codex review and activation decision.

**How to apply:** Keep work on the separately authorized branch and preserve Codex's
client ownership. Propose and agree additions to its contract before connecting
them. Treat homologation connectivity and complex historical evidence as separate
verification requirements, never as consequences of a green synthetic suite.

Fiscal numbering must coordinate with every writer in the same series, including
legacy emission for another account; scope-only locking is insufficient.

**Why:** Different scopes can both choose the same next ARCA number. A durable
unknown claim must also prevent another writer from taking that number or
interpreting its authorization as a different customer's invoice.

**How to apply:** Serialize series allocation, persist identity before sending,
block legacy issuance behind unresolved claims and validate the consulted
recipient/date/amount/currency, not merely the presence of a CAE.

A pooled fiscal lock owner must not depend on borrowing another connection from
the same bounded pool. Same-series contention must not fill the pool with
advisory-lock waiters.

**Why:** Independent review reproduced self-exhaustion with concurrent legacy
issuers even while funding mounting was disabled. A lock alone does not prove
safe coordination if its holder cannot complete its own database work.

**How to apply:** Keep fiscal SQL, WSAA persistence and number allocation on the
already owned client; reject series contention without waiting on a pooled
connection. Test bounded capacity across different series and exclusion on the
same series, including the legacy path when funding is disabled.

Fiscal recovery fixtures must reflect the consultation schema, not reuse the
authorization response shape.

**Why:** Green recovery tests hid a parser that accepted authorization fields
but could not recognize ARCA's actual query response. Conservative holds prevent
duplicate collection but do not by themselves prove recoverability.

**How to apply:** Require exact SOAP/WSFE structure and the persisted identity;
reject missing/contradictory evidence and never invent fiscal expiry dates.
Exercise post-CAE recovery through the concrete parser as well as the SQL engine.

WSAA ticket persistence must commit independently BEFORE any financial
transaction that can reject numbering or roll back a fiscal draft.

**Why:** Issuing an external ticket cannot be rolled back. Losing its local
cache on a later financial failure can leave a valid remote ticket unavailable,
and another login can be rejected as already authenticated.

**How to apply:** Reuse one pool loan across separate authentication and
financial transactions, committing the durable cache first. Coordinate refresh
without nested pool loans, and prove reuse after rollback with fresh instances,
not only with an in-memory token. A failure before that first durable commit
cannot be advertised as solved by a subsequent financial retry.