# Maran Suite System - Hotel Management System

## Overview

Maran Suite System is a comprehensive full-stack hospitality management suite designed for Maran Suites & Towers, a 66-room, 12-floor hotel (Floors 2-12: Floor 2 has 6 rooms, Floors 3-9 have 7 each, Floor 10 has 5, Floors 11-12 have 3 each). The system, developed in Spanish (es) and adhering to Material Design principles, aims to be a modular commercial product. It provides a unified platform for managing various hotel operations, including guest services, reservations, and internal management.

Key capabilities include:
- A central dashboard for operational oversight.
- Management of rooms, room types, guests, companies, and travel agencies.
- A complete reservation workflow with a visual planning calendar.
- Integrated Restaurant POS, SPA, and Events management modules.
- Housekeeping, Maintenance, and Inventory management functionalities.
- A comprehensive administration module.

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
- **Development**: Vite middleware integration for HMR.

### Data Layer
- **ORM**: Drizzle ORM for PostgreSQL via `node-postgres` (`pg`).
- **Storage Layer**: Implemented using Drizzle queries against PostgreSQL, exported from `server/storage.ts`.
- **Seed Data**: `server/seed.ts` populates demo data on first startup.
- **Schema**: Defined in `shared/schema.ts`, shared across client and server.
- **Validation**: Zod schemas generated from Drizzle schemas.

### Core Data Models
- **ID Strategy**: All tables use `varchar` primary keys with UUID generation.
- **Key Entities**: Room Types, Rooms, Guests, Reservations, Payments.

### Project Structure
- `client/`: React frontend application.
- `server/`: Express backend.
- `shared/`: Shared code, including Drizzle schema and TypeScript types.

### Design Patterns
- **Path Aliases**: `@/*` for client, `@shared/*` for shared code.
- **API Communication**: Centralized `apiRequest` function with React Query.
- **Component Pattern**: Utilizes shadcn/ui components.
- **Theme System**: CSS variables for dynamic light/dark mode theming.

### Feature Specifications
- **Reception/PMS Module**: Enhanced bed type management, advanced search, early/late check-in/out charges, multi-step check-out, mass check-in/out, group payment.
- **SPA Module**: Cabin time overlap validation, streamlined edit/cancel processes, inventory management, weekly planning view, folio system.
- **Restaurant Module**: Drag & drop floor plan editor, configurable reservation time slots, menu CRUD, detailed billing, recipe and cost calculation, waiter assignment, tableless areas, course-based ordering, bill splitting.
- **Events Module**: Cancellation confirmations, room overlap validation, folio system with advanced payment options.
- **Planning Calendar Enhancements**: Color-coded reservations by source, updated legend and tooltips. Drag & drop to move reservations between rooms (using @dnd-kit/core) with confirmation dialog and server-side overlap validation.
- **Rate Editing**: Manual override of `baseRatePerNight`, automatic `finalRatePerNight` calculation.
- **Payments Section**: Separate tracking of payments and charges in the folio, multiple payment methods.
- **Guest Vehicle Data**: Optional fields for vehicle details.
- **System Notifications**: Internal notification system with real-time unread count, chatbot and web check-in types, area-based filtering, priority levels.
- **Chatbot Webhook Integration**: `POST /api/webhook/chatbot` endpoint for creating notifications and housekeeping tasks. Includes a **MARA Chatbot Dashboard** page.
- **Web Check-in**: Public mobile-first 4-step wizard at `/web-checkin/:token` for guests to self check-in, integrates with check-in page for link generation and status tracking.
- **Hospitality Module**: Guest preference CRM at `/hospitality` with preferences, stay notes, and auto-generated alerts. Integrations with check-in/guest detail dialogs and notification bell.
- **Group Mass Actions**: Group detail page with mass check-in, mass check-out, group payment, and consolidated group invoice.
- **Printable Rooming List**: Group detail page feature for printing room assignments.
- **Package Module Enhancements**: Package cards show validity/discount, quick actions for duplication and status toggle.
- **Executive Dashboard**: Page at `/executive` with period selector, KPI cards (Occupancy %, Revenue, ADR, RevPAR) with YoY comparison, charts, real-time room status, today's operations summary.
- **Reports Module**: Page at `/reports` with 8 tabbed reports (Occupancy, Revenue by Type, By Channel, Reservations, Payments, Frequent Guests, Housekeeping, Restaurant) with period selector, CSV export, print functionality.
- **Cash Register & Shift Audit Module**: Page at `/cash-register` with tabs per area, tracking shifts, movements, and closing summaries. Features opening/closing shifts, manual movement registration, automatic payment recording, history, and configurable settings.
- **Staff Help Chatbot**: Floating help button with a slide-in chat panel powered by OpenAI gpt-4o-mini, providing step-by-step answers from the hotel operations manual.
- **Travel Agencies Module**: Page at `/agencies` with CRUD table, commission rate tracking, per-agency stats (reservations, revenue, commission), and global commission report with date filtering. `AgencySelector` component in reservation forms (reservations page + planning quick reservation). `agencyId` FK on reservations and guests tables.

### Authentication & Authorization
- **Strategy**: Passport.js with local strategy.
- **Password Hashing**: bcrypt.
- **Session Store**: connect-pg-simple storing sessions in PostgreSQL.
- **Session Duration**: 8 hours.
- **Auth Module**: `server/auth.ts` for authentication utilities.
- **Auth Routes**: `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/setup`.
- **Protected Routes**: All `/api/*` routes require authentication except specific public and auth routes.
- **Role-Based Access**: Admin-only routes for system management.
- **Default Admin**: username: `admin`, password: `maran2026` (via `/api/auth/setup`).

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

## Pendientes y Observaciones (Marzo 2026)

### BUGS CRÍTICOS (Prioridad Alta)
- [x] B01: Editar/modificar reserva de grupo — PATCH route verified correct, group metadata editing works
- [x] B02: Reservas de grupo clickeables desde detalle de grupo (navega a Reservas)
- [x] B03: Al vincular empresa — form uses spread operator correctly, preserves fields
- [x] B04: Early/late check-in icons — late checkout icon now shows on last occupied day (checkOut-1)
- [x] B05: Botón "Hoy" inicia desde hoy (no desde ayer)
- [x] B06: Colores de estado se actualizan — planning query invalidated from check-in/out/reservations pages
- [x] B07: Ordenamiento de habitaciones por piso y número
- [x] B08: Check-in filtra por fecha actual (hoy y mañana, solo confirmed/pending)
- [x] B09: Reserva rápida desde planning permite asociar empresa (CompanySelector)
- [x] B10: Editar camaje desde housekeeping (popover → dialog con Select)
- [x] B11: Bloqueos de grupo sin asignar se muestran como alerta en planning

### MEJORAS OPERATIVAS (Prioridad Media)
- [x] M01: Facturar desde saldo pendiente en folio — "Pagar Saldo Pendiente" button pre-fills balance, "Registrar Pago" pre-fills amount
- [x] M02: Facturación independiente huésped/empresa — billingTarget field on payments (guest/company), selector in folio & check-out
- [x] M03: Eliminar opción "check in"/"check out" del dropdown de estado de reserva
- [x] M04: Paquetes en reservas rápidas desde planning — package selector auto-fills rate and nights
- [x] M05: Check-in/out/facturación grupal masiva — already fully implemented (mass check-in, check-out, group payment)
- [x] M06: Rooming list imprimible desde grupo — already fully implemented with printRoomingList

### FUNCIONALIDADES NUEVAS (Prioridad Baja / Próxima Etapa)
- [x] F01: Inventario/stock de items para consumos y cargos — already fully implemented (categories, suppliers, items, movements, low-stock alerts)
- [x] F02: Reportes contables ampliados y comprobantes — new "Facturación" tab in Reports with guest/company breakdown, pie chart by method, detailed receipts table, CSV export
- [x] F03: Módulo completo de paquetes (noches + servicios) — already fully implemented (packages CRUD, items, duplication, status toggle)
- [x] F04: Tarifas por cantidad de pasajeros (rate1pax-rate4pax fields on rate plans, auto-applied on reservation creation based on guest count)

### FIXES APLICADOS (Marzo 2026 - Sesión Actual)
- [x] FIX-01: Crash Planning en producción — eliminado `@dnd-kit/sortable` v10 (incompatible con `@dnd-kit/core` v6, no se usaba)
- [x] FIX-02: Pagos no visibles en checkout — `enrichReservation` ahora incluye `payments` junto con `charges`
- [x] FIX-03: Editar reserva/grupo/empresa/agencia borraba datos — `updateReservation/Group/Company/Agency` ahora filtran campos protegidos y undefined
- [x] FIX-04: earlyCheckIn/lateCheckOut comparación boolean — ahora usa `!!` en vez de comparar con string "true"
- [x] FIX-05: Fechas UTC vs Argentina — creado `getLocalToday()`/`toArgentinaDateStr()` en `@/lib/utils`, reemplazado `toISOString().split("T")[0]` en planning, reservations, check-in, check-out
- [x] FIX-06: Error Boundary — agregado en `main.tsx` para evitar pantalla en blanco ante errores React

### NOTAS
- Tipos de habitación (ej. "Suite para dos") se pueden agregar desde Administración > Tipos de Habitación
- Las tarifas por PAX se configuran en el plan tarifario
- **Timezone**: Frontend usa `getLocalToday()`/`toArgentinaDateStr()` de `@/lib/utils`; Backend usa `getArgentinaToday()` de `server/db-storage.ts`
- **Safe updates**: Todos los métodos `update*` en `db-storage.ts` filtran campos protegidos (id, createdAt, códigos) y valores undefined