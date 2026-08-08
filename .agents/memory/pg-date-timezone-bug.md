---
name: pg date columns timezone bug
description: node-postgres returns date columns as Date objects (midnight UTC), causing UTC-3 offset — dates shift to previous day on client side.
---

## Rule

`pg.types.setTypeParser(1082, (val) => val)` must be set in `server/db.ts` before the pool is created.

PostgreSQL OID 1082 = `date` type. Without this, `node-postgres` returns `date` columns as JavaScript `Date` objects set to midnight UTC (e.g., `2026-08-08T00:00:00.000Z`).

In Argentina (UTC-3), `parseISO("2026-08-08T00:00:00.000Z")` = Aug 7 at 21:00 local — so `isSameDay()` and `format()` comparisons on the client show the wrong day or return false.

**Why:** This silently broke the SPA turnera — appointments existed in the DB but were never shown on the agenda grid because `isSameDay(parseISO(apt.appointmentDate), selectedDate)` always returned false.

**How to apply:** The fix is already in `server/db.ts`. If this file is ever regenerated or the pool config is moved, ensure the type parser call is preserved BEFORE the Pool constructor. Any `date()` column in the Drizzle schema is affected — not just spa_appointments.

## Context

- OID 1082 = PostgreSQL `date` type
- OID 1114 = `timestamp without time zone` (also returns as Date by default, but code uses full ISO strings for these so it usually works)
- The fix returns plain `"YYYY-MM-DD"` strings, which is what `parseISO()` and Drizzle string comparisons already expect
