---
name: Group structure financial lock
description: Why group blocks and room links become immutable after payments or fiscal documents exist.
---

Once a group has a payment or fiscal document, do not allow room-block deletion or room unlinking. The complete structural operation must serialize on the same group lock used by collections and commit reservation, room, block, and link changes atomically.

**Why:** Blocks and room links define the allocation and fiscal-source history. Removing and recreating them after receiving money can conceal advances, reset balances, or make the historical distribution impossible to audit.

**How to apply:** Recheck financial activity while holding the group lock, return a clear conflict response, and perform every related structural mutation in that same transaction. Client-side hiding or a preflight check alone is insufficient.
**Controlled assignment release (November 2026):** The user approved replacing a pre-arrival passenger while preserving the group's contracted quantity and lodging price. `groupAssignmentRelease.ts` keeps the original block AND cancelled reservation link, creates a vacant same-room placeholder with frozen pricing, and releases only verified receipt applications into `__unassigned__`. It never uses the destructive unlink route. Personal money requires explicit consent and durable source linkage; Caja is not collected again. The whole operation and audit commit under the group/reservation/inventory locks. A released historical reservation cannot be reopened or receive late payments/charges; use its replacement slot. Affected/ambiguous financial obligations require reconciliation; unrelated provably scoped invoices do not impose a blanket veto.
