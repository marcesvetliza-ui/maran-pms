import type { Express } from "express";
import { db } from "../db";
import { storage } from "../db-storage";
import {
  rooms, roomTypes, ratePlans, reservations, guests,
} from "../../shared/schema";
import { and, eq, not, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";

function dateOnly(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const diff = dateOnly(checkOut).getTime() - dateOnly(checkIn).getTime();
  return Math.max(1, Math.round(diff / 86400000));
}

// Returns the best (cheapest) rate for a room type given pax count
function pickRate(plan: any, adults: number): number {
  if (adults === 1 && plan.rate1pax) return parseFloat(plan.rate1pax);
  if (adults === 2 && plan.rate2pax) return parseFloat(plan.rate2pax);
  if (adults === 3 && plan.rate3pax) return parseFloat(plan.rate3pax);
  if (adults >= 4 && plan.rate4pax) return parseFloat(plan.rate4pax);
  return parseFloat(plan.baseRate);
}

export function registerPublicBookingRoutes(app: Express) {

  // ──────────────────────────────────────────────────────────────────────
  // GET /api/public/booking/availability
  // Returns available room types with pricing for a date range
  // ──────────────────────────────────────────────────────────────────────
  app.get("/api/public/booking/availability", async (req, res) => {
    try {
      const { checkIn, checkOut, adults: adultsStr } = req.query as Record<string, string>;
      if (!checkIn || !checkOut) {
        return res.status(400).json({ error: "checkIn y checkOut son requeridos (YYYY-MM-DD)" });
      }
      const adults = parseInt(adultsStr || "2") || 2;
      const nights = nightsBetween(checkIn, checkOut);
      if (nights < 1) return res.status(400).json({ error: "La fecha de salida debe ser posterior a la de entrada" });

      // Get all room types that are visible in booking engine
      const allRoomTypes = await db.select().from(roomTypes)
        .where(eq(roomTypes.showInBooking, true))
        .orderBy(roomTypes.sortOrder, roomTypes.name);

      // Find rooms that are OCCUPIED during the requested dates
      // A room is occupied if it has a non-cancelled reservation where:
      //   existingCheckIn < requestedCheckOut AND existingCheckOut > requestedCheckIn
      const occupiedResult = await db.execute(sql`
        SELECT DISTINCT r.room_id
        FROM reservations r
        WHERE r.status NOT IN ('cancelled', 'checked_out')
          AND r.check_in_date < ${checkOut}::date
          AND r.check_out_date > ${checkIn}::date
      `);
      const occupiedRoomIds = new Set((occupiedResult.rows as any[]).map(r => r.room_id));

      // Also exclude maintenance/OOS rooms
      const unavailableRooms = await db.execute(sql`
        SELECT id FROM rooms WHERE status IN ('maintenance', 'oos')
      `);
      const unavailableIds = new Set((unavailableRooms.rows as any[]).map(r => r.id));

      // Count available rooms per room type
      const allRooms = await db.select().from(rooms);
      const availableByType: Record<string, number> = {};
      for (const room of allRooms) {
        if (!occupiedRoomIds.has(room.id) && !unavailableIds.has(room.id)) {
          availableByType[room.roomTypeId] = (availableByType[room.roomTypeId] || 0) + 1;
        }
      }

      // Get all rate plans
      const allRatePlans = await db.select().from(ratePlans);

      // Build response
      const results = [];
      for (const rt of allRoomTypes) {
        const available = availableByType[rt.id] || 0;
        if (available === 0) continue; // skip unavailable types

        // Check occupancy
        if (adults > rt.maxOccupancy) continue;

        // Find best rate plan
        const plans = allRatePlans.filter(p => p.roomTypeId === rt.id);
        if (plans.length === 0) continue;

        // Pick the cheapest applicable plan
        let bestPlan = plans[0];
        let bestRate = pickRate(bestPlan, adults);
        for (const plan of plans.slice(1)) {
          const r = pickRate(plan, adults);
          if (r < bestRate) { bestRate = r; bestPlan = plan; }
        }

        const totalPrice = bestRate * nights;

        results.push({
          roomTypeId: rt.id,
          code: rt.code,
          name: rt.name,
          description: rt.description,
          publicDescription: rt.publicDescription,
          baseOccupancy: rt.baseOccupancy,
          maxOccupancy: rt.maxOccupancy,
          amenities: rt.amenities || [],
          photos: rt.photos || [],
          availableRooms: available,
          ratePlanId: bestPlan.id,
          ratePlanName: bestPlan.name,
          pricePerNight: bestRate,
          totalPrice,
          nights,
          currency: bestPlan.currency || "ARS",
          cancellationPolicy: bestPlan.cancellationPolicy,
        });
      }

      // Sort by price ascending
      results.sort((a, b) => a.pricePerNight - b.pricePerNight);

      res.json({ checkIn, checkOut, adults, nights, results });
    } catch (error) {
      console.error("Public availability error:", error);
      res.status(500).json({ error: "Error al consultar disponibilidad" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // GET /api/public/booking/hotel-info
  // Returns hotel name, contact, photos for the booking page header
  // ──────────────────────────────────────────────────────────────────────
  app.get("/api/public/booking/hotel-info", async (req, res) => {
    try {
      const settings = await storage.getSystemSettings();
      const settingsMap = Object.fromEntries(
        settings.map((s: any) => [s.key, s.value])
      );
      res.json({
        name: settingsMap["hotel_name"] || "Maran Suites & Towers",
        tagline: settingsMap["booking_tagline"] || "Tu estadía perfecta en el centro",
        phone: settingsMap["hotel_phone"] || "",
        email: settingsMap["hotel_email"] || "",
        address: settingsMap["hotel_address"] || "",
        checkInTime: settingsMap["check_in_time"] || "14:00",
        checkOutTime: settingsMap["check_out_time"] || "11:00",
        currency: settingsMap["currency"] || "ARS",
        logoUrl: settingsMap["booking_logo_url"] || "",
        heroImageUrl: settingsMap["booking_hero_url"] || "",
        primaryColor: settingsMap["booking_primary_color"] || "#1e40af",
      });
    } catch (error) {
      res.status(500).json({ error: "Error al obtener información del hotel" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // POST /api/public/booking/confirm
  // Creates a guest + reservation in the PMS
  // ──────────────────────────────────────────────────────────────────────
  const confirmSchema = z.object({
    checkIn: z.string(),
    checkOut: z.string(),
    adults: z.number().int().min(1).max(6),
    roomTypeId: z.string(),
    ratePlanId: z.string(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
    documentType: z.string().optional(),
    documentNumber: z.string().optional(),
    nationality: z.string().optional(),
    notes: z.string().optional(),
    paymentMethod: z.string().default("hotel"), // "hotel" = pay at hotel
  });

  app.post("/api/public/booking/confirm", async (req, res) => {
    try {
      const data = confirmSchema.parse(req.body);
      const nights = nightsBetween(data.checkIn, data.checkOut);

      // 1) Find an available room of the requested type
      const occupiedResult = await db.execute(sql`
        SELECT DISTINCT r.room_id
        FROM reservations r
        WHERE r.status NOT IN ('cancelled', 'checked_out')
          AND r.check_in_date < ${data.checkOut}::date
          AND r.check_out_date > ${data.checkIn}::date
      `);
      const occupiedRoomIds = new Set((occupiedResult.rows as any[]).map(r => r.room_id));

      const candidateRooms = await db.select().from(rooms).where(
        and(
          eq(rooms.roomTypeId, data.roomTypeId),
          not(inArray(rooms.status, ["maintenance", "oos"]))
        )
      );
      const freeRoom = candidateRooms.find(r => !occupiedRoomIds.has(r.id));
      if (!freeRoom) {
        return res.status(409).json({ error: "Lo sentimos, no quedan habitaciones disponibles para esas fechas. Intentá con otras fechas." });
      }

      // 2) Get rate plan
      const [ratePlan] = await db.select().from(ratePlans).where(eq(ratePlans.id, data.ratePlanId));
      if (!ratePlan) return res.status(400).json({ error: "Plan de tarifas no encontrado" });

      const pricePerNight = pickRate(ratePlan, data.adults);
      const totalAmount = pricePerNight * nights;

      // 3) Create or find guest by email
      // If email already exists, update name/phone/doc with what the guest just filled in
      // (they are the one booking, so their data is authoritative)
      let guest: any;
      const [existingGuest] = await db.select().from(guests).where(eq(guests.email, data.email));
      if (existingGuest) {
        const [updated] = await db.update(guests)
          .set({
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone || existingGuest.phone,
            documentType: (data.documentType as any) || existingGuest.documentType,
            documentNumber: data.documentNumber || existingGuest.documentNumber,
            nationality: data.nationality || existingGuest.nationality,
          })
          .where(eq(guests.id, existingGuest.id))
          .returning();
        guest = updated;
      } else {
        const [newGuest] = await db.insert(guests).values({
          id: randomUUID(),
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone || null,
          documentType: (data.documentType as any) || "DNI",
          documentNumber: data.documentNumber || null,
          nationality: data.nationality || "AR",
        }).returning();
        guest = newGuest;
      }

      // 4) Generate reservation code
      const codeResult = await db.execute(sql`
        SELECT 'RES-' || TO_CHAR(NOW(), 'YYMM') || '-' || LPAD(NEXTVAL('reservation_code_seq')::text, 4, '0') AS code
      `).catch(async () => {
        // Fallback if seq doesn't exist
        return { rows: [{ code: `RES-${Date.now().toString(36).toUpperCase()}` }] };
      });
      const reservationCode = (codeResult.rows[0] as any).code || `WEB-${Date.now().toString(36).toUpperCase()}`;

      // 5) Create reservation — status "pending" until staff assigns room in admin
      const [newReservation] = await db.insert(reservations).values({
        id: randomUUID(),
        reservationCode,
        guestId: guest.id,
        roomId: freeRoom.id,          // pre-assigned, staff can change it
        roomTypeId: freeRoom.roomTypeId,
        ratePlanId: data.ratePlanId,
        checkInDate: data.checkIn,
        checkOutDate: data.checkOut,
        nights,
        numberOfGuests: data.adults,
        status: "pending",            // stays pending until receptionist confirms in admin
        source: "web" as any,
        totalAmount: totalAmount.toFixed(2),
        totalRoomAmount: totalAmount.toFixed(2),
        baseRatePerNight: pricePerNight.toFixed(2),
        finalRatePerNight: pricePerNight.toFixed(2),
        notes: data.notes || null,
        createdAt: new Date(),
      } as any).returning();

      // Get room type name for response
      const [rt] = await db.select().from(roomTypes).where(eq(roomTypes.id, freeRoom.roomTypeId));

      res.json({
        success: true,
        reservationCode: newReservation.reservationCode,
        guestName: `${data.firstName} ${data.lastName}`,
        roomTypeName: rt?.name || freeRoom.roomTypeId,
        checkIn: data.checkIn,
        checkOut: data.checkOut,
        nights,
        totalAmount,
        message: "¡Tu reserva fue confirmada! El pago se realiza al momento del check-in.",
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos incompletos", details: error.errors });
      }
      console.error("Public booking confirm error:", error);
      res.status(500).json({ error: "Error al confirmar la reserva. Intentá nuevamente." });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // Admin: GET /api/admin/booking-engine/reservations
  // Lists pending web reservations awaiting room assignment
  // ──────────────────────────────────────────────────────────────────────
  app.get("/api/admin/booking-engine/reservations", async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT
          r.id, r.reservation_code, r.check_in_date, r.check_out_date,
          r.nights, r.number_of_guests, r.status, r.source,
          r.final_rate_per_night AS total_amount, r.base_rate_per_night, r.rate_plan_id,
          r.room_id, r.room_type_id, r.notes, r.created_at,
          g.id AS guest_id, g.first_name, g.last_name, g.email, g.phone,
          g.document_type, g.document_number,
          rm.room_number,
          rt.name AS room_type_name, rt.code AS room_type_code
        FROM reservations r
        LEFT JOIN guests g ON r.guest_id = g.id
        LEFT JOIN rooms rm ON r.room_id = rm.id
        LEFT JOIN room_types rt ON r.room_type_id = rt.id
        WHERE r.source = 'web' AND r.status = 'pending'
        ORDER BY r.created_at DESC
      `);
      res.json(result.rows);
    } catch (error) {
      console.error("Web reservations list error:", error);
      res.status(500).json({ error: "Error al obtener reservas web" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // Admin: POST /api/admin/booking-engine/reservations/:id/assign
  // Assign a room and confirm the reservation (moves it to planning)
  // ──────────────────────────────────────────────────────────────────────
  app.post("/api/admin/booking-engine/reservations/:id/assign", async (req, res) => {
    try {
      const { roomId } = req.body;
      if (!roomId) return res.status(400).json({ error: "roomId requerido" });

      // Check the room is available for those dates
      const [reservation] = await db.select().from(reservations).where(eq(reservations.id, req.params.id));
      if (!reservation) return res.status(404).json({ error: "Reserva no encontrada" });

      const conflict = await db.execute(sql`
        SELECT id FROM reservations
        WHERE room_id = ${roomId}
          AND id != ${req.params.id}
          AND status NOT IN ('cancelled', 'checked_out', 'pending')
          AND check_in_date < ${reservation.checkOutDate}::date
          AND check_out_date > ${reservation.checkInDate}::date
        LIMIT 1
      `);
      if ((conflict.rows as any[]).length > 0) {
        return res.status(409).json({ error: "Esa habitación ya tiene una reserva en esas fechas" });
      }

      // Get room to update roomTypeId too
      const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
      if (!room) return res.status(404).json({ error: "Habitación no encontrada" });

      const [updated] = await db.update(reservations)
        .set({
          roomId,
          roomTypeId: room.roomTypeId,
          status: "confirmed",
        } as any)
        .where(eq(reservations.id, req.params.id))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Assign room error:", error);
      res.status(500).json({ error: "Error al asignar habitación" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // Admin: POST /api/admin/booking-engine/reservations/:id/reject
  // Reject (cancel) a pending web reservation
  // ──────────────────────────────────────────────────────────────────────
  app.post("/api/admin/booking-engine/reservations/:id/reject", async (req, res) => {
    try {
      const [updated] = await db.update(reservations)
        .set({ status: "cancelled" } as any)
        .where(eq(reservations.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Reserva no encontrada" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error al rechazar reserva" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // Admin: GET /api/admin/booking-engine/available-rooms
  // Returns rooms available for a given date range (for assignment dialog)
  // ──────────────────────────────────────────────────────────────────────
  app.get("/api/admin/booking-engine/available-rooms", async (req, res) => {
    try {
      const { checkIn, checkOut, roomTypeId, excludeReservationId } = req.query as Record<string, string>;
      if (!checkIn || !checkOut) return res.status(400).json({ error: "checkIn y checkOut requeridos" });

      const occupied = await db.execute(sql`
        SELECT DISTINCT room_id FROM reservations
        WHERE status NOT IN ('cancelled', 'checked_out', 'pending')
          AND check_in_date < ${checkOut}::date
          AND check_out_date > ${checkIn}::date
          ${excludeReservationId ? sql`AND id != ${excludeReservationId}` : sql``}
      `);
      const occupiedIds = new Set((occupied.rows as any[]).map(r => r.room_id));

      const allRooms = await db.select({ id: rooms.id, roomNumber: rooms.roomNumber, roomTypeId: rooms.roomTypeId, status: rooms.status })
        .from(rooms)
        .where(not(inArray(rooms.status, ["maintenance", "oos"])));

      const allRoomTypes = await db.select().from(roomTypes);
      const rtMap = Object.fromEntries(allRoomTypes.map(rt => [rt.id, rt]));

      const available = allRooms
        .filter(r => !occupiedIds.has(r.id))
        .filter(r => !roomTypeId || r.roomTypeId === roomTypeId)
        .map(r => ({
          id: r.id,
          roomNumber: r.roomNumber,
          roomTypeId: r.roomTypeId,
          roomTypeName: rtMap[r.roomTypeId]?.name || r.roomTypeId,
          roomTypeCode: rtMap[r.roomTypeId]?.code || r.roomTypeId,
          status: r.status,
        }))
        .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber));

      res.json(available);
    } catch (error) {
      res.status(500).json({ error: "Error al consultar habitaciones" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // Admin: PATCH /api/admin/room-types/:id/booking-config
  // Update photos, amenities, publicDescription for a room type
  // ──────────────────────────────────────────────────────────────────────
  app.patch("/api/admin/room-types/:id/booking-config", async (req, res) => {
    try {
      const { publicDescription, amenities, photos, sortOrder, showInBooking } = req.body;
      const [updated] = await db.update(roomTypes)
        .set({ publicDescription, amenities, photos, sortOrder, showInBooking })
        .where(eq(roomTypes.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Tipo no encontrado" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error al guardar configuración" });
    }
  });
}
