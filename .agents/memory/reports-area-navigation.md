---
name: Reports module area-based navigation
description: How the Reportes module is organized by business area, and how new area reports (Spa, Eventos) were added.
---

The main "Reportes" page (`client/src/pages/reports.tsx`) is organized with an area selector row (Hotelería, Restaurant, Spa, Eventos, Operaciones, Administración) above the existing Tabs component. Each area shows only the TabsTrigger/TabsContent pairs relevant to it; all report content stays in the same file (no separate route per area) to avoid a risky full rewrite. `/admin-reportes` remains the separate "Gerencial" financial reports page (Estado de Resultados, KPIs, etc.) — not merged in.

**Why:** The 8-area structure requested by the user mirrors the sellable-module breakdown in replit.md. A full merge/rewrite of reports.tsx + admin-reportes.tsx was judged too risky/large for one pass; grouping the existing 11 tabs by area plus adding new Spa/Eventos tabs delivered the reorg with low regression risk.

**How to apply:** When adding a new report for an area not yet covered, follow the same pattern used for Spa/Eventos/Mantenimiento/Inventario: add a backend endpoint under `/api/reports/<area>` in `server/reports/routes.ts` (periodo-based `MM/YYYY` query param, role-gated), then add an area entry to `AREA_TABS` in reports.tsx with its own TabsTrigger/TabsContent block reusing `formatARS`/`LoadingSkeleton` helpers already in that file. Mantenimiento (work_orders) and Inventario (inventory_items/stock_movements) reports were added and are done. Remaining gaps: Restaurant food-cost/CMV, Housekeeping productivity per maid, Hotelería forecast/pickup/no-show/unguaranteed-reservation reports (reservations schema has no guarantee field).

**Gotcha:** the `rooms` table's number column is `room_number`, not `number` — raw SQL joins referencing room numbers must use `r.room_number` or they fail at runtime (not caught by TypeScript since these were raw `db.execute(sql\`...\`)` queries).
