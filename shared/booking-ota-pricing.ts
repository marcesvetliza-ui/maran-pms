import { bookingStaySchema, bookingOccupancy, BookingRuleError, type BookingPlan } from "./booking-engine";
import { calendarDays, calendarEffective, OTA_CALENDAR_PRICE_ORIGIN } from "./rate-calendar";
import { moneyCents, nightlyTotal, type PricedNight } from "./nightlyPricing";
import type { z } from "zod";

export type BookingOtaPriceOptions = {
  ownPlan: BookingPlan;
  ownDiscountPercent: number;
  otaPlan: BookingPlan;
  otaSellMode: "per_room" | "per_person";
  otaEntries: any[];
  inheritRanges: boolean;
  adjustmentPercent: number;
  exchangeRate?: string | null;
};
const percentage = (value: number, minimum: number, maximum: number) => {
  const units = Math.round(value * 100);
  if (!Number.isFinite(value) || value < minimum || value > maximum || Math.abs(units / 100 - value) > 0.0000001)
    throw new BookingRuleError("El porcentaje debe tener hasta dos decimales y estar dentro del rango permitido");
  return units;
};
function quotedMoney(value: unknown) {
  try { return moneyCents(value); }
  catch (error) { throw new BookingRuleError(error instanceof Error ? error.message : "Revisá la tarifa configurada"); }
}
function convertedCents(cents: number, from: string, to: string, exchangeRate?: string | null): number {
  if (from === to) return cents;
  if (!((from === "USD" && to === "ARS") || (from === "ARS" && to === "USD")) ||
      !/^\d{1,8}(?:\.\d{1,6})?$/.test(exchangeRate || ""))
    throw new BookingRuleError("Revisá la moneda del plan y la cotización de pesos por USD en OTAs");
  const [whole, decimal = ""] = exchangeRate!.split(".");
  const units = BigInt(whole) * 1_000_000n + BigInt(decimal.padEnd(6, "0"));
  if (units <= 0n) throw new BookingRuleError("La cotización debe ser positiva");
  const numerator = from === "USD" ? BigInt(cents) * units : BigInt(cents) * 1_000_000n;
  const divisor = from === "USD" ? 1_000_000n : units;
  return Number((numerator + divisor / 2n) / divisor);
}

/** OTA rules always apply. Only explicitly authored OTA date prices may replace
 * an own-plan price; copied calendars and other plans never supply a range.
 * On those nights the signed OTA adjustment replaces the own-plan discount.
 */
export function quoteBookingWithOta(stayInput: z.input<typeof bookingStaySchema>, options: BookingOtaPriceOptions) {
  const stay = bookingStaySchema.parse(stayInput), { ownPlan, otaPlan } = options;
  const discount = percentage(options.ownDiscountPercent, 0, 99.99);
  const adjustment = percentage(options.adjustmentPercent, -99.99, 1000);
  const days = calendarDays(stay.checkIn, stay.checkOut).slice(0, -1);
  const byDate = new Map(options.otaEntries.map(entry => [entry.stay_date, entry]));
  const rules = days.map(day => calendarEffective(otaPlan, day, byDate.get(day)));
  if (rules.some(rule => !rule.isValidDate || rule.stopSell) ||
      days.some(day => !calendarEffective(ownPlan, day).isValidDate))
    throw new BookingRuleError("La categoría no está a la venta para todas las noches seleccionadas");
  if (rules[0].closedToArrival) throw new BookingRuleError("No se permiten llegadas en esa fecha");
  if (calendarEffective(otaPlan, stay.checkOut, byDate.get(stay.checkOut)).closedToDeparture)
    throw new BookingRuleError("No se permiten salidas en esa fecha");
  if (days.length < rules[0].minStayArrival || rules.some(rule => days.length < rule.minStayThrough))
    throw new BookingRuleError("La estadía no cumple el mínimo de noches");
  if (rules.some(rule => rule.maxStay > 0 && days.length > rule.maxStay))
    throw new BookingRuleError("La estadía supera el máximo de noches");
  const occupancy = String(Math.min(bookingOccupancy(stay), 4));
  let inheritedNights = 0;
  const nightlyPricing: PricedNight[] = days.map(day => {
    const entry = byDate.get(day);
    const specific = entry?.occupancy_rates?.[occupancy];
    const occupancyIsOta = options.otaSellMode === "per_person" && entry?.occupancy_price_origins?.[occupancy] === OTA_CALENDAR_PRICE_ORIGIN;
    const generalIsOta = options.otaSellMode === "per_room" && entry?.rate_origin === OTA_CALENDAR_PRICE_ORIGIN;
    const inherited = options.inheritRanges
      ? specific != null && occupancyIsOta ? specific : entry?.rate != null && generalIsOta ? entry.rate : null
      : null;
    const own = ownPlan[`rate_${occupancy}pax` as keyof BookingPlan] ?? ownPlan.base_rate;
    const rawCents = inherited === null ? quotedMoney(own)
      : convertedCents(quotedMoney(inherited), otaPlan.currency, ownPlan.currency, options.exchangeRate);
    if (rawCents <= 0 || !Number.isSafeInteger(rawCents) || rawCents > 9_999_999_999)
      throw new BookingRuleError("Falta una tarifa positiva para la ocupación seleccionada");
    if (inherited !== null) inheritedNights++;
    const delta = inherited === null ? -discount : adjustment;
    // Preserve the existing own-discount rule: round the discount/markup,
    // then apply it, including the half-cent boundary.
    const deltaCents = Number((BigInt(rawCents) * BigInt(Math.abs(delta)) + 5000n) / 10000n);
    const finalCents = rawCents + (delta < 0 ? -deltaCents : deltaCents);
    if (finalCents <= 0 || finalCents > 9_999_999_999) throw new BookingRuleError("El ajuste deja una tarifa fuera del rango permitido");
    return { date: day, rateCents: Math.max(rawCents, finalCents), discountCents: Math.max(0, rawCents - finalCents) };
  });
  let totalCents: number;
  try { totalCents = nightlyTotal(nightlyPricing); }
  catch (error) { throw new BookingRuleError(error instanceof Error ? error.message : "El total excede el límite permitido"); }
  return {
    nights: days.length, nightlyPricing, totalAmount: totalCents / 100,
    pricePerNight: Math.round(totalCents / days.length) / 100,
    variableNightlyRates: new Set(nightlyPricing.map(night => night.rateCents - night.discountCents)).size > 1,
    discountPercent: inheritedNights ? 0 : options.ownDiscountPercent,
    pricingSource: inheritedNights === 0 ? "own" : inheritedNights === days.length ? "ota_ranges" : "mixed",
    otaAdjustmentPercent: options.adjustmentPercent, inheritedNights,
  };
}
