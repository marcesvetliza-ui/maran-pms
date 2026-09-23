---
name: Direct CC receipt voiding
description: Scope and accounting invariants for voiding direct Cuenta Corriente receipts.
---

Voiding applies only to direct company, agency, or guest Cuenta Corriente receipts. Keep the original receipt and number immutable, store who voided it, when, and why, and create one idempotent accounting reversal for the exact original amount, including retentions. Preserve allocations as audited voided rows rather than deleting them.

**Why:** Reservation, group, Caja, and fiscal documents have separate settlement lifecycles. Mixing those flows into direct-receipt voiding can duplicate reversals, alter historical receipt identity, or change fiscal/cash records.

**How to apply:** Any future receipt action, report, PDF, or allocation query must distinguish direct CC receipts from linked payments. Active collection reports exclude the voided original and its reversal, while ledgers retain both for audit.