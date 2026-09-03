---
name: Group structure financial lock
description: Why group blocks and room links become immutable after payments or fiscal documents exist.
---

Once a group has a payment or fiscal document, do not allow room-block deletion or room unlinking. The complete structural operation must serialize on the same group lock used by collections and commit reservation, room, block, and link changes atomically.

**Why:** Blocks and room links define the allocation and fiscal-source history. Removing and recreating them after receiving money can conceal advances, reset balances, or make the historical distribution impossible to audit.

**How to apply:** Recheck financial activity while holding the group lock, return a clear conflict response, and perform every related structural mutation in that same transaction. Client-side hiding or a preflight check alone is insufficient.