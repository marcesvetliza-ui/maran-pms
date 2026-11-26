import { sql } from "drizzle-orm";
import { db } from "./db";
import { isRoomAvailableForInterval } from "@shared/room-availability";
import { BookingRuleError, bookingOccupancy, type BookingPlan } from "@shared/booking-engine";
import { quoteBookingWithOta } from "@shared/booking-ota-pricing";
import { bookingCategoryVariants, bookingOtaQuotas, loadBookingOtaSource, type BookingOtaSource } from "./bookingEngineOtaSource";
import type { z } from "zod";
import type { bookingStaySchema } from "@shared/booking-engine";

export type BookingStay = z.input<typeof bookingStaySchema>;
export function assertFutureStay(stay: BookingStay) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (stay.checkIn < today) throw new BookingRuleError("La llegada no puede ser anterior a hoy");
}
type OwnPlan = BookingPlan & {
  discount_percent: string; max_occupancy: number; inherit_ota_ranges: boolean;
  ota_adjustment_percent: string; ota_reference_plans: Record<string, string>;
};
export type BookingQuote = ReturnType<typeof quoteBookingWithOta> & {
  plan: OwnPlan; offerId: string; rooms: any[]; otaPlanName: string;
};
/** One quote owns its exact physical pool and price source. The same quote is
 * used at confirmation, so a cheap variant can never assign a different pool. */
export async function loadBookingQuote(roomTypeId: string, stay: BookingStay,
  options: { source?: BookingOtaSource; lockSource?: boolean; offerId?: string } = {}): Promise<BookingQuote> {
  assertFutureStay(stay);
  const result = await db.execute(sql`
    SELECT p.*,p.valid_from::text,p.valid_to::text,c.discount_percent,rt.max_occupancy,
      c.inherit_ota_ranges,c.ota_adjustment_percent,c.ota_reference_plans
    FROM booking_engine_configs c JOIN rate_plans p ON p.id=c.rate_plan_id
    JOIN room_types rt ON rt.id=c.room_type_id
    WHERE c.room_type_id=${roomTypeId} AND p.room_type_id=rt.id AND rt.show_in_booking=true
  `);
  const plan = result.rows[0] as OwnPlan | undefined;
  if (!plan || bookingOccupancy(stay) > plan.max_occupancy) throw new BookingRuleError("La categoría no está disponible para esa ocupación");
  const source = options.source || await loadBookingOtaSource(options.lockSource === true);
  const variants = bookingCategoryVariants(source, roomTypeId, plan.id, plan.ota_reference_plans || {});
  const configured = variants.filter(variant => variant.planId && !variant.error);
  if (!configured.length) throw new BookingRuleError("Revisá las habitaciones y los planes de referencia de esta categoría en el motor");
  const ids = [...new Set(configured.map(variant => variant.planId!))];
  const [calendar, roomRows, reservationRows, blockRows, quotas] = await Promise.all([
    db.execute(sql`SELECT *,stay_date::text FROM rate_calendar_entries
      WHERE rate_plan_id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
        AND stay_date BETWEEN ${stay.checkIn}::date AND ${stay.checkOut}::date`),
    db.execute(sql`SELECT id,room_type_id AS "roomTypeId",room_number AS "roomNumber",
      status,is_active AS "isActive",is_virtual AS "isVirtual" FROM rooms WHERE room_type_id=${roomTypeId}`),
    db.execute(sql`SELECT id,room_id AS "roomId",room_type_id AS "roomTypeId",room_history AS "roomHistory",
      status,check_in_date::text AS "checkInDate",check_out_date::text AS "checkOutDate"
      FROM reservations WHERE check_in_date<${stay.checkOut}::date AND check_out_date>${stay.checkIn}::date`),
    db.execute(sql`SELECT room_id AS "roomId",block_from::text AS "blockFrom",(block_to+1)::text AS "blockTo"
      FROM maintenance_blocks WHERE block_from<${stay.checkOut}::date AND block_to>=${stay.checkIn}::date`),
    bookingOtaQuotas(source, stay),
  ]);
  const offers: BookingQuote[] = [];
  let rejectedRule: BookingRuleError | undefined;
  for (const variant of configured) {
    const mapped = source.plans.filter(candidate => candidate.id === variant.planId && candidate.channex_room_type_id === variant.id);
    if (!mapped.some(candidate => candidate.sell_mode === "per_room" || (candidate.sell_mode === "per_person" && candidate.occupancies?.includes(bookingOccupancy(stay))))) continue;
    const offerId = `${variant.id}:${variant.planId}`;
    if (options.offerId && options.offerId !== offerId) continue;
    const rooms = roomRows.rows.filter((room: any) => variant.roomIds.includes(room.id) && isRoomAvailableForInterval({
      room, checkIn: stay.checkIn, checkOut: stay.checkOut,
      reservations: reservationRows.rows as any, maintenanceBlocks: blockRows.rows as any,
    })).sort((a: any, b: any) => a.id.localeCompare(b.id)).slice(0, Math.max(0, quotas.get(variant.id) || 0));
    if (!rooms.length) continue;
    try {
      const quote = quoteBookingWithOta(stay, {
        ownPlan: plan, ownDiscountPercent: Number(plan.discount_percent), otaPlan: mapped[0],
        otaSellMode: mapped[0].sell_mode as "per_room" | "per_person",
        otaEntries: calendar.rows.filter((entry: any) => entry.rate_plan_id === variant.planId),
        inheritRanges: plan.inherit_ota_ranges === true, adjustmentPercent: Number(plan.ota_adjustment_percent || 0),
        exchangeRate: source.connection.exchange_rate,
      });
      offers.push({ ...quote, plan, offerId, rooms, otaPlanName: mapped[0].name });
    } catch (error) {
      if (!(error instanceof BookingRuleError)) throw error;
      rejectedRule = error;
    }
  }
  offers.sort((a, b) => a.totalAmount - b.totalAmount || a.offerId.localeCompare(b.offerId));
  if (!offers.length) throw rejectedRule || new BookingRuleError("No quedan habitaciones disponibles de esa categoría para las fechas y ocupación seleccionadas");
  return offers[0];
}
export async function bookingAvailableRooms(roomTypeId: string, stay: BookingStay, quote?: BookingQuote) {
  return (quote || await loadBookingQuote(roomTypeId, stay)).rooms;
}
