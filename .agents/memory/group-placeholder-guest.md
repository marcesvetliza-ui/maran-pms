---
name: Group placeholder guest pattern
description: How auto-assigned group reservations use a placeholder guest and how to filter them from normal guest lists/search.
---

When a group block is created, the system auto-assigns available rooms and creates real reservations pointing to a single "placeholder" guest per group.

**Identification:** The placeholder guest has `codigo = "GROUP-{groupId}"`, `firstName = group.name`, `lastName = ""`.

**Creation:** `getOrCreatePlaceholderGuest(groupId, groupName)` in `server/routes/groups.ts` — does a SELECT first to avoid duplicates.

**Filtering from guest lists:** Use `or(isNull(guests.codigo), not(ilike(guests.codigo, 'GROUP-%')))` — NOT just `not(ilike(...))` because that would exclude real guests with NULL codigo.

**Assignment flow:**
- `PATCH /api/groups/:groupId/placeholder-reservations/:reservationId` replaces the placeholder guestId with a real guest.
- Optionally changes roomId (checks overbooking, swaps room status).
- Never reuses a placeholder guest when looking up by name — checks `!existingGuest.codigo?.startsWith("GROUP-")`.

**Block deletion:** Cancels excess placeholder reservations (those beyond remaining block capacity for that room type) and frees their rooms.

**Why:** Allows the planning calendar to show group room blocks immediately after block creation, without waiting for individual passenger assignment.
