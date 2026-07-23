---
name: Group placeholder reservations — null guestId
description: Por qué las reservas placeholder de grupos usan guestId null y cómo detectarlas.
---

## Regla

Las reservas auto-asignadas de grupos (placeholder, sin pasajero real) deben tener `guestId: null`.  
**No** compartir un guest "GROUP-{id}" entre todas las habitaciones del grupo.

## Por qué

Cuando todas las reservas de un grupo compartían el mismo `guestId` (un guest placeholder),
cualquier escritura sobre ese guest (PATCH /api/guests/:id) propagaba el nombre a TODAS las
habitaciones del grupo. Al usar `guestId: null`, cada reserva es independiente.

## Cómo aplicar

- `server/routes/groups.ts` auto-assignment: `guestId: null as any`, `guestName: ""`
- Detección de placeholder en cliente y servidor: `!r.guestId || r.guest?.codigo === placeholderCode`
  (el segundo caso maneja reservas legacy creadas antes de este fix)
- Display en group-detail.tsx: si `!res.guestId` → mostrar `res.guestName || "Sin asignar"`, no el join de guest
- El endpoint `PATCH placeholder-reservations/:id` ya actualiza `guestId` + `guestName` correctamente
- `getOrCreatePlaceholderGuest` sigue existiendo solo para legacy/sincronizar nombre del grupo

**Why:** bug confirmado por el usuario — asignar un nombre a UNA habitación propagaba a TODAS porque
compartían el mismo guestId del guest placeholder del grupo.
