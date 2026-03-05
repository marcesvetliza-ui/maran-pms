# Maran Suite System - Hotel Management System

## Overview

Maran Suite System is a full-stack hospitality management suite for Maran Suites & Towers (35 rooms, 5 floors). The application is designed in Spanish (es) and follows Material Design principles for efficient data handling and clear information hierarchy. It is being developed as a modular commercial product.

The system provides:
- Dashboard with occupancy metrics and quick actions
- Room and room type management
- Guest and company registration and management
- Reservation workflow (create, modify, check-in, check-out)
- Visual planning calendar for room availability
- Restaurant POS with floor plan, menu, orders, recipes & costs
- SPA management with services, agenda, products
- Events management with quotation, BEO, liquidation
- Coworking spaces, memberships, daily passes, meeting rooms
- Housekeeping and Maintenance modules
- Inventory management (transversal across areas)
- Administration module

## Sidebar Navigation Structure

- **Dashboard** (top level)
- **Hotel** (collapsible): Planning, Reservas, Reserva Rápida, Check-in, Check-out, Habitaciones, Tarifas, Paquetes, OTAs, Grupos, Reseñas
- **Base de Datos**: Huéspedes, Empresas (shared across all modules)
- **Servicios**: Restaurante, SPA, Eventos, Coworking
- **Operaciones**: Housekeeping, Mantenimiento, Inventario
- **Administración**: Admin module
- **Footer**: Configuración

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **Build Tool**: Vite with hot module replacement

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **API Style**: RESTful JSON API under `/api/*` prefix
- **Development**: Vite middleware for HMR in development
- **Production**: Static file serving from built assets

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` (shared between client and server)
- **Validation**: Zod schemas generated from Drizzle schemas via drizzle-zod
- **Migrations**: Drizzle Kit with `db:push` command

### Core Data Models
- **Room Types**: Define room categories with pricing and capacity
- **Rooms**: Individual rooms with status tracking (available, occupied, cleaning, maintenance)
- **Guests**: Customer information with identity documents and optional vehicle data (patente, marca, modelo, color)
- **Reservations**: Booking records linking guests to rooms with status workflow
- **Payments**: Separate payment tracking with multiple payment methods (efectivo, tarjeta débito/crédito, transferencia, MercadoPago, cuenta corriente)

### Project Structure
```
├── client/           # React frontend application
│   ├── src/
│   │   ├── components/   # UI components (shadcn/ui + custom)
│   │   ├── pages/        # Route page components
│   │   ├── hooks/        # Custom React hooks
│   │   └── lib/          # Utilities and query client
├── server/           # Express backend
│   ├── index.ts      # Server entry point
│   ├── routes.ts     # API route definitions
│   ├── storage.ts    # Data access layer interface
│   └── vite.ts       # Vite dev middleware setup
├── shared/           # Shared code between client/server
│   └── schema.ts     # Drizzle schema and TypeScript types
```

### Design Patterns
- **Path Aliases**: `@/*` for client source, `@shared/*` for shared code
- **API Communication**: Centralized `apiRequest` function with React Query integration
- **Component Pattern**: shadcn/ui components with Radix UI primitives
- **Theme System**: CSS variables with light/dark mode toggle

## External Dependencies

### Database
- **PostgreSQL**: Primary database (connection via `DATABASE_URL` environment variable)
- **Drizzle ORM**: Database toolkit for type-safe queries

### UI Framework
- **Radix UI**: Accessible component primitives (dialogs, dropdowns, forms, etc.)
- **shadcn/ui**: Pre-styled component library using Radix + Tailwind
- **Lucide React**: Icon library

### Key Libraries
- **TanStack React Query**: Server state management and caching
- **date-fns**: Date manipulation utilities
- **Zod**: Runtime schema validation
- **class-variance-authority**: Component variant management

### Development Tools
- **Vite**: Build tool and dev server
- **esbuild**: Production server bundling
- **TypeScript**: Type checking across the stack

## Recent Changes (March 2026)

### SPA Module Completion (PDF-driven, 5 tasks)
- **Tarea 1 - Overlap Validation**: Backend validates cabin time overlaps on POST/PATCH appointments. Returns 409 with descriptive message if conflict detected. Only checks active statuses (pending, confirmed, in_progress).
- **Tarea 2 - Edit/Cancel with Confirmation**: Appointments can be edited (opens form pre-filled) and cancelled with a confirmation dialog. Cancelled appointments shown with strikethrough styling in the grid.
- **Tarea 3 - Inventory Areas**: `itemCategories` table has new `area` field (general, spa, restaurant, housekeeping, maintenance, admin). Inventory filtered by area in GET endpoints. SPA module has "Insumos" tab showing SPA-area items. Inventory page has area filter dropdown.
- **Tarea 4 - Weekly Planning View**: Toggle between daily/weekly view in SPA agenda. Weekly view shows 7-day grid by cabin with color-coded occupancy counts (0=gray, 1-2=green, 3-4=amber, 5+=red). New endpoint: GET `/api/spa/appointments/weekly-summary`.
- **Tarea 5 - Complete Folio**: Full folio with charges (add/remove items) and payments (multiple methods). `spaPayments` table tracks payments with method, advance flag, room charge support. Folio shows left=charges, right=payments with running balance. Close requires receipt type (Ticket/Factura A/B/C/Nota Crédito) and zero balance. Room charge creates charge on reservation.

### Schema Changes (SPA)
- `spa_accounts`: Added `total_paid`, `receipt_type` columns
- New table: `spa_payments` (id, account_id, amount, method, is_advance, appointment_id, reservation_id, notes, created_at)
- `item_categories`: Added `area` column (general/spa/restaurant/housekeeping/maintenance/admin)
- `SpaAccountWithItems` type now includes `payments: SpaPayment[]`

### Restaurant Module Adjustments (PDF-driven)
- **Floor Plan Editor**: Drag & drop table positioning on 8x6 grid, edit mode toggle, add/delete tables
- **Window Attribute**: `hasWindow` boolean on tables, visible as sky-blue badge in floor plan and reservation selectors
- **Configurable Time Slots**: Admin dialog to define reservation turns (e.g., 20:00, 20:15, 22:00); when configured, reservations show a dropdown instead of free-form time input
- **Reservation Search & Sort**: Search by guest name + alphabetical sorting in reservations tab
- **Editable Covers**: Guest count field is now free-form when opening a table
- **Opening Time in Folio**: Order dialog header shows opened-at time and cover count
- **Menu CRUD**: Full create/edit/delete for categories and menu items with display order
- **Category Ordering**: Categories sorted by configurable `displayOrder` (suggested: 1-Bebidas, 2-Entradas, 3-Principales, 4-Postres)
- **Billing at Close**: Close dialog now requires receipt type (Ticket/Factura A/B/C/Nota Credito) and payment method (Efectivo/Tarjeta Debito/Credito/Transferencia/Cuenta Habitacion/MercadoPago)
- **ARCA Integration Prep**: `receiptType` and `paymentMethod` fields stored on orders for future external billing integration
- **Recipes & Costs Tab**: New tab for loading recipes per dish (ingredients with quantities and unit costs), automatic cost calculation, gross margin report per product

### Events Module Completion (PDF-driven, 4 tasks)
- **T001 - Cancel Confirmation**: Cancelling an event now opens an AlertDialog confirmation before applying status change. Red destructive "Sí, cancelar evento" button.
- **T002 - Overlap Validation**: Backend validates room date overlaps on POST/PATCH events. Returns 409 with descriptive message. Active statuses: tentative, confirmed, in_progress. Frontend shows toast and keeps modal open on conflict.
- **T003 - Complete Folio**: Full folio with charges (left) and payments (right) with SEÑA badges. Multiple payment methods including room charge. Close requires zero balance + receipt type (Ticket/Factura A/B/C/Nota Credito). Status becomes "invoiced". Room charges create hotel charges on reservation.
- **T004 - Evento por Mesa**: New "table_event" event type. Mesas tab with card grid showing per-table balance/status. Per-table folio dialog (charges + payments). Individual table close with receipt type. Global summary of all tables.

### Schema Changes (Events)
- `events`: Added `receipt_type`, `closed_at`, `total_amount`, `total_paid` columns
- New `EventStatus` value: "invoiced"
- New `EventType` value: "table_event"
- New tables: `event_payments`, `event_tables`, `event_table_charges`, `event_table_payments`

### Restaurant Module Extended (PDF-driven, 4 tasks)
- **T001 - Waiter Name**: `waiterName` field required when opening a table. Shown on occupied tables in floor plan and in folio header.
- **T002 - Tableless Areas**: Areas with `hasTables="false"` (Room Service, Delivery, Solarium, SPA) show direct orders list instead of floor plan. Orders have `orderLabel` for identification.
- **T003 - Courses/Steps**: Items assigned to courses (1=Entradas, 2=Principales, 3=Postres). `activeCourse` on orders. `waiting_course` status for future-course items. "Sig. Curso" button advances active course.
- **T004 - Bill Splitting**: `orderSplits` table. "Dividir Cuenta" button in close dialog with quick split (2/3/4 parts). Per-part payment with method and receipt type. Auto-close when all parts paid. Cancel split while unpaid.

### Schema Changes (Restaurant)
- `restaurant_tables`: Added `has_window` column
- `restaurant_orders`: Added `receipt_type`, `payment_method`, `waiter_name`, `order_label`, `active_course`, `area_id` columns
- `order_items`: Added `course` column (integer, default 1)
- `restaurant_areas`: Added `has_tables` column
- New tables: `restaurant_time_slots`, `recipes`, `recipe_ingredients`, `order_splits`

## Previous Changes (January 2026)

### Planning Calendar - Source Colors
- Reservations now display different colors based on their source (origin):
  - directo (blue), telefono (sky), web (cyan), booking (indigo), expedia (yellow)
  - airbnb (rose), despegar (orange), hotelbeds (purple), agoda (red)
  - ota (violet), empresa (emerald)
- Legend updated to show both status colors and source colors
- Tooltip displays the reservation source when hovering over cells

### Rate Editing
- Manual override of baseRatePerNight in reservation creation/edit forms
- Automatic calculation of finalRatePerNight based on discounts
- Discount types: none, percent, fixed

### Payments Section
- Separate payment tracking from charges in the folio modal
- Payment methods: efectivo, tarjeta débito, tarjeta crédito, transferencia, MercadoPago, cuenta corriente

### Vehicle Data for Guests
- Optional vehicle fields: patente (auto-uppercase), marca, modelo, color
- Displayed in guest detail views and forms