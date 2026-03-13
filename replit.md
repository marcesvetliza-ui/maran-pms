# Maran Suite System - Hotel Management System

## Overview
Maran Suite System is a comprehensive full-stack hospitality management suite for Maran Suites & Towers, a 66-room hotel. Developed in Spanish and adhering to Material Design, it aims to be a modular commercial product. The system unifies various hotel operations including guest services, reservations, and internal management, providing a central dashboard and modules for Restaurant POS, SPA, Events, Housekeeping, Maintenance, Inventory, and Administration. Its core purpose is to streamline hotel management, enhance guest experience, and provide robust operational control.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript.
- **Routing**: Wouter.
- **State Management**: TanStack React Query.
- **UI Components**: shadcn/ui library built on Radix UI primitives.
- **Styling**: Tailwind CSS with CSS variables for theme support (light/dark mode).
- **Build Tool**: Vite.

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript (ESM modules).
- **API Style**: RESTful JSON API.

### Data Layer
- **ORM**: Drizzle ORM for PostgreSQL via `node-postgres` (`pg`).
- **Schema**: Defined in `shared/schema.ts`, shared across client and server.
- **Validation**: Zod schemas generated from Drizzle schemas.

### Core Data Models
- **ID Strategy**: All tables use `varchar` primary keys with UUID generation.
- **Key Entities**: Room Types, Rooms, Guests, Reservations, Payments.

### Design Patterns
- **Path Aliases**: `@/*` for client, `@shared/*` for shared code.
- **API Communication**: Centralized `apiRequest` function with React Query.
- **Component Pattern**: Utilizes shadcn/ui components.
- **Theme System**: CSS variables for dynamic light/dark mode theming.

### Feature Specifications
- **Core PMS**: Enhanced bed type management, advanced search, early/late check-in/out charges, multi-step check-out, mass check-in/out, group payment.
- **Planning Calendar**: Visual calendar with color-coded reservations, drag & drop functionality for moving reservations with conflict validation, group reservation display.
- **SPA Module**: Cabin time overlap validation, inventory management, weekly planning, folio system, professional and client management.
- **Restaurant Module**: Drag & drop floor plan editor, configurable reservation slots, menu CRUD, recipe/cost calculation, bill splitting, "Fuera de menú" items.
- **Events Module**: Cancellation confirmations, room overlap validation, advanced payment folio system.
- **Financial & Payments**: Manual `baseRatePerNight` override, automatic `finalRatePerNight` calculation, separate tracking of payments and charges, multiple payment methods, split payments.
- **Guest Management**: Optional vehicle data, Guest preference CRM with stay notes and alerts.
- **System Notifications**: Internal notification system with real-time updates, chatbot and web check-in types, area-based filtering, priority levels.
- **Web Check-in**: Public mobile-first 4-step wizard for guest self check-in.
- **Group Management**: Mass check-in/out/payment, consolidated invoice, mass room assignment, printable rooming list.
- **Package Module**: Package cards with validity/discount display, quick actions.
- **Dashboards & Reports**: Executive dashboard with KPIs, YoY comparison, charts, real-time room status. Comprehensive reports module with various tabbed reports, period selectors, CSV export.
- **Cash Register & Shift Audit**: Tracks shifts, movements, closing summaries, manual movement registration, automatic payment recording.
- **Staff Help Chatbot**: Floating help button with OpenAI gpt-4o-mini powered chat, providing answers from hotel operations manual.
- **Travel Agencies Module**: CRUD for agencies, commission tracking, per-agency stats, global commission report, agency selection in reservation forms.
- **Administration Module**: Hub for financial sub-modules (Facturación, CC Empresas, CC Agencias, Comprobantes, Reportes, Caja).
- **Cuenta Corriente Module**: Tracks `account_movements` (cargo/pago/nota_credito/ajuste) per company/agency, auto-triggers on checkout, provides real-time debt totals.
- **Módulo Contable (Prompt A — DB)**: 8 tablas creadas: `accounting_suppliers` (proveedores con CUIT/alícuotas, separado de `suppliers` del inventario), `accounting_accounts` (plan de cuentas real del hotel, 51 cuentas), `purchase_invoices` (facturas FACT-A/B/C, NC, resúmenes bancarios, liquidaciones tarjeta), `payment_orders` + `payment_order_items` (OP con retenciones), `accounting_entries` + `accounting_entry_lines` (mayor de cuentas), `iibb_retentions` (SIRCAR). Todos usan `serial` IDs. `asientoId` en `purchase_invoices` es integer simple sin FK.
- **Módulo Contable (Prompt B — Backend+Frontend)**: `server/accounting.ts` con `generarAsiento()` (asiento automático para FACT/NC/resúmenes/tarjetas) y `generarAsientoOP()` (asiento para Órdenes de Pago). API routes: `/api/accounting-suppliers` (CRUD+CC), `/api/purchase-invoices` (CRUD+filtros), `/api/payment-orders` (POST generación OP), `/api/accounting-accounts` (plan de cuentas). Frontend: `client/src/pages/accounting-suppliers.tsx` (ABM proveedores con alícuotas), `client/src/pages/purchase-invoices.tsx` (wizard 4 pasos para comprobantes, CC por proveedor, emisión de OP con retenciones). Ambas páginas accesibles desde `/admin`.
- **Historial de Cambios de Reservas**: Tabla `reservation_changelog` (id serial, reservation_id, fecha, operador, tipo, descripcion). El PATCH `/api/reservations/:id` detecta y registra automáticamente cambios de fechas, habitación, estado, tarifa, huésped y notas. Endpoints: `GET /api/reservations/:id/changelog` (historial por reserva), `GET /api/reservations/changelog/hoy` (cambios del día para cierre de caja). Frontend: tab "Historial" con color por tipo de cambio en el dialog de detalle de reserva; sección en el diálogo de cierre de turno. `parseReservationError()` helper estandariza mensajes de error (incluye overbooking 409) en todas las mutations de reserva.
- **Facturación Electrónica**: Tablas `billing_config` (emisor, punto de venta, modo ficticio/ARCA), `sales_invoices` (facturas FA/FB/FC y NC A/B con CAE, items JSONB, estado emitida/anulada), `invoice_counters` (autoincremento transaccional por tipo+PV). Backend en `server/billing/`: `billingConfig.ts` (get/update config), `fakeArca.ts` (CAE simulado 14 dígitos, vto +10 días), `arcaClient.ts` (stub preparado para ARCA real), `invoiceService.ts` (emisión con cálculo de montos IVA21/10.5/Exento/NoGravado, contador transaccional), `invoicePdf.ts` (PDF conforme AFIP con encabezado letra central, datos receptor, tabla ítems, totales, sección CAE), `routes.ts` (8 endpoints: GET/PATCH config, GET invoices+filtros, POST emitir, GET pdf, POST nota-crédito, GET next-number). Frontend `/billing` con tabs: listado de comprobantes (con KPIs período/total, badge Ficticio/ARCA, botón PDF, botón NC) y Configuración (datos emisor, toggle Modo ARCA, punto de venta). Nueva tarjeta en `/admin`. Nota de Crédito auto-genera NCA/NCB y marca la factura original como anulada.
- **Módulo Contable (Prompt D — Caja de Administración)**: 3 tablas: `admin_cash_movements` (movimientos individuales con tipo/signo/concepto/vinculo a OPs/areas), `admin_cash_arqueos` (un arqueo por día, unique en fecha), `admin_cash_config` (fondo fijo + alerta). Backend en `server/adminCash.ts`: `GET/POST /api/admin-cash/movimientos`, `PATCH /anular`, `POST /api/admin-cash/arqueo`, `GET /api/admin-cash/arqueos`, `GET|PUT /api/admin-cash/config`, `GET /api/admin-cash/saldo`, `GET /api/admin-cash/resumen-dia`, `GET /api/admin-cash/cierre-diario` (PDF), `GET /api/admin-cash/cierre-mensual` (PDF). Saldo acumulativo sin reinicio diario. Arqueo con conteo de billetes, genera ajuste automático si hay diferencia. Gastos de caja chica generan asiento contable automático. Frontend: `/admin/caja` (dashboard KPIs + lista movimientos coloreada + diálogos nuevo movimiento y arqueo) y `/admin/caja/configuracion`. Nueva tarjeta en `/admin`.
- **Reportes Gerenciales**: 7 reportes en `/admin/reportes` con menú lateral. Backend en `server/reports/routes.ts`: 7 endpoints (`/api/reports/estado-resultados`, `/kpis`, `/ocupacion`, `/ingresos`, `/costos`, `/proveedores`, `/comparativo`) + exportación PDF y Excel genérica por tipo. Fuentes de datos: `payments` (alojamiento), `restaurant_orders` (restaurant), `spa_payments` (spa), `purchase_invoices`+`accounting_accounts` (costos por código de cuenta), `admin_cash_movements` (caja chica), `reservations`+`rooms` (ocupación), `accounting_suppliers` (proveedores). Frontend en `client/src/pages/admin-reportes.tsx`: sidebar de 7 ítems + vistas individuales con Recharts (LineChart, BarChart, PieChart), heatmap de ocupación, tablas de detalle, selector de período, botones PDF/Excel. Nueva tarjeta en `/admin`.
- **Módulo Eventos (Prompt Rename+PDFs)**: "Salón Mirador" renombrado a "Salón Solárium" (seed.ts + DB UPDATE al inicio). Labels de precio con nota "(con IVA incluido)" en formular de cargos y encabezado de tabla. Nota de pie "* Todos los precios incluyen IVA (21%)." en pestaña de cargos. Dos nuevos endpoints en `server/routes.ts`: `GET /api/events/:id/pdf/hoja-funcion` (uso interno, sin precios, con servicios y cantidades) y `GET /api/events/:id/pdf/confirmacion` (para cliente, con precios+IVA y espacio de firma). PDF generators en `server/eventPdfs.ts` usando pdfkit. Botones "Hoja de Función" y "Confirmación Cliente" en el dialog de detalle de evento (visibles para todos los estados activos).
- **Módulo Contable (Prompt C — Exportaciones)**: `server/exports.ts` con todas las exportaciones contables. Página `/admin/consultas` (`client/src/pages/admin-consultas.tsx`). Exports: SIRCAR (ZIP: TXT+2 XLSX via jszip+exceljs), Listado Retenciones IIBB (PDF via pdfkit), Libro IVA Compras (Excel+2 TXT ARCA para CBTE/Alicuotas), Libro IVA Ventas (Excel+2 TXT ARCA), Mayor de Cuentas Totalizado/Detallado (PDF), Orden de Pago (PDF por ID desde `/api/payment-orders/:id/pdf`), Certificado Retención Ganancias (PDF), Cuenta Corriente Proveedores (PDF). Post-OP-emisión: botones "OP PDF" y "Cert. Retención" en el dialog de purchase-invoices.

### Authentication & Authorization
- **Strategy**: Passport.js with local strategy.
- **Password Hashing**: bcrypt.
- **Session Store**: `connect-pg-simple` storing sessions in PostgreSQL (8-hour duration).
- **Protected Routes**: All `/api/*` routes require authentication except public and specific auth routes.
- **Role-Based Access**: Admin-only routes for system management.

## External Dependencies

### Database
- **PostgreSQL**: Primary relational database.
- **Drizzle ORM**: Type-safe ORM for PostgreSQL.

### UI Frameworks & Libraries
- **Radix UI**: Accessible component primitives.
- **shadcn/ui**: Re-usable components built on Radix UI and Tailwind CSS.
- **Lucide React**: Icon library.

### Key Libraries
- **TanStack React Query**: Server state management and caching.
- **date-fns**: Date manipulation utility.
- **Zod**: Schema declaration and validation.
- **class-variance-authority**: Utility for managing component variants.

### Development Tools
- **Vite**: Frontend build tool and development server.
- **esbuild**: Fast bundling in production.
- **TypeScript**: Type safety across the stack.

### Important Implementation Notes
- **Timezone**: Frontend uses `getLocalToday()`/`toArgentinaDateStr()` from `@/lib/utils`; Server uses `getArgentinaToday()` from `server/db-storage.ts`
- **ID Strategy**: `bedTypeId` is varchar/UUID — must NOT use parseInt/Number()
- **isEditable/isActive stored as string**: Compare with `=== "true"` (not boolean)
- **Precios bloqueados**: Los precios NO se pueden modificar al cargar — vienen del catálogo/tarifa correspondiente. Cada área tiene un ítem especial para cargos libres: Hotel/SPA = "Cargo editable", Restaurant/Eventos = "Fuera de menú" (isEditable flag)
- **Reservas cerradas bloqueadas**: Las reservas con status checked_out/cancelled cuya fecha de referencia (checkOutDate o checkInDate) sea anterior a hoy quedan en solo lectura. Backend rechaza con 403 en PATCH/DELETE/cancel/charges/payments. Frontend oculta botones de edición y muestra banner "Reserva cerrada"
- **Safe updates**: Todos los métodos `update*` en `db-storage.ts` filtran campos protegidos (id, createdAt, códigos) y valores undefined
- **DB push**: Use `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE...ADD COLUMN IF NOT EXISTS` via `refreshRealData()` in `server/seed.ts`
- **Anulación pattern (Motor Transaccional)**: Charges/payments/spaPayments/eventPayments use `status='anulado'`; cashMovements uses `anulado=true` (boolean). PATCH endpoints: `/api/charges/:id/anular`, `/api/payments/:id/anular`, `/api/spa/payments/:id/anular`, `/api/events/:id/payments/:payId/anular`, `/api/cash/movements/:id/anular`. All DELETE endpoints deprecated (console.warn). Frontend shows anulados with strikethrough + "ANULADO" badge, red Ban icon button triggers AnularDialog with optional motivo. `GET /api/reservations/:id/charges?includeAnulados=true` returns all charges. `getCharges()` filters `status='active'` in queries; use `getAllChargesIncludingAnulados()` for display.