---
name: Reusable dialog query refresh
description: Preventing stale or failed React Query data from silently hiding controls in dialogs that remain mounted.
---

When a dialog remains mounted while closed, queries scoped to its open state must explicitly refresh on every opening. Do not rely solely on toggling `enabled`, because a recently cached empty or failed response can be reused.

**Why:** Optional controls can disappear without feedback when their rendering depends on a non-empty query result. The user then cannot distinguish “there are no options” from “the request did not refresh.”

**How to apply:** On dialog opening, call the query refetch method. Keep the control visible while loading, and present a retry action plus an explicit empty state when the request fails or returns no valid options.