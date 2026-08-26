---
name: Cost centers, chart of accounts, and departmental reports
description: How adding a new expense cost-center/department (e.g. Eventos) actually flows through the accounting reports, and where the plan of accounts must be seeded
---

**Costos por Departamento" report groups by `accounting_accounts.codigo` prefix, NOT by the purchase invoice's `centro_costo` field.** `centro_costo` (free-text, hardcoded dropdown in `client/src/pages/purchase-invoices.tsx`) is informational only and unused by any report as of Aug 2026. To make a new department/area show up in that report, its expense accounts must live under a new `accounting_accounts.codigo` prefix that a `DEPTOS` entry in `server/reports/routes.ts` matches — not just adding a `centro_costo` option.

**Why:** discovered while adding "Eventos" as a cost center — adding it only to the `CENTROS_COSTO` dropdown would have had zero effect on any report; the actual wiring is account-code based.

**How to apply:** to add a new department/cost-center end to end:
1. Pick an unused `accounting_accounts.codigo` prefix family (check gaps in the existing `4.2.1.08.xx` sequence) and add the new account rows via the admin screen at `/admin/accounting-accounts` (no code/redeploy needed as of Aug 2026 — backed by `server/routes.ts` POST/PATCH `/api/accounting-accounts`).
2. `centro_costo` on purchase invoices is now a managed list too (`cost_centers` table, admin screen at `/admin/cost-centers`, routes in `server/routes/cost-centers.ts`) instead of a hardcoded array in `purchase-invoices.tsx` — add/deactivate values there, no code change needed.
3. Still requires a code change: add a `DEPTOS` entry (name + prefix list) in `server/reports/routes.ts`'s "Costos por Departamento" handler, since that grouping is hardcoded by account-code prefix, not read from any table. Both new admin screens display banners/helper text warning that `centro_costo` does not drive this report.
4. If the department also earns revenue and should appear in "Ingresos por Área" (`/api/reports/ingresos`), add a dedicated `ingresosXxx()` helper querying that area's own payments table and wire it into the `areas` array, `total`, and the `porDia` day-series query — both the KPI cards and donut chart there are already generic over the `areas` array, but the daily evolution `<LineChart>` in `client/src/pages/admin-reportes.tsx` hardcodes one `<Line dataKey=...>` per area and needs a new line added manually.
