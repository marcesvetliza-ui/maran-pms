---
name: Puntos de Venta (POS) system
description: How the multi-POS system works across billing, restaurant, and the ABM config page.
---

## Rule
`NewInvoiceData.puntoVentaOverride?: number` — when provided, overrides the global `billing_config.puntoVenta`. All three restaurant `emitirFactura` call sites accept `puntoVenta` from the request body and pass it as `puntoVentaOverride`.

**Why:** The hotel has 4 POS numbers — 2 electronic (ARCA-authorized for FA/FB/FC) and 2 manual. Previously the system used a single global PV from `billing_config`. Multi-POS is needed so each area (recepción, restaurant, spa, eventos) can issue invoices with its own authorized PV number.

## How to apply
- `server/billing/invoiceService.ts`: `puntoVenta = data.puntoVentaOverride ?? (homolog ? 99 : config.puntoVenta)` at line ~147.
- `server/billing/routes.ts`: POST `/api/billing/invoices` reads `puntoVenta` from body → `puntoVentaOverride`.
- `server/routes/restaurant.ts`: all 3 close endpoints (close, split/:splitId, pay-items) destructure `puntoVenta: pvOverride` and pass `puntoVentaOverride`.
- `server/routes/pos-configs.ts`: full CRUD; registered in `server/routes.ts`.
- Frontend selector in `billing.tsx` (EmitirFacturaDialog) and `restaurant.tsx` (close dialog, factura_a/b/c section) — filters to `activo && tipo === "electronico"`.
- ABM page at `/pos-configs`, linked from Configuración sidebar with `Store` icon.
- Default seed: PV 1 Recepción (electronico), PV 2 Restaurant (electronico), PV 3 SPA (manual), PV 4 Eventos (manual).
