# Maran Suite System - Hotel Management System

## Overview

Maran Suite System is a comprehensive full-stack hospitality management suite designed for Maran Suites & Towers, a 35-room, 5-floor hotel. The system, developed in Spanish (es) and adhering to Material Design principles, aims to be a modular commercial product. It provides a unified platform for managing various hotel operations, including guest services, reservations, and internal management.

Key capabilities include:
- A central dashboard for operational oversight.
- Management of rooms, room types, guests, and companies.
- A complete reservation workflow from creation to check-out, with a visual planning calendar.
- Integrated Restaurant POS, SPA, and Events management modules.
- Housekeeping, Maintenance, and Inventory management functionalities.
- A comprehensive administration module.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript.
- **Routing**: Wouter for lightweight navigation.
- **State Management**: TanStack React Query for server state synchronization.
- **UI Components**: shadcn/ui library built on Radix UI primitives.
- **Styling**: Tailwind CSS, utilizing CSS variables for theme support (light/dark mode).
- **Build Tool**: Vite, ensuring fast development with Hot Module Replacement (HMR).

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript (ESM modules).
- **API Style**: RESTful JSON API, prefixed under `/api/*`.
- **Development**: Vite middleware integration for HMR.
- **Production**: Serves static files from built frontend assets.

### Data Layer
- **ORM**: Drizzle ORM, configured for PostgreSQL via `node-postgres` (`pg`) driver.
- **Database Connection**: `server/db.ts` creates a `pg.Pool` and wraps it with Drizzle.
- **Storage Layer**: `server/db-storage.ts` implements `IStorage` interface using Drizzle queries against PostgreSQL. Exported from `server/storage.ts`.
- **Seed Data**: `server/seed.ts` populates demo data on first startup (checks if room_types exist).
- **Schema**: Defined in `shared/schema.ts`, shared across client and server. Date fields use `date()` type (returns strings), timestamp fields use `timestamp()` type (returns Date objects).
- **Validation**: Zod schemas generated from Drizzle schemas using `drizzle-zod`.
- **Migrations**: Managed with Drizzle Kit via `db:push`.

### Core Data Models
- **ID Strategy**: All tables use `varchar` primary keys with UUID generation (`gen_random_uuid()`). No `serial` IDs remain.
- **Room Types**: Defines categories, pricing, and capacity.
- **Rooms**: Tracks individual room status (available, occupied, cleaning, maintenance).
- **Guests**: Stores customer details, including identity and optional vehicle information.
- **Reservations**: Manages booking records, linking guests to rooms, with a defined status workflow.
- **Payments**: Tracks payments through various methods (cash, debit/credit card, transfer, MercadoPago, account credit).

### Project Structure
- `client/`: React frontend application.
  - `components/`: UI components.
  - `pages/`: Route components.
  - `hooks/`: Custom React hooks.
  - `lib/`: Utilities and query client.
- `server/`: Express backend.
  - `index.ts`: Server entry point (runs seed on startup).
  - `routes.ts`: API route definitions.
  - `storage.ts`: IStorage interface definition, MemStorage (legacy), exports DatabaseStorage instance.
  - `db.ts`: PostgreSQL connection pool with Drizzle ORM.
  - `db-storage.ts`: DatabaseStorage implementing IStorage with Drizzle queries.
  - `seed.ts`: Demo data seeding (runs once if database is empty).
  - `vite.ts`: Vite development middleware setup.
- `shared/`: Shared code, including Drizzle schema and TypeScript types.

### Design Patterns
- **Path Aliases**: `@/*` for client, `@shared/*` for shared code.
- **API Communication**: Centralized `apiRequest` function integrated with React Query.
- **Component Pattern**: Utilizes shadcn/ui components based on Radix UI primitives.
- **Theme System**: CSS variables for dynamic light/dark mode theming.

### Feature Specifications
- **Reception/PMS Module**: Enhanced bed type management, advanced guest/company search, display of room features in planning, early/late check-in/out charges, and a multi-step check-out wizard that integrates with housekeeping. Includes mass check-in/out and group payment functionalities.
- **SPA Module**: Implements cabin time overlap validation for appointments, streamlined edit/cancel processes, inventory management by area, a weekly planning view with occupancy summaries, and a comprehensive folio system for charges and payments.
- **Restaurant Module**: Features a drag & drop floor plan editor, configurable reservation time slots, search and sort for reservations, editable covers, menu CRUD with display order, and a detailed billing at close with integrated payment methods. New recipe and cost calculation features. Supports waiter assignment, tableless areas, course-based ordering, and bill splitting.
- **Events Module**: Includes cancellation confirmations, room overlap validation, and a complete folio system for charges and payments, supporting advanced payment options and different event types like "table_event" with per-table management.
- **Planning Calendar Enhancements**: Reservations are color-coded by source (e.g., directo, booking, airbnb) with an updated legend and tooltips.
- **Rate Editing**: Allows manual override of `baseRatePerNight` and automatic `finalRatePerNight` calculation based on discount types (percent, fixed).
- **Payments Section**: Separate tracking of payments and charges in the folio, supporting multiple payment methods.
- **Guest Vehicle Data**: Optional fields for vehicle details (plate, make, model, color).
- **System Notifications**: Internal notification system with bell icon in sidebar, real-time unread count polling (30s), support for chatbot and web check-in notification types, area-based filtering (reception, housekeeping, maintenance, restaurant, spa, all), priority levels (normal, high, urgent).
- **Chatbot Webhook Integration**: POST `/api/webhook/chatbot` endpoint validated by `X-Chatbot-Secret` header (env: `CHATBOT_WEBHOOK_SECRET`). Creates notifications and optionally housekeeping tasks. Supports areas: housekeeping, maintenance, restaurant, spa, reception. Includes a dedicated **MARA Chatbot Dashboard** page (`/chatbot`) accessible from sidebar under "Comunicaciones" section. Dashboard shows all chatbot messages with area filter cards, search, read/unread toggle, message detail panel, and webhook configuration reference. Clicking chatbot notifications in the bell popover navigates to the dashboard. Seed data includes sample chatbot messages for demo purposes.
- **Web Check-in**: Public mobile-first 4-step wizard at `/web-checkin/:token` (rendered without sidebar). Generates unique token links per reservation. Steps: personal data, document photo (camera/gallery with canvas compression to 800px), arrival details with early check-in request, confirmation. Integrates with check-in page (new "Web Check-in" tab) for link generation, WhatsApp sharing, and status tracking. Public API routes under `/api/public/web-checkin/:token`.
- **Hospitality Module**: Guest preference CRM at `/hospitality` with 4 tabs (Dashboard, Preferencias, Notas de Estadía, Historial). Three new tables: `guestPreferences` (permanent per-guest), `stayNotes` (per-reservation), `hospitalityAlerts` (auto-generated on check-in). Categories: habitacion, alimentacion, amenities, servicio, fecha_especial, motivo_viaje, nota_interna, otro. Priority levels: low, normal, high, critical. Auto-generates hospitality alerts and system notifications on check-in for guests with active preferences. Integrations: check-in dialog shows preference alert panel, guest detail dialog shows active preferences section, notification bell shows hospitality_alert type with Heart icon. Seed data includes 8 sample preferences across 4 guests. Sidebar entry under "Experiencia del Huésped" section with Heart icon.
- **Group Mass Actions**: Group detail page (`/groups/:id`) includes mass check-in (all confirmed reservations at once), mass check-out (with pending balance validation), group payment (with equal/proportional distribution), and consolidated group invoice. Confirmation dialogs with summaries before each mass operation.
- **Printable Rooming List**: Group detail page has "Imprimir Rooming List" button that opens a dialog with room assignments table (room number, type, guest, document, dates, status, notes). Print button opens a clean new window with "Maran Suites & Towers" header, group info, formatted table, and auto-triggers browser print dialog.
- **Package Module Enhancements**: Package cards show validity dates and discount info. Quick actions: duplicate package (creates inactive copy with all items), status toggle (active/inactive). API endpoints: `POST /api/packages/:id/duplicate`, `PATCH /api/packages/:id/toggle-status`.
- **Executive Dashboard**: Page at `/executive` with period selector (Hoy/Semana/Mes/Año + custom range), KPI cards (Ocupación %, Revenue Total, ADR, RevPAR) with year-over-year comparison arrows, occupancy line chart (recharts), revenue by channel bar chart + table, real-time room status badges (60s auto-refresh), today's operations summary (check-ins/check-outs esperados/pendientes). API: `GET /api/executive/stats?period=today|week|month|year` or `?from=&to=`.
- **Reports Module**: Page at `/reports` with 8 tabbed reports: Ocupación (table + LineChart), Revenue por Tipo (table + BarChart), Por Canal (table + PieChart), Reservas (full table with status filter), Pagos (table + BarChart + grand total), Huéspedes Frecuentes (ranked table), Housekeeping (summary + task type table), Restaurante (summary + top items + by area). Shared period selector, CSV export (Blob + URL.createObjectURL with BOM for Excel), print functionality. APIs under `GET /api/reports/*`.
- **Cash Register & Shift Audit Module**: Page at `/cash-register` with tabs per area (Recepción, Restaurante, SPA, Eventos) + Historial. Four new tables: `cashRegisterConfigs` (area settings with shiftsPerDay), `cashShifts` (shift open/close tracking), `cashMovements` (individual income/expense records), `cashClosingSummaries` (auto-generated totals by payment method on close). Features: open/close shifts with responsible person, manual movement registration, partial summary table, automatic cash movement registration from existing payment endpoints (reservations, restaurant orders, SPA, events), payment method mapping (Spanish→English), history with detail modal and print. Configurable from Administration page (Cajas tab). APIs under `GET/POST /api/cash/*`. Role-protected config edits (admin/manager only). Seed: 4 configs (reception 3 shifts, restaurant 2, spa 1, events 1). Sidebar under "Operaciones" with Wallet icon.
- **Staff Help Chatbot**: Floating help button (bottom-right, all authenticated pages) opens a slide-in chat panel powered by OpenAI gpt-4o-mini. The system prompt contains the complete hotel operations manual (`server/help-manual.ts`). Staff can ask questions about any system module and get step-by-step answers in Spanish. Features: conversation history (up to 10 messages context), "Nueva consulta" button to reset, typing indicator, session-expired detection, input validation (max 1000 chars, role whitelist on history). API: `POST /api/help/chat` (requireAuth). Component: `client/src/components/help-chat.tsx`. Panel: 380px desktop, full-width mobile, z-index 9999. Not shown on login page.

### Authentication & Authorization
- **Strategy**: Passport.js with local strategy (username/password).
- **Password Hashing**: bcrypt with 10 salt rounds.
- **Session Store**: connect-pg-simple storing sessions in PostgreSQL `sessions` table.
- **Session Duration**: 8 hours (one work shift).
- **Auth Module**: `server/auth.ts` exports `setupAuth()`, `requireAuth`, `requireRole()`, `hashPassword()`, `verifyPassword()`.
- **Auth Routes**: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/setup` (one-time admin setup).
- **Protected Routes**: All `/api/*` routes require authentication EXCEPT: `/api/auth/*`, `/api/public/*`, `/api/webhook/chatbot`.
- **Role-Based Access**: Admin-only routes for `/api/system-users` and `/api/system-settings`.
- **Login Page**: `client/src/pages/login.tsx` with hotel branding.
- **Frontend Auth Flow**: `App.tsx` checks `GET /api/auth/me` on load; shows login page if unauthenticated.
- **Default Admin**: username: `admin`, password: `maran2026` (set via `/api/auth/setup` endpoint).
- **Auth Context**: `useAuth()` hook provides current user and logout function throughout the app.

## External Dependencies

### Database
- **PostgreSQL**: Primary relational database.
- **Drizzle ORM**: Type-safe ORM for PostgreSQL.

### UI Frameworks & Libraries
- **Radix UI**: Provides accessible, unstyled component primitives.
- **shadcn/ui**: A collection of re-usable components built on Radix UI and Tailwind CSS.
- **Lucide React**: Icon library.

### Key Libraries
- **TanStack React Query**: For server state management and caching.
- **date-fns**: A utility library for date manipulation.
- **Zod**: Schema declaration and validation library.
- **class-variance-authority**: Utility for managing component variants.

### Development Tools
- **Vite**: Modern frontend build tool and development server.
- **esbuild**: Used for fast bundling in production.
- **TypeScript**: Ensures type safety across the entire stack.