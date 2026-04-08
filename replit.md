# Maran Suite System - Hotel Management System

## Overview
Maran Suite System is a comprehensive full-stack hospitality management suite for Maran Suites & Towers, a 66-room hotel. It aims to be a modular commercial product, unifying various hotel operations including guest services, reservations, and internal management. The system provides a central dashboard and modules for Restaurant POS, SPA, Events, Housekeeping, Maintenance, Inventory, and Administration. Its core purpose is to streamline hotel management, enhance guest experience, and provide robust operational control, developed in Spanish following Material Design principles.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, using Vite.
- **Routing**: Wouter.
- **State Management**: TanStack React Query.
- **UI Components**: shadcn/ui library built on Radix UI primitives.
- **Styling**: Tailwind CSS with CSS variables for dynamic theme support.

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript (ESM modules).
- **API Style**: RESTful JSON API.
- **Authentication**: Passport.js with local strategy, bcrypt for hashing, and `connect-pg-simple` for session storage in PostgreSQL. Role-based access control.
- **Security**: `helmet` HTTP headers, rate limiting.
- **Audit Logging**: Records critical events to `audit_logs` table.

### Data Layer
- **ORM**: Drizzle ORM for PostgreSQL via `node-postgres`.
- **Schema**: Defined in `shared/schema.ts`, shared across client and server, with Zod validation.
- **ID Strategy**: All tables use `varchar` primary keys with UUID generation.
- **Key Entities**: Room Types, Rooms, Guests, Reservations, Payments, Folios, Accounting entities, Inventory, Maintenance Blocks.

### Core Feature Specifications
- **Core PMS**: Enhanced bed type management, advanced search, flexible check-in/out charges, multi-step check-out, mass operations, group payments.
- **Planning Calendar**: Visual, color-coded, drag & drop reservation management with conflict validation.
- **Specialized Modules**: Comprehensive modules for SPA, Restaurant (floor plan, menu management), Events (cancellation confirmations, payment folio), and Multi-warehouse Inventory.
- **Financial & Payments**: Manual rate overrides, automatic rate calculation, separate tracking of payments and charges, multiple payment methods, split payments. Centralized "Folios" system for all financial movements across modules (reservations, restaurant, SPA, groups, events, companies, agencies).
- **Guest Management**: CRM features including vehicle data, stay notes, and alerts. Consolidated guest debt view.
- **System Notifications**: Internal real-time notification system, chatbot, and web check-in.
- **Group Management**: Mass check-in/out/payment, consolidated invoicing, mass room assignment, printable rooming lists, group folio management.
- **Package Module**: CRUD for packages with validity, pricing, and included services.
- **Dashboards & Reports**: Executive dashboard with KPIs, YoY comparison, charts, real-time room status. Comprehensive reports module with various tabbed reports, period selectors, and CSV/PDF/Excel export. Includes specialized accounting exports (SIRCAR, IIBB, IVA books, ledger).
- **Cash Register & Shift Audit**: Tracks shifts, movements, closing summaries, automatic payment recording, and automated Night Audit.
- **Bitácora de Incidencias**: Incident log module within Maintenance. Maintenance room blocking integrated with planning.
- **Staff Help Chatbot**: Integrated with OpenAI for operational questions.
- **Travel Agencies Module**: CRUD, commission tracking, per-agency stats, global commission reports.
- **Administration Module**: Central hub for financial sub-modules (Billing, Corporate/Agency Current Accounts, Receipts, Reports, Cash Desk).
- **Electronic Billing (AFIP)**: Configuration, generation of sales invoices (FA/FB/FC, NC A/B) with CAE, and PDF generation.
- **Online Booking Engine**: Public 4-step booking wizard, iframe-embeddable, with admin configuration for rooms, photos, amenities, and management of pending web reservations.

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
- **Passport.js**: Authentication middleware.
- **bcrypt**: Password hashing.
- **connect-pg-simple**: PostgreSQL session store.
- **OpenAI API**: For the staff help chatbot.
- **pdfkit**: PDF generation (for folios, reports).
- **jszip**, **exceljs**: For SIRCAR and other accounting exports.