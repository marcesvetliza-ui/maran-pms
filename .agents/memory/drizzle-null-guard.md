---
name: Drizzle NULL guard pattern
description: How to correctly exclude rows matching a LIKE pattern on a nullable column in Drizzle/PostgreSQL.
---

**Problem:** `NOT (col ILIKE 'pattern%')` in SQL evaluates to NULL when `col IS NULL`, which fails the WHERE clause — effectively excluding all NULL rows.

**Correct pattern:**
```typescript
// Wrong — excludes rows where col IS NULL
not(ilike(col, 'pattern%'))

// Correct — keeps NULLs, excludes only matching non-NULLs
or(isNull(col), not(ilike(col, 'pattern%')))
```

**Applied in:** `getGuests()` and `searchGuests()` in `server/db-storage.ts` to filter out GROUP-prefixed placeholder guest records while keeping all real guests (who have `codigo = NULL`).

**Imports needed:** `isNull`, `not`, `ilike`, `or` from `drizzle-orm` — `isNull` is already imported in db-storage.ts; `isNotNull` is not, so use `not(isNull(col))` if needed.
