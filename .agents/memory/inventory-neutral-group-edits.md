---
name: Inventory-neutral group edits
description: When group inventory validation should not block an edit that leaves lodging demand unchanged.
---

Changing only the real guest attached to an existing group placeholder must not revalidate or increase lodging inventory. Inventory guards remain mandatory when room type, stay dates, status, block quantity, or other demand-changing fields change.

**Why:** Staff need to replace a placeholder guest on an already assigned physical room even when unrelated historical group data has an inventory shortage. Blocking that edit prevents completing the rooming list without reducing overbooking risk.

**How to apply:** Classify group and reservation mutations by their effective inventory impact. Guest/name-only edits bypass aggregate inventory validation; physical room overlap and group inventory validation remain enforced for room moves and demand-changing mutations.