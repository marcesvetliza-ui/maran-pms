---
name: Restaurant Reservations Module
description: State of the restaurant table reservations tab — what's built, schema, and key behaviors.
---

## What's built (as of June 2026)

All features from the session plan are implemented in `client/src/pages/restaurant.tsx`:

- **Tab Reservas**: compact table list (not cards), sortable by time or name
- **Filters**: date picker (today default), status dropdown, area/salon dropdown (when >1 area), free-text search
- **Status flow buttons**: pending → Confirmar → Check-in → Completar (→ historical); No-show / Cancel per row
- **GuestSearchCombobox** integrated: fills guestName/phone/email/clientId from DB
- **Card guarantee section**: cardLast4 + cardHolder fields (optional)
- **AdvanceDialog**: list of advances per reservation, add new advance (amount + payment method + notes), print voucher (non-fiscal, popup window), delete advance
- **Check-in flow**: `handleCheckIn` opens a new order on the table if none exists, then `applyAdvancesMutation` applies all advances as credits
- **2 print modes**: monospace list (Ctrl+P friendly) and styled HTML table (Hoja del día)
- **Floor plan badge**: tables with today's reservations shown as "reserved" or "occupied" (if check_in)
- **Time slots per area**: `areaId` field on timeSlots; form filters slots by selected area

## Schema fields on table_reservations
tableId (nullable), areaId, guestName, guestPhone, guestEmail, partySize, reservationDate, reservationTime, status (pending/confirmed/check_in/seated/completed/cancelled/no_show/historical), notes, clientId, cardLast4, cardHolder, advanceAmount, advanceMethod, advanceDate, advanceNotes

## Backend
- `GET/POST /api/restaurant/table-reservations` — full CRUD
- `GET/POST /api/restaurant/table-reservations/:id/advances` — advance CRUD
- `DELETE /api/restaurant/reservation-advances/:id`
- `POST /api/restaurant/table-reservations/:id/apply-advances` — applies advances as credits to an order

**Why:** This module was built across multiple sessions; this note prevents re-building features that already exist.
