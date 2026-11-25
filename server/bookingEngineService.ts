import { sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./db-storage";
import { isRoomAvailableForInterval } from "@shared/room-availability";
import { BookingRuleError, bookingOccupancy, quoteBooking, type BookingPlan } from "@shared/booking-engine";
import { calendarAddDays, calendarDays } from "@shared/rate-calendar";
import type { z } from "zod";
import type { bookingStaySchema } from "@shared/booking-engine";

export type BookingStay = z.input<typeof bookingStaySchema>;
export function assertFutureStay(stay: BookingStay) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (stay.checkIn < today) throw new BookingRuleError("La llegada no puede ser anterior a hoy");
}
export async function loadBookingQuote(roomTypeId: string, stay: BookingStay) {
  assertFutureStay(stay);
  const result = await db.execute(sql`
    SELECT p.*,p.valid_from::text,p.valid_to::text,c.discount_percent,rt.max_occupancy
    FROM booking_engine_configs c JOIN rate_plans p ON p.id=c.rate_plan_id
    JOIN room_types rt ON rt.id=c.room_type_id
    WHERE c.room_type_id=${roomTypeId} AND p.room_type_id=rt.id AND rt.show_in_booking=true
  `);
  const plan = result.rows[0] as unknown as BookingPlan & { discount_percent: string; max_occupancy: number };
  if (!plan || bookingOccupancy(stay) > plan.max_occupancy) throw new BookingRuleError("La categoría no está disponible para esa ocupación");
  const calendar = await db.execute(sql`
    SELECT *,stay_date::text FROM rate_calendar_entries
    WHERE rate_plan_id=${plan.id} AND stay_date BETWEEN ${stay.checkIn}::date AND ${stay.checkOut}::date
  `);
  return { plan, ...quoteBooking(plan, calendar.rows, stay, Number(plan.discount_percent)) };
}
export async function bookingAvailableRooms(roomTypeId: string, stay: BookingStay) {
  const [roomRows, reservationRows, blockRows] = await Promise.all([
    db.execute(sql`SELECT id,room_type_id AS "roomTypeId",room_number AS "roomNumber",
      status,is_active AS "isActive",is_virtual AS "isVirtual" FROM rooms WHERE room_type_id=${roomTypeId}`),
    db.execute(sql`SELECT id,room_id AS "roomId",room_type_id AS "roomTypeId",room_history AS "roomHistory",
      status,check_in_date::text AS "checkInDate",check_out_date::text AS "checkOutDate"
      FROM reservations WHERE check_in_date<${stay.checkOut}::date AND check_out_date>${stay.checkIn}::date`),
    // The maintenance end day is inclusive in Planning; shared helper uses an
    // exclusive bound, so convert it here rather than losing the last day.
    db.execute(sql`SELECT room_id AS "roomId",block_from::text AS "blockFrom",(block_to+1)::text AS "blockTo"
      FROM maintenance_blocks WHERE block_from<${stay.checkOut}::date AND block_to>=${stay.checkIn}::date`),
  ]);
  const freeRooms = roomRows.rows.filter((room: any) => isRoomAvailableForInterval({
    room, checkIn: stay.checkIn, checkOut: stay.checkOut,
    reservations: reservationRows.rows as any, maintenanceBlocks: blockRows.rows as any,
  }));
  if (!freeRooms.length) return [];
  // Capacity must be net of maintenance on EACH night before consuming a
  // group's unassigned commitment. Reservations are counted by the shared guard.
  const operationalInventoryByDate = Object.fromEntries(
    calendarDays(stay.checkIn, stay.checkOut).slice(0, -1).map(day => [day,
      roomRows.rows.filter((room: any) => isRoomAvailableForInterval({
        room, checkIn: day, checkOut: calendarAddDays(day, 1), reservations: [],
        maintenanceBlocks: blockRows.rows as any,
      })).length,
    ]),
  );
  const conflict = await storage.evaluateReservationInventory({
    roomTypeId, checkInDate: stay.checkIn, checkOutDate: stay.checkOut,
    hasSpecificRoom: true, operationalInventoryByDate,
  });
  // A public guest cannot override confirmed or tentative group commitments.
  return conflict ? [] : freeRooms;
}
