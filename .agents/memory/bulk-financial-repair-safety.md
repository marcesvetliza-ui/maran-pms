---
name: Bulk financial repair safety
description: Safety requirements for historical reconciliation or repair actions that can create financial movements.
---

Do not expose a mutating historical financial reconciliation as a direct one-click action. It must first produce a read-only preview, require explicit confirmation with counts and totals, and tag every resulting row with a durable repair-batch identity and actor.

**Why:** A checkout-debt reconciliation interpreted historical reservation balances as missing Cuenta Corriente debt and created hundreds of synthetic cargos in one execution. Description-based duplicate checks were not enough to prove that the debt was real.

**How to apply:** Historical financial repairs must be narrowly scoped, auditable, idempotent, and exactly reversible by batch. Prefer a reviewed migration or admin workflow with dry-run output; never infer debt from reconstructed historical balances alone.