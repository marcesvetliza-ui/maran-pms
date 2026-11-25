import { z } from "zod";
import { calendarDay, calendarDays, calendarEffective } from "./rate-calendar";
import { moneyCents, type PricedNight } from "./nightlyPricing";

export const bookingStaySchema = z.object({
  checkIn: z.string().refine(calendarDay),
  checkOut: z.string().refine(calendarDay),
  adults: z.coerce.number().int().min(1).max(6),
  children: z.coerce.number().int().min(0).max(4).default(0),
  childrenAges: z.array(z.number().int().min(0).max(12)).optional(),
}).superRefine((v, ctx) => {
  if (v.adults + v.children > 6)
    ctx.addIssue({ code: "custom", message: "La ocupación máxima es de 6 pasajeros" });
  if (v.childrenAges && v.childrenAges.length !== v.children)
    ctx.addIssue({ code: "custom", message: "Indicá una edad por cada niño" });
  if (v.checkOut <= v.checkIn ||
      (Date.parse(v.checkOut) - Date.parse(v.checkIn)) / 86400000 > 365)
    ctx.addIssue({ code: "custom", message: "La estadía debe tener entre 1 y 365 noches" });
});
export const bookingOccupancy = (stay: { adults: number; children?: number }) => stay.adults + (stay.children ?? 0);
export const bookingConfigSchema = z.object({
  ratePlanId: z.string().min(1).max(100).nullable(),
  discountPercent: z.number().min(0).max(99.99).multipleOf(0.01),
  publicDescription: z.string().max(4000).nullable(),
  amenities: z.array(z.string().min(1).max(100)).max(30).nullable(),
  photos: z.array(z.string().min(1).max(2048)).max(10).nullable(),
  sortOrder: z.number().int().min(0).max(99),
  showInBooking: z.boolean(),
}).strict();
export type BookingConfig = z.infer<typeof bookingConfigSchema>;
export type BookingPlan = {
  id: string; room_type_id: string; base_rate: string; currency: string;
  valid_from?: string | null; valid_to?: string | null;
  rate_1pax?: string | null; rate_2pax?: string | null;
  rate_3pax?: string | null; rate_4pax?: string | null;
};
export class BookingRuleError extends Error {
  statusCode = 409;
  constructor(message: string) { super(message); }
}
/** Same effective calendar as OTA. Departure restrictions belong to checkout day,
 * but stop-sell and validity apply only to nights actually occupied. */
export function quoteBooking(plan: BookingPlan, entries: any[], stay: z.input<typeof bookingStaySchema>, discountPercent: number) {
  stay = bookingStaySchema.parse(stay);
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 99.99)
    throw new BookingRuleError("Descuento del motor inválido");
  const days = calendarDays(stay.checkIn, stay.checkOut).slice(0, -1);
  const byDate = new Map(entries.map(e => [e.stay_date, e]));
  const cells = days.map(day => calendarEffective(plan, day, byDate.get(day)));
  const nights = days.length;
  if (cells.some(c => !c.isValidDate || c.stopSell))
    throw new BookingRuleError("El plan no está a la venta para todas las noches seleccionadas");
  if (cells[0].closedToArrival) throw new BookingRuleError("No se permiten llegadas en esa fecha");
  if (calendarEffective(plan, stay.checkOut, byDate.get(stay.checkOut)).closedToDeparture)
    throw new BookingRuleError("No se permiten salidas en esa fecha");
  if (nights < cells[0].minStayArrival || cells.some(c => nights < c.minStayThrough))
    throw new BookingRuleError("La estadía no cumple el mínimo de noches");
  if (cells.some(c => c.maxStay > 0 && nights > c.maxStay))
    throw new BookingRuleError("La estadía supera el máximo de noches");
  const basisPoints = Math.round(discountPercent * 100);
  const nightlyPricing: PricedNight[] = cells.map(c => {
    const occupancy = String(Math.min(bookingOccupancy(stay), 4));
    // Explicit occupancy calendar > general calendar > occupancy base > base.
    const raw = c.occupancyOverrides?.[occupancy] ?? c.rateOverride ??
      c.baseOccupancyRates?.[occupancy] ?? c.rate;
    const rateCents = moneyCents(raw);
    const discountCents = Math.round(rateCents * basisPoints / 10000);
    if (rateCents <= 0 || rateCents - discountCents <= 0)
      throw new BookingRuleError("Falta una tarifa positiva para la ocupación seleccionada");
    return { date: c.date, rateCents, discountCents };
  });
  const totalCents = nightlyPricing.reduce((s, n) => s + n.rateCents - n.discountCents, 0);
  return {
    nights, nightlyPricing, totalAmount: totalCents / 100,
    pricePerNight: Math.round(totalCents / nights) / 100,
    variableNightlyRates: new Set(nightlyPricing.map(n => n.rateCents - n.discountCents)).size > 1,
    discountPercent,
  };
}
