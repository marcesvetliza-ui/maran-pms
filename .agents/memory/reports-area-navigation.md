---
name: Reports module area-based navigation
description: How the Reportes module is organized by business area, and how new area reports (Spa, Eventos) were added.
---

The main "Reportes" page (`client/src/pages/reports.tsx`) is organized with an area selector row (Hotelería, Restaurant, Spa, Eventos, Operaciones, Administración) above the existing Tabs component. Each area shows only the TabsTrigger/TabsContent pairs relevant to it; all report content stays in the same file (no separate route per area) to avoid a risky full rewrite. `/admin-reportes` remains the separate "Gerencial" financial reports page (Estado de Resultados, KPIs, etc.) — not merged in.

**Why:** The 8-area structure requested by the user mirrors the sellable-module breakdown in replit.md. A full merge/rewrite of reports.tsx + admin-reportes.tsx was judged too risky/large for one pass; grouping the existing 11 tabs by area plus adding new Spa/Eventos tabs delivered the reorg with low regression risk.

**How to apply:** When adding a new report, an area in `AREA_TABS` can hold multiple tabs (e.g. Restaurant now has "restaurant" + "restaurant-cmv", Operaciones has "housekeeping" + "housekeeping-productivity" + "maintenance" + "inventory") — add a backend endpoint under `/api/reports/<name>` in `server/reports/routes.ts` (periodo-based `MM/YYYY` query param, role-gated per module role), then add the tab value to the relevant area's `tabs` array plus its own TabsTrigger/TabsContent block reusing `formatARS`/`LoadingSkeleton` helpers.

All originally identified gaps are now filled: Spa, Eventos, Mantenimiento, Inventario, Restaurant CMV/food-cost (via recipes + recipe_ingredients unitCost), Housekeeping productivity per camarera (housekeeping_tasks.assignedTo), and Hotelería Pronóstico/Pickup (upcoming reservations by check-in date) + cancelaciones recientes (from `cancelled_reservation_logs`, which already existed and didn't need a schema change). True no-show tracking / "reserva sin garantía" is still NOT buildable — the reservations status enum has no such states and would need a schema change; this remains the one unaddressed item from the original wishlist.

**Gotcha:** the `rooms` table's number column is `room_number`, not `number` — raw SQL joins referencing room numbers must use `r.room_number` or they fail at runtime (not caught by TypeScript since these were raw `db.execute(sql\`...\`)` queries).

A "Grupos" area (tab "group-payments") was added showing payments across all groups, via GET /api/reports/group-payments (storage.getReportGroupPayments). It reuses the same row renderer as the per-group view instead of duplicating it — see group-row-renderer-sharing.md.
