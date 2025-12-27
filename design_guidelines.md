# Hotel Management System - Design Guidelines

## Design Approach: Material Design System
**Rationale:** Hotel management systems require efficient data handling, clear information hierarchy, and robust form interactions. Material Design provides excellent patterns for complex data tables, status indicators, and multi-step workflows essential for reservations and operations.

## Typography System

**Font Family:** Inter (via Google Fonts CDN)
- **Primary Headlines:** text-2xl to text-4xl, font-semibold
- **Section Headers:** text-xl, font-medium
- **Body Text:** text-base, font-normal
- **Labels & Metadata:** text-sm, font-medium
- **Data Tables:** text-sm, font-normal with font-mono for numbers/IDs

## Layout & Spacing

**Core Spacing Units:** Tailwind 2, 4, 6, 8, 12, 16
- Component padding: p-4, p-6
- Section spacing: space-y-6, space-y-8
- Card margins: gap-4, gap-6
- Form field spacing: space-y-4

**Container Strategy:**
- Dashboard: Full-width with max-w-7xl inner container
- Forms/Details: max-w-4xl centered
- Data tables: Full-width responsive with horizontal scroll

## Component Library

### Navigation
- **Top Bar:** Fixed header with hotel logo, quick actions (notifications, user menu), global search
- **Sidebar:** Collapsible navigation with icons - Dashboard, Reservations, Guest Management, Rooms, Housekeeping, Reports, Settings
- **Mobile:** Hamburger menu converting sidebar to drawer

### Dashboard Cards
- **Status Cards:** Rounded-lg with shadow-sm, displaying key metrics (Available Rooms, Check-ins Today, Occupancy %)
- **Quick Actions:** Prominent buttons for "New Reservation", "Check-in Guest", "Room Status"
- **Recent Activity:** List view with timestamps and status badges

### Data Tables
- **Reservation Table:** Sortable columns (Guest Name, Room, Check-in, Check-out, Status, Total)
- **Row Actions:** Dropdown menu with Edit, View Details, Cancel options
- **Pagination:** Bottom-aligned with page numbers and items per page selector
- **Filters:** Top bar with date range picker, room type, status filters

### Forms
- **Input Fields:** Consistent height (h-11), rounded-md borders, clear labels above fields
- **Date Pickers:** Calendar overlay for check-in/check-out selection
- **Dropdown Selects:** Room type, number of guests, payment method
- **Guest Information:** Multi-step form with progress indicator (Step 1: Guest Details, Step 2: Room Selection, Step 3: Payment)

### Status Indicators
- **Badges:** Rounded-full px-3 py-1 with semantic meanings
  - Confirmed, Checked-in, Checked-out, Cancelled
  - Room: Available, Occupied, Cleaning, Maintenance
- **Visual Hierarchy:** Icons (Heroicons) paired with status text

### Modals & Overlays
- **Quick View:** Slide-over panel for guest/reservation details without leaving current page
- **Confirmation Dialogs:** Centered modal for critical actions (cancel reservation, checkout)
- **Full Edit Forms:** Dedicated page or large modal for comprehensive data entry

### Room Management
- **Grid View:** Visual room layout showing floor plan with color-coded status
- **List View:** Detailed table with room number, type, status, assigned guest, housekeeping notes

## Icons
**Library:** Heroicons (via CDN)
- Navigation icons, status indicators, action buttons
- Consistent 20px (w-5 h-5) for inline icons, 24px (w-6 h-6) for buttons

## Images
**Minimal Imagery:** This is an operational tool, not marketing
- **Login Page:** Hero image of hotel exterior/lobby (full-height background, blurred overlay)
- **Dashboard:** Small hotel logo in header only
- **Room Management:** Optional thumbnail images of room types in selection dropdowns

## Animations
**Functional Only:**
- Loading spinners for data fetching
- Smooth transitions on sidebar collapse/expand
- Subtle fade-in for modals
- NO decorative animations

## Key Interaction Patterns
- **Inline Editing:** Click-to-edit fields in tables for quick updates
- **Drag & Drop:** Room assignment by dragging guest cards to room grid
- **Keyboard Shortcuts:** Command palette (⌘K) for power users to navigate quickly
- **Real-time Updates:** WebSocket notifications for new reservations, status changes

## Accessibility
- Proper form labels and ARIA attributes throughout
- Keyboard navigation for all interactive elements
- High contrast text (AA compliant)
- Focus indicators on all interactive elements