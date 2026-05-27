---
name: Planning guestName leading space bug
description: Why planning cells showed blank text for guests with empty lastName, and the fix.
---

**Root cause:** `guestName` was built as `` `${guest.lastName} ${guest.firstName}` `` without `.trim()`. When `lastName = ""`, result is `" FIRSTNAME"` with a leading space.

The planning cell then does `guestName.split(" ")[0]` to show only the first word. `" FIRSTNAME".split(" ")` = `["", "FIRSTNAME"]`, so `[0]` = `""` → blank cell.

**Fix:** Add `.trim()` in the planning data builder in `server/db-storage.ts`:
```typescript
guestName: guest ? `${guest.lastName} ${guest.firstName}`.trim() : "(Sin huésped)"
```

**Applies to:** Any guest with empty `lastName` — not just group placeholders. Always trim this concatenation.
