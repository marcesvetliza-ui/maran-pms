import { amountString, calendarNights, moneyCents, nightlyTotal, pricingError, type PricedNight } from "./nightlyPricing";

export type GroupStayRates = Record<string, Record<string, string>>;
export type GroupStayDates = { checkInDate: string; checkOutDate: string };
export type GroupStayPreviewRow = {
  reservationId: string; roomNumber: string; changed: boolean; ownDates: boolean;
  before: GroupStayDates & { nights: number; total: string };
  after: GroupStayDates & { nights: number; total: string | null };
  missingRates: string[];
};
export type GroupStayPreview = {
  fingerprint: string; canConfirm: boolean; rows: GroupStayPreviewRow[];
  beforeTotal: string; afterTotal: string | null; difference: string | null;
};
type Stay = GroupStayDates & {
  id: string; totalRoomAmount: string | null; finalRatePerNight: string | null; baseRatePerNight?: string | null;
  pricingScheme: string; nightlyPricing: PricedNight[] | null; pricingRevision: number;
};

/** Explicit block dates and individually agreed stays are not master dates. */
export function groupStayTarget(group: GroupStayDates, next: GroupStayDates, stay: GroupStayDates,
  block?: { blockCheckInDate: string | null; blockCheckOutDate: string | null }) {
  const inherited = {
    checkInDate: block?.blockCheckInDate || group.checkInDate,
    checkOutDate: block?.blockCheckOutDate || group.checkOutDate,
  };
  const ownDates = stay.checkInDate !== inherited.checkInDate || stay.checkOutDate !== inherited.checkOutDate;
  return { ownDates, dates: ownDates ? { checkInDate: stay.checkInDate, checkOutDate: stay.checkOutDate } : {
    checkInDate: block?.blockCheckInDate || next.checkInDate,
    checkOutDate: block?.blockCheckOutDate || next.checkOutDate,
  } };
}

/** Retain contracted nights and discounts. A variable new night needs a quote. */
export function priceGroupStay(stay: Stay, target: GroupStayDates, rates: Record<string, string> = {}) {
  const oldDates = calendarNights(stay.checkInDate, stay.checkOutDate);
  const dates = calendarNights(target.checkInDate, target.checkOutDate);
  let before: PricedNight[];
  if (stay.pricingScheme === "nightly_v1") {
    before = stay.nightlyPricing || [];
    if (before.map(n => n.date).join() !== oldDates.join() || nightlyTotal(before) !== moneyCents(stay.totalRoomAmount || "0")) {
      pricingError("Las fechas y el detalle nocturno de esta reserva no coinciden. Revisá su cuenta antes de reprogramar el grupo.", 409);
    }
  } else {
    const rate = moneyCents(stay.finalRatePerNight || "0");
    if (rate * oldDates.length !== moneyCents(stay.totalRoomAmount || "0"))
      pricingError("Esta reserva anterior tiene un importe especial sin detalle por noche. Revisá su precio individual antes de reprogramar el grupo.", 409);
    const gross = Math.max(rate, moneyCents(stay.baseRatePerNight || amountString(rate)));
    before = oldDates.map(date => ({ date, rateCents: gross, discountCents: gross - rate }));
  }
  const byDate = new Map(before.map(n => [n.date, n]));
  const added = dates.filter(date => !byDate.has(date));
  if (Object.keys(rates).some(date => !added.includes(date))) pricingError("Solo se pueden cotizar las noches nuevas de esta reprogramación.");
  const template = before.every(n => n.rateCents === before[0].rateCents && n.discountCents === before[0].discountCents) ? before[0] : null;
  const missingRates: string[] = [];
  const after = dates.map(date => {
    const saved = byDate.get(date);
    if (saved) return { ...saved };
    if (rates[date] !== undefined && rates[date] !== "") return { date, rateCents: moneyCents(rates[date]), discountCents: 0 };
    if (template) return { ...template, date };
    missingRates.push(date);
    return { date, rateCents: 0, discountCents: 0 };
  });
  if (missingRates.length) return { missingRates, patch: null, total: null };
  const total = nightlyTotal(after);
  return { missingRates, total: amountString(total), patch: {
    ...target, nights: after.length, nightlyPricing: after, pricingScheme: "nightly_v1" as const,
    pricingRevision: (stay.pricingRevision || 0) + 1, totalRoomAmount: amountString(total),
    finalRatePerNight: amountString(Math.round(total / after.length)),
    baseRatePerNight: amountString(Math.round(after.reduce((sum, n) => sum + n.rateCents, 0) / after.length)),
    discountType: "none" as const, discountValue: "0",
  } };
}
