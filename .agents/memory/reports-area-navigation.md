---
name: Reports module area-based navigation
description: How the Reportes module is organized by business area, and how new area reports (Spa, Eventos) were added.
---

The main "Reportes" page (`client/src/pages/reports.tsx`) is organized with an area selector row (Hotelería, Restaurant, Spa, Eventos, Operaciones, Administración) above the existing Tabs component. Each area shows only the TabsTrigger/TabsContent pairs relevant to it; all report content stays in the same file (no separate route per area) to avoid a risky full rewrite. `/admin-reportes` remains the separate "Gerencial" financial reports page (Estado de Resultados, KPIs, etc.) — not merged in.

**Why:** The 8-area structure requested by the user mirrors the sellable-module breakdown in replit.md. A full merge/rewrite of reports.tsx + admin-reportes.tsx was judged too risky/large for one pass; grouping the existing 11 tabs by area plus adding new Spa/Eventos tabs delivered the reorg with low regression risk.

**How to apply:** When adding a new report for an area not yet covered (Mantenimiento, Inventario), follow the same pattern used for Spa/Eventos: add a backend endpoint under `/api/reports/<area>` in `server/reports/routes.ts` (periodo-based `MM/YYYY` query param, role-gated), then add an area entry to `AREA_TABS` in reports.tsx with its own TabsTrigger/TabsContent block reusing `formatARS`/`LoadingSkeleton` helpers already in that file. Known remaining gaps from the user's requested report list: Mantenimiento (no dedicated report yet, only rolled into cost dept report), Inventario (no stock/rotation reports), Restaurant food-cost/CMV, Housekeeping productivity per maid, Hotelería forecast/pickup/no-show/unguaranteed-reservation reports (reservations schema has no guarantee field).
