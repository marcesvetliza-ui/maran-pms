---
name: MAX(jsonb) bulk-enrich pattern
description: PostgreSQL has no MAX(jsonb) function; all enrichXxxBulk queries must cast to text for the aggregate and back to jsonb.
---

## Rule

Any `enrichXxxBulk` helper that uses `MAX(CASE WHEN ... THEN jsonb_build_object(...) END)` must cast:

```sql
MAX(CASE WHEN x.id IS NOT NULL THEN jsonb_build_object(...)::text END)::jsonb AS col
```

Without the `::text` cast, PostgreSQL throws `function max(jsonb) does not exist` and the GET endpoint returns 500, leaving the frontend with an empty array and nothing rendered.

**Why:** PostgreSQL only supports `MAX()` on types with a btree comparator. `jsonb` has no default `<` operator for aggregation. Casting to `text` makes MAX work (lexicographic, but irrelevant since each row has at most one match in a LEFT JOIN), then casting back to `jsonb` preserves the expected type.

**How to apply:** Any time a new bulk-enrich query is written with GROUP BY + LEFT JOIN + MAX(jsonb_build_object(...)), apply the `::text`/`::jsonb` wrapping. Fixed in: `enrichRestaurantOrdersBulk` (Aug 7 2026), `enrichSpaAppointmentsBulk` (Aug 8 2026).
