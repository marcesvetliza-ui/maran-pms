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
- **Cash Register & Shift Audit**: Tracks shifts, movements, closing summaries, and automatic payment recording.
- **Staff Help Chatbot**: Floating help button integrated with OpenAI gpt-4o-mini for answering operational questions.
- **Travel Agencies Module**: CRUD for agencies, commission tracking, per-agency stats, and global commission reports.
- **Administration Module**: Central hub for financial sub-modules (Facturación, CC Empresas, CC Agencias, Comprobantes, Reportes, Caja).
- **Cuenta Corriente Module**: Tracks `account_movements` for companies/agencies, auto-triggers on checkout, provides real-time debt totals.
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