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
- **ORM**: Drizzle ORM, configured for PostgreSQL.
- **Schema**: Defined in `shared/schema.ts`, shared across client and server.
- **Validation**: Zod schemas generated from Drizzle schemas using `drizzle-zod`.
- **Migrations**: Managed with Drizzle Kit via `db:push`.

### Core Data Models
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
  - `index.ts`: Server entry point.
  - `routes.ts`: API route definitions.
  - `storage.ts`: Data access layer.
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