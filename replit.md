# Maran Suite System - Hotel Management System

## Overview
Maran Suite System is a comprehensive full-stack hospitality management suite for Maran Suites & Towers, a 66-room hotel. The system aims to be a modular commercial product, unifying various hotel operations including guest services, reservations, and internal management. It provides a central dashboard and modules for Restaurant POS, SPA, Events, Housekeeping, Maintenance, Inventory, and Administration. Its core purpose is to streamline hotel management, enhance guest experience, and provide robust operational control. The system is developed in Spanish and adheres to Material Design principles.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, using Vite as the build tool.
- **Routing**: Wouter.
- **State Management**: TanStack React Query.
- **UI Components**: shadcn/ui library built on Radix UI primitives.
- **Styling**: Tailwind CSS with CSS variables for dynamic theme support (light/dark mode).

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript (ESM modules).
- **API Style**: RESTful JSON API.

### Data Layer
- **ORM**: Drizzle ORM for PostgreSQL via `node-postgres` (`pg`).
- **Schema**: Defined in `shared/schema.ts`, shared across client and server, with Zod validation.
- **ID Strategy**: All tables use `varchar` primary keys with UUID generation.
- **Key Entities**: Room Types, Rooms, Guests, Reservations, Payments.

### Backend Routes Architecture
- **Modular structure**: `server/routes.ts` (main, ~1792 lines) delegates to sub-modules in `server/routes/`
- **Extracted modules**: `hospitality.ts`, `ota.ts`, `planning.ts`, `packages.ts`, `rooms.ts`, `guests.ts`, `reservations.ts`, `groups.ts`, `housekeeping.ts`, `restaurant.ts`, `inventory.ts`, `spa.ts`, `events.ts`, `maintenance.ts`
- **Remaining in routes.ts**: Auth, dashboard, admin (users/settings/audit), notifications, chatbot, web check-in, cash register, executive stats, reports (basic), accounting suppliers, purchase invoices

### Authentication & Authorization
- **Strategy**: Passport.js with local strategy and bcrypt for password hashing.
- **Session Store**: `connect-pg-simple` storing sessions in PostgreSQL (8-hour duration).
- **Access Control**: Role-based access with protected routes for API and admin functionalities.
- **Security (Production)**: `helmet` HTTP headers, rate limiting (500 req/15min general, 10 req/15min login), `/api/auth/setup` and `/api/source/files` disabled in production.
- **Audit Logging**: `server/audit.ts` helper records critical events (login, logout, check-in, check-out, cancel, payments, rate plans, groups, cash shifts) to `audit_logs` table via `/api/admin/audit-logs`.

### Core Feature Specifications
- **Core PMS**: Enhanced bed type management, advanced search, flexible check-in/out charges, multi-step check-out, mass operations, group payments.
- **Planning Calendar**: Visual, color-coded, drag & drop reservation management with conflict validation.
- **Specialized Modules**: Comprehensive modules for SPA, Restaurant (with floor plan editor, menu management), and Events (with cancellation confirmations, payment folio).
- **Financial & Payments**: Manual rate overrides, automatic rate calculation, separate tracking of payments and charges, multiple payment methods, split payments.
- **Guest Management**: CRM features including optional vehicle data, stay notes, and alerts.
- **System Notifications**: Internal real-time notification system, chatbot, and web check-in.
- **Web Check-in**: Public mobile-first 4-step wizard for guest self check-in.
- **Group Management**: Mass check-in/out/payment, consolidated invoicing, mass room assignment, printable rooming lists.
- **Package Module**: Display of packages with validity and discounts.
- **Dashboards & Reports**: Executive dashboard with KPIs, YoY comparison, charts, real-time room status. Comprehensive reports module with various tabbed reports, period selectors, and CSV export.
- **Cash Register & Shift Audit**: Tracks shifts, movements, closing summaries, and automatic payment recording. Includes **Night Audit** tab (automated nightly snapshot at 00:05 Argentina time — counts in-house rooms, folio balances, next-day arrivals without prepayment; manual execution available).
- **Bitácora de Incidencias**: Incident log module (severity/status/module tracking, CRUD with admin-only delete) — located in the **Maintenance** module under its own tab.
- **Staff Help Chatbot**: Floating help button integrated with OpenAI gpt-4o-mini for answering operational questions.
- **Travel Agencies Module**: CRUD for agencies, commission tracking, per-agency stats, and global commission reports.
- **Administration Module**: Central hub for financial sub-modules (Facturación, CC Empresas, CC Agencias, Comprobantes, Reportes, Caja).
- **Cuenta Corriente Module**: Tracks `account_movements` for companies, agencies, and individual guests (`entityType: "company" | "agency" | "guest"`), auto-triggers on checkout, provides real-time debt totals. Dedicated page `/admin/cc-huespedes` for guest CC accounts.
- **Contable (Accounting) Modules**:
    - **Database Schema**: Dedicated tables for accounting suppliers, accounts, purchase invoices, payment orders, accounting entries, and IIBB retentions.
    - **Backend Logic**: Functions for automatic accounting entries (`generarAsiento()`, `generarAsientoOP()`) and API routes for CRUD operations on accounting entities.
    - **Frontend**: Pages for managing accounting suppliers, purchase invoices (with a 4-step wizard), and payment orders.
- **Historial de Cambios de Reservas**: Automated changelog for reservations, recording changes to dates, room, status, rate, guest, and notes. Accessible via API and displayed in the frontend.
- **Facturación Electrónica**: Configuration for electronic billing (AFIP), generation of sales invoices (FA/FB/FC, NC A/B) with CAE, and PDF generation conforming to AFIP standards. Includes an administration interface for configuration and invoice listing.
- **Caja de Administración**: Manages individual cash movements, daily cash counts (arqueos), and configuration for petty cash. Provides API endpoints for movements, daily/monthly summaries, and PDF reports. Frontend includes a dashboard for cash management.
- **Reportes Gerenciales**: 7 distinct reports covering profit/loss, KPIs, occupancy, income, costs, suppliers, and comparative analysis. Backend provides data and export options (PDF/Excel), while the frontend uses Recharts for visualization.
- **Event Module Enhancements**: Renamed "Salón Mirador" to "Salón Solárium". Price labels include "(con IVA incluido)". New PDF exports for internal "Hoja de Función" and client "Confirmación" with pricing and signature space.
- **Planning UX Improvements**: Collapsible header, natural page scroll, consistent color definitions for statuses, improved room status icons (dirty/cleaning/inspected/maintenance), blocked clicks on maintenance cells, correct date handling, and advanced filtering options.
- **Contable Exportaciones**: Consolidated accounting exports including SIRCAR (ZIP), IIBB Retentions (PDF), IVA Purchase/Sales Books (Excel/TXT), Account Ledger (PDF), Payment Order (PDF), Withholding Tax Certificate (PDF), and Supplier Current Account (PDF). Frontend includes a dedicated section for these queries and exports.
- **Folio Grupal**: New "Folio Grupal" tab in the group detail view. Includes two new DB tables: `group_charges` and `group_payments`. Backend provides GET folio, POST/DELETE charges, GET/POST payments (v2 with distribution), and transfer-charge endpoints. Frontend shows financial summary (accommodation, extras, group charges, received payments, balance), group charges table with add/delete, per-room breakdown, registered group payments list, and dialogs for adding charges and registering payments with 4 distribution modes (equal, proportional_nights, proportional_rate, manual).
- **Motor Financiero — Folios**: New `folios` and `folio_movements` DB tables implement a parallel financial ledger. Every new charge (POST /api/charges) and payment (POST /api/payments) on a reservation automatically creates a folio entry (fire-and-forget, non-blocking). Core functions in `db-storage.ts`: `getOrCreateFolio()`, `recalcFolioBalance()`, `addFolioCharge()`, `addFolioPayment()`, `addFolioAdjustment()`, `closeFolio()`, `listFolios()`. API routes in `server/routes/folios.ts`. Frontend: `client/src/components/FolioViewer.tsx` (embeddable), `client/src/pages/admin-folios.tsx` (admin hub at `/admin/folios`). Folio codes use prefixes: RS=reservation, OR=restaurant, SP=spa, GR=group, EV=event, CO=company, AG=agency.
- **Maintenance Room Blocking**: Rooms are NEVER auto-blocked when creating maintenance work orders. New `maintenance_blocks` DB table stores optional date-range blocks (`blockFrom`, `blockTo`, `blockedBy`, `workOrderId`). Work order creation form shows an optional "Bloquear habitación en el planning" toggle (only when a room is selected); enabling it reveals date pickers. The planning calendar checks both permanent `room.status === "maintenance"` AND active `maintenance_blocks` for any given day. Table shows a lock icon when an order has an active block; detail dialog shows full block info. Deleting a work order also removes its associated block.
- **Motor Financiero — PDF Export**: `GET /api/folios/:entityType/:entityId/pdf` generates a full-color A4 PDF folio statement using pdfkit. Includes hotel header, folio metadata, movement table with color-coded amounts, and totals. FolioViewer component has a "PDF" download button in its header. `genFolioPDF()` in `server/routes/folios.ts`.
- **Motor Financiero — Breakdown by Entity**: `GET /api/folios/stats/by-entity-type` returns pending balances grouped by entity type. Admin-folios page shows a "Saldos Pendientes por Módulo" bar chart section with clickable filter shortcuts.
- **Grupos — Acciones Masivas**: Group detail page has mass check-in, check-out (with confirmation dialogs), group invoice/factura, group payment, and printable rooming list — all fully wired to backend endpoints.
- **Paquetes Turísticos**: Full CRUD module at `/packages` — create/edit packages with nights, price, discount %, validity dates, room type, and included service items (items with type + description + qty). Duplicate, toggle status, and delete operations. Accessible from sidebar.
- **Motor de Reservas Online (Booking Engine)**: Public 4-step booking wizard at `/reservar` (no login required, embeddable via iframe). Step 1: date/pax selector. Step 2: room type cards with photos, amenities, price. Step 3: guest data form. Step 4: confirmation with reservation code. Backend public API: `GET /api/public/booking/availability`, `GET /api/public/booking/hotel-info`, `POST /api/public/booking/confirm` (creates guest+reservation as `status:"pending"` until staff assigns room). Admin page at `/admin/booking-engine` has two tabs: **Reservas** (shows pending web reservations, "Asignar" button opens dialog to pick room + confirm → moves to planning as `status:"confirmed"`) and **Configuración** (photos, amenities, publicDescription, sort order, visibility per room type). Admin endpoints: `GET /api/admin/booking-engine/reservations`, `POST /api/admin/booking-engine/reservations/:id/assign`, `GET /api/admin/booking-engine/available-rooms`. Fields added to `room_types` table: `public_description`, `amenities` (text[]), `photos` (text[]), `sort_order`, `show_in_booking`. Page is iframe-embeddable from any origin.
- **Vista Deuda por Huésped**: New page at `/admin/deuda-huespedes` — consolidated view of pending balances for active reservations (confirmed/checked_in). Shows alojamiento + extras breakdown per guest, grouped per guest with expandable rows for multiple reservations, summary KPI cards, search filter, and totals row. Backend endpoint at `GET /api/reports/guest-debt`. Accessible from the Cuentas module via "Deuda por Huésped" button.
- **Caja de Admin — Desglose por Módulo**: The "Hoy Ingresó" summary card in admin-caja now shows a Hotel / Restaurante / SPA / Otros breakdown derived from the `porModulo` data returned by the `resumen-dia` endpoint.
- **Folio Grupal — Mejora de Interfaz**: Group detail Folio tab now shows 5 colored summary cards (Alojamiento=blue, Extras=purple, Cargos grupales=orange, Pagos=green, Saldo=red/green) instead of a plain grid. Added a "PDF Folio" download button that fetches `/api/folios/group/:id/pdf`.

## External Dependencies

### Database
- **PostgreSQL**: Primary relational database.

### UI Frameworks & Libraries
- **Radix UI**: Accessible component primitives.
- **shadcn/ui**: Re-usable components built on Radix UI and Tailwind CSS.
- **Lucide React**: Icon library.

### Key Libraries
- **TanStack React Query**: Server state management and caching.
- **date-fns**: Date manipulation utility.
- **Zod**: Schema declaration and validation.
- **class-variance-authority**: Utility for managing component variants.
- **Passport.js**: Authentication middleware.
- **bcrypt**: Password hashing.
- **connect-pg-simple**: PostgreSQL session store.
- **OpenAI API**: For the staff help chatbot.
- **pdfkit**: PDF generation.
- **jszip**, **exceljs**: For SIRCAR exports.

### Development Tools
- **Vite**: Frontend build tool and development server.
- **esbuild**: Fast bundling in production.
- **TypeScript**: Type safety across the stack.