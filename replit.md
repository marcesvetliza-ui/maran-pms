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