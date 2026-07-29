---
name: Gastronomic Colobig feature status
description: Status of 10 gastronomic system features recommended by consultant Colobig (July 2026). What's built, what already existed, what was skipped.
---

## Feature status

| Feature | Status | Notes |
|---|---|---|
| P1 Toma de Inventario | **DONE** | `inventory_counts` + `inventory_count_items` tables; full CRUD routes; tab in inventory.tsx; dialog + detail view with expected vs actual; close applies `ajuste` stock movements |
| P2 Control de Desvíos | **Existed** | `admin-reportes.tsx` → "Control de Desvíos" section; endpoint `/api/restaurant/reports/desvios`; theoretical (recipe × sales) vs real (stock movements) |
| P3 Mermas | **Existed** | `merma` field in recipe_ingredients; formula `grossQty = qty / (1 - merma/100)` |
| P4 Desperdicios | **Skipped** | Use existing voucher flow |
| P5 Dashboard KPIs gastronómicos | **Existed** | KPI cards in "Ventas Restaurant" + "Food Cost Restaurant" sections of admin-reportes.tsx |
| P6 Venta por Mozo | **DONE** | `waiterName` already in schema + mandatory in order creation UI; added `porMozo` array to `/api/restaurant/reports/sales-stats` response + table in VentasRestaurantReport |
| P7 Factor de conversión | **Skipped** | Operator enters values in base unit manually |
| P8 Eventos → stock | **Skipped** | Use existing voucher flow |
| P9 Food Cost del período | **Existed** | `admin-reportes.tsx` → "Food Cost Restaurant" section; endpoint `/api/restaurant/reports/food-cost?periodo=MM/YYYY` |
| P10 Consumo desayunos | **Skipped** | Use existing voucher flow |

## Key schema details (Toma de Inventario)

- `inventory_counts`: id, date, area (nullable), notes, status ('borrador'/'cerrado'), created_by, created_at, closed_at, closed_by
- `inventory_count_items`: id, count_id, item_id, item_name, unit, expected_stock, actual_stock (nullable), notes

**Why:** Tables added via `server/migrate.ts` incremental block (Railway production requirement).

## Close logic

For each item where `actual_stock IS NOT NULL` and `|actual - expected| > 0.001`:
1. Insert `stock_movements` row with `movement_type = 'ajuste'`, `source_type = 'inventory_count'`
2. Update `inventory_items.current_stock` with the adjusted value

## porMozo aggregation

Added to the existing `sales-stats` endpoint (not a separate route). Loop over closed orders, group by `o.waiterName || "Sin asignar"`, accumulate revenue/ordenes/cubiertos. Returns: `{ mozo, revenue, ordenes, cubiertos, ticketPromedio, pct }[]` sorted by revenue DESC.

**Why:** Reusing the existing endpoint avoids a separate query and keeps the UI simpler (one request per period).
