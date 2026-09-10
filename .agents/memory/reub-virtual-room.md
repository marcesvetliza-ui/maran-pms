---
name: REUB virtual Planning row
description: Business role and metric exclusions for the Planning staging row named REUB
---

REUB is a persistent virtual Planning row used for relocations, waiting reservations, and operational notes. It appears in yellow below Notas and can hold reservations temporarily, but it is never a sellable physical room.

**Why:** The user confirmed REUB is operational workspace, not hotel inventory. Removing its database row made it disappear, while counting it or its reservations would corrupt occupancy and revenue metrics.

**How to apply:** Preserve REUB across migrations and refreshes with its virtual marker. Exclude virtual/inactive rooms and REUB from every room-count, occupancy, availability, revenue, ADR, and RevPAR calculation while still returning it in Planning data. Render REUB as the first row of `<tbody>`, never inside the sticky `<thead>`: Safari otherwise shifts date cells into the Notes row.