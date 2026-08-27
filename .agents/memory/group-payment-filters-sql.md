---
name: Group payments report SQL-level filters
description: How groupId/status filtering and the group dropdown options are split across two endpoints in the Reportes > Grupos "Pagos de Grupos" view
---

`GET /api/reports/group-payments` accepts optional `groupId`/`status` query params and filters at the SQL level (server/db-storage.ts `getReportGroupPayments`), not client-side, so a long date range doesn't require downloading every row before narrowing it down.

The "Grupo" filter dropdown is populated from a **separate** endpoint, `GET /api/reports/group-payments/groups` (`getReportGroupPaymentsGroupOptions`), scoped only by date range — never by the currently selected groupId/status. This is intentional: if the dropdown were derived from the (now server-filtered) main query's results, picking a status would shrink the list of selectable groups.

**Why:** keeps both the row list and the filter UI correct and cheap at once — filtering avoids downloading every payment, and the separate distinct-groups query avoids the dropdown depending on (and being limited by) whatever filter is currently applied.

**How to apply:** if you add more report-level filters here, decide per-filter whether it should participate in the main data query, the options query, or both — don't assume one query can serve both purposes.
