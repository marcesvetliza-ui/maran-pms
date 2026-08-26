---
name: PostgreSQL lock observability
description: Managed PostgreSQL can hide query text in pg_stat_activity while still exposing lock wait events.
---

For integration tests that coordinate real concurrent transactions, detect a waiting transaction using `pg_stat_activity.wait_event_type = 'Lock'` rather than matching its query text.

**Why:** The managed development PostgreSQL instance can return an empty `query` and a `disabled` state for another session even while it is genuinely waiting on a row lock. Filtering by the SQL text makes a valid concurrency test time out falsely.

**How to apply:** Keep integration-test records uniquely identifiable and use the lock event count only as a synchronization barrier. Do not use this observation to inspect application queries or user data.