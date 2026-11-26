import type { Express } from "express";
import { db, withReadOnlyDatabaseTransaction, withRepeatableReadDatabaseTransaction } from "../db";
import { storage } from "../db-storage";
import {
  rooms, roomTypes, reservations, guests,
} from "../../shared/schema";
import { eq, not, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";
import { bookingStaySchema, bookingOccupancy, BookingRuleError } from "@shared/booking-engine";
import { assertBookingSalesEnabled, bookingSalesEnabled } from "../bookingEngineSales";
import { loadBookingQuote, bookingAvailableRooms, assertFutureStay } from "../bookingEngineService";
import { registerBookingEngineAdminRoutes } from "./bookingEngineAdmin";
import { withLodgingInventoryMutationLock } from "../inventoryMutationLock";
import { withInitialNightlyQuote } from "../nightlyPricingGuard";

export function registerPublicBookingRoutes(app: Express) {
  registerBookingEngineAdminRoutes(app);

  // ──────────────────────────────────────────────────────────────────────
  // GET /api/public/booking/availability
  // Returns available room types with pricing for a date range
  // ──────────────────────────────────────────────────────────────────────
  app.get("/api/public/booking/availability", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      await assertBookingSalesEnabled();
      const parsed = bookingStaySchema.safeParse({ ...req.query, adults: req.query.adults ?? 2 });
      if (!parsed.success) return res.status(400).json({ error: "Indicá fechas válidas y entre 1 y 6 pasajeros" });
      const stay = parsed.data;
      assertFutureStay(stay);
      const { checkIn, checkOut, adults } = stay;
      const nights = (Date.parse(checkOut) - Date.parse(checkIn)) / 86400000;

      // Get all room types that are visible in booking engine
      const allRoomTypes = await db.select().from(roomTypes)
        .where(eq(roomTypes.showInBooking, true))
        .orderBy(roomTypes.sortOrder, roomTypes.name);

      // Build response
      const results = [];
      for (const rt of allRoomTypes) {
        if (bookingOccupancy(stay) > rt.maxOccupancy) continue;
        let quote;
        try { quote = await withReadOnlyDatabaseTransaction(() => loadBookingQuote(rt.id, stay)); }
        catch (error) { if (error instanceof BookingRuleError) continue; throw error; }
        const freeRooms = await bookingAvailableRooms(rt.id, stay, quote);
        if (!freeRooms.length) continue;
        const bestPlan = quote.plan;

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
          // Do not advertise a physical count which ignores group commitments.
          availableRooms: 1,
          ratePlanId: bestPlan.id,
          offerId: quote.offerId,
          pricingSource: quote.pricingSource,
          otaAdjustmentPercent: quote.otaAdjustmentPercent,
          ratePlanName: (bestPlan as any).name,
          pricePerNight: quote.pricePerNight,
          totalPrice: quote.totalAmount,
          variableNightlyRates: quote.variableNightlyRates,
          discountPercent: quote.discountPercent,
          nights,
          currency: bestPlan.currency || "ARS",
          cancellationPolicy: (bestPlan as any).cancellation_policy,
        });
      }

      // Sort by price ascending
      results.sort((a, b) => a.pricePerNight - b.pricePerNight);

      res.set("Cache-Control", "no-store").json({ checkIn, checkOut, adults, children: stay.children, nights, results });
    } catch (error) {
      console.error("Public availability error:", error);
      res.status(error instanceof BookingRuleError ? 400 : 503).json((error as any)?.response ?? { error: error instanceof BookingRuleError ? error.message : "Error al consultar disponibilidad" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // GET /api/public/booking/hotel-info
  // Returns hotel name, contact, photos for the booking page header
  // ──────────────────────────────────────────────────────────────────────
  app.get("/api/public/booking/hotel-info", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const settings = await storage.getSystemSettings();
      const settingsMap = Object.fromEntries(
        settings.map((s: any) => [s.key, s.value])
      );
      res.json({
        bookingSalesEnabled: await bookingSalesEnabled(),
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
    children: z.number().int().min(0).max(4).default(0),
    childrenAges: z.array(z.number().int().min(0).max(12)).optional(),
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
  bedPreference: z.string().optional(),
    paymentMethod: z.string().default("hotel"), // "hotel" = pay at hotel
    expectedTotalAmount: z.number().positive(),
    offerId: z.string().min(1).max(250).optional(),
  });

  app.post("/api/public/booking/confirm", async (req, res) => {
    try {
      const data = confirmSchema.parse(req.body);
      const stay = bookingStaySchema.parse(data);
      assertFutureStay(stay);
      await assertBookingSalesEnabled();
      const response = await withLodgingInventoryMutationLock(() => withRepeatableReadDatabaseTransaction(async () => {
      await assertBookingSalesEnabled(true);
      // A confirmation uses the same inventory mutex as other lodging writes.
      // Calendar edits and USD conversion lock their rate_plan rows FOR UPDATE
      // before writing entries. Share only the selected plan, in that same
      // order, so unrelated plans/OTA work keep running without a table lock.
      await db.execute(sql`SELECT rt.id FROM room_types rt WHERE rt.id=${data.roomTypeId} FOR SHARE`);
      await db.execute(sql`SELECT p.id FROM booking_engine_configs c JOIN rate_plans p ON p.id=c.rate_plan_id
        WHERE c.room_type_id=${data.roomTypeId} FOR SHARE OF c,p`);
      const quote = await loadBookingQuote(data.roomTypeId, stay, { lockSource: true, offerId: data.offerId });
      if (quote.plan.id !== data.ratePlanId || Math.round(data.expectedTotalAmount * 100) !== Math.round(quote.totalAmount * 100))
        throw new BookingRuleError("La tarifa cambió. Volvé a consultar disponibilidad antes de confirmar");
      const { nights, pricePerNight, totalAmount } = quote;

      // 1) Find an available room of the requested type
      const [freeRoom] = await bookingAvailableRooms(data.roomTypeId, stay, quote) as any[];
      if (!freeRoom) {
        throw new BookingRuleError("Lo sentimos, no quedan habitaciones disponibles para esas fechas. Intentá con otras fechas.");
      }

      // 3) Create or find guest by email
      // An unauthenticated form must not overwrite an existing guest profile.
      let guest: any;
      const [existingGuest] = await db.select().from(guests).where(eq(guests.email, data.email));
      if (existingGuest) {
        guest = existingGuest;
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

      // Same generator as Reception, without relying on an optional sequence
      // whose failure would abort the surrounding transaction.
      const reservationCode = storage.generateReservationCode();

      // 5) Create reservation — status "pending" until staff assigns room in admin
      const newReservation = await withInitialNightlyQuote(quote.nightlyPricing, () => storage.createReservation({
        reservationCode,
        guestId: guest.id,
        roomId: freeRoom.id,          // pre-assigned, staff can change it
        roomTypeId: freeRoom.roomTypeId,
        ratePlanId: data.ratePlanId,
        checkInDate: data.checkIn,
        checkOutDate: data.checkOut,
        nights,
        numberOfGuests: bookingOccupancy(stay),
        status: "pending",            // stays pending until receptionist confirms in admin
        source: "web" as any,
        totalRoomAmount: totalAmount.toFixed(2),
        baseRatePerNight: (Math.round(quote.nightlyPricing.reduce((s, n) => s + n.rateCents, 0) / nights) / 100).toFixed(2),
        finalRatePerNight: pricePerNight.toFixed(2),
        discountType: quote.discountPercent ? "percent" : "none",
        discountValue: String(quote.discountPercent),
        notes: [`Reserva web: ${data.firstName} ${data.lastName}`, `Contacto: ${data.email} ${data.phone ?? ""}`,
          `Pasajeros: ${stay.adults} adulto(s), ${stay.children} niño(s)${stay.childrenAges ? `; edades: ${stay.childrenAges.join(", ")}` : ""}`,
          quote.pricingSource !== "own" ? `Tarifa web con rangos OTA; ajuste ${quote.otaAdjustmentPercent}% en ${quote.inheritedNights} noche(s).` : null,
          data.notes].filter(Boolean).join("\n"),
        bedTypeNotes: data.bedPreference || null,
        createdAt: new Date(),
      } as any));

      // Get room type name for response
      const [rt] = await db.select().from(roomTypes).where(eq(roomTypes.id, freeRoom.roomTypeId));

      return {
        success: true,
        reservationCode: newReservation.reservationCode,
        guestName: `${data.firstName} ${data.lastName}`,
        roomTypeName: rt?.name || freeRoom.roomTypeId,
        checkIn: data.checkIn,
        checkOut: data.checkOut,
        nights,
        totalAmount,
        message: "¡Tu reserva fue confirmada! El pago se realiza al momento del check-in.",
      };
      }));
      res.json(response);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos incompletos", details: error.errors });
      }
      if (error?.code === "40001" || error?.cause?.code === "40001")
        return res.status(409).json({ error: "La disponibilidad o configuración cambió. Volvé a consultar antes de confirmar" });
      console.error("Public booking confirm error:", error);
      res.status(error?.statusCode || 500).json(error?.response || { error: error instanceof BookingRuleError ? error.message : "Error al confirmar la reserva. Intentá nuevamente." });
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

      const updated = await storage.updateReservation(req.params.id, {
        roomId, roomTypeId: room.roomTypeId, status: "confirmed",
        ...(req.body.overrideTentativeGroupWarning === true ? { _inventoryOverrideTentativeGroupWarning: true } : {}),
      } as any);

      if (!updated) return res.status(404).json({ error: "Reserva no encontrada" });
      res.json(updated);
    } catch (error: any) {
      console.error("Assign room error:", error);
      res.status(error?.statusCode || 500).json(error?.response || { error: "Error al asignar habitación" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // Admin: POST /api/admin/booking-engine/reservations/:id/reject
  // Reject (cancel) a pending web reservation
  // ──────────────────────────────────────────────────────────────────────
  app.post("/api/admin/booking-engine/reservations/:id/reject", async (req, res) => {
    try {
      const updated = await storage.updateReservation(req.params.id, { status: "cancelled" });
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
}
