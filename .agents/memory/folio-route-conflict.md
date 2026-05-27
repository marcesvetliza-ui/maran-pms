---
name: Folio PDF route conflict
description: Why group-specific folio routes must use /api/groups/... prefix, not /api/folios/...
---

`server/routes/folios.ts` registers `/api/folios/:entityType/:entityId/pdf` which matches ANY 3-segment path like `/api/folios/groups/{groupId}/pdf`.

**Rule:** All group-specific endpoints (including folio PDFs for groups) must live under `/api/groups/...` prefix, e.g. `/api/groups/:groupId/master-folio/pdf`. Never use the generic folio route pattern for group resources.

**Why:** Express route matching is first-match-wins; the generic folios route fires before any group-specific route registered later.
