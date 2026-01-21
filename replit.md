# HotelPro - Hotel Management System

## Overview

HotelPro is a full-stack hotel management system built for managing reservations, rooms, guests, and daily operations like check-in/check-out. The application is designed in Spanish (es) and follows Material Design principles for efficient data handling and clear information hierarchy.

The system provides:
- Dashboard with occupancy metrics and quick actions
- Room and room type management
- Guest registration and management
- Reservation workflow (create, modify, check-in, check-out)
- Visual planning calendar for room availability

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

## Recent Changes (January 2026)

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