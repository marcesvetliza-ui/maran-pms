/** Contract prices, never reconstructed for legacy reservations. All arithmetic is in cents. */
export type PricedNight = { date: string; rateCents: number; discountCents: number };
export type NightlyEdit =
  | { kind: "rates"; dates: string[]; rate?: string; discount?: string; discountMode: "percent" | "amount"; discountScope: "night" | "selection" }
  | { kind: "stay"; checkIn: string; checkOut: string; addedRates: Record<string, string> };
export function pricingError(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode, response: { error: message } });
}
export function moneyCents(value: unknown): number {
  const text = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) pricingError("Ingresá un importe válido, no negativo, con hasta dos decimales.");
  const [whole, fraction = ""] = text.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result > 9_999_999_999) pricingError("El importe excede el límite permitido.");
  return result;
}
export function amountString(cents: number): string { return (cents / 100).toFixed(2); }
export function calendarNights(checkIn: string, checkOut: string): string[] {
  const parse = (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) pricingError("Las fechas deben tener formato AAAA-MM-DD.");
    const value = Date.parse(`${date}T00:00:00Z`);
    if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== date) pricingError("Fecha inválida.");
    return value;
  };
  const from = parse(checkIn), to = parse(checkOut);
  const count = (to - from) / 86_400_000;
  if (!Number.isInteger(count) || count < 1 || count > 730) pricingError("La estadía debe contener entre 1 y 730 noches.");
  return Array.from({ length: count }, (_, index) => new Date(from + index * 86_400_000).toISOString().slice(0, 10));
}
export function nightlyTotal(lines: PricedNight[]): number {
  const dates = new Set<string>();
  const total = lines.reduce((sum, night) => {
    if (dates.has(night.date) || !Number.isSafeInteger(night.rateCents) ||
        !Number.isSafeInteger(night.discountCents) || night.rateCents < 0 ||
        night.discountCents < 0 || night.discountCents > night.rateCents) pricingError("El detalle nocturno es inconsistente.");
    dates.add(night.date);
    return sum + night.rateCents - night.discountCents;
  }, 0);
  if (!Number.isSafeInteger(total) || total > 9_999_999_999) pricingError("El total excede el límite permitido.");
  return total;
}
/** Largest-remainder allocation: exact sum, nonnegative even for tiny amounts/many nights. */
export function allocateCents(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!Number.isSafeInteger(total) || total < 0 || total > sum) pricingError("El descuento supera el importe de la selección.");
  if (!sum) return weights.map(() => 0);
  const pieces = weights.map((weight, index) => {
    const numerator = BigInt(total) * BigInt(weight);
    return { index, value: Number(numerator / BigInt(sum)), remainder: numerator % BigInt(sum) };
  });
  const ranked = [...pieces].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  let remainder = total - pieces.reduce((s, p) => s + p.value, 0);
  for (const piece of ranked) if (remainder-- > 0) piece.value++;
  return pieces.map(p => p.value);
}
export function editNights(existing: PricedNight[], edit: NightlyEdit): PricedNight[] {
  nightlyTotal(existing);
  if (edit.kind === "stay") {
    const dates = calendarNights(edit.checkIn, edit.checkOut);
    const byDate = new Map(existing.map(n => [n.date, n]));
    const added = edit.addedRates || {};
    const result = dates.map(date => byDate.get(date) || {
      date, rateCents: moneyCents(added[date]), discountCents: 0,
    });
    nightlyTotal(result);
    return result;
  }
  if (edit.kind !== "rates" || !Array.isArray(edit.dates) || !edit.dates.length ||
      new Set(edit.dates).size !== edit.dates.length || edit.dates.some(d => !existing.some(n => n.date === d))) pricingError("Seleccioná noches existentes sin repetir.");
  if (!["percent", "amount"].includes(edit.discountMode) || !["night", "selection"].includes(edit.discountScope)) pricingError("Elegí un modo y alcance de descuento válidos.");
  const selected = existing.filter(n => edit.dates.includes(n.date));
  const rates = selected.map(n => edit.rate === undefined || edit.rate === "" ? n.rateCents : moneyCents(edit.rate));
  let discounts = selected.map(n => n.discountCents);
  if (edit.discount !== undefined && edit.discount !== "") {
    const value = moneyCents(edit.discount);
    if (edit.discountMode === "percent") {
      if (value > 10_000) pricingError("El porcentaje debe estar entre 0 y 100.");
      discounts = rates.map(rate => Number((BigInt(rate) * BigInt(value) + 5_000n) / 10_000n));
    } else {
      discounts = edit.discountScope === "selection" ? allocateCents(value, rates) : rates.map(() => value);
    }
  }
  const changed = new Map(selected.map((n, index) => [n.date, { ...n, rateCents: rates[index], discountCents: discounts[index] }]));
  const result = existing.map(n => changed.get(n.date) || n);
  nightlyTotal(result);
  return result;
}

/** Used only during creation AFTER activation; refuses unexplained totals. */
export function initialNightlyPricing(reservation: Record<string, any>): PricedNight[] {
  const dates = calendarNights(reservation.checkInDate, reservation.checkOutDate);
  const net = moneyCents(reservation.totalRoomAmount ?? amountString(moneyCents(reservation.finalRatePerNight ?? "0") * dates.length));
  const base = moneyCents(reservation.baseRatePerNight ?? reservation.finalRatePerNight ?? "0");
  const gross = base * dates.length;
  if (net > gross) pricingError("El total contratado supera las tarifas informadas. Revisá el desglose antes de crear la reserva.");
  const discounts = allocateCents(gross - net, dates.map(() => base));
  const lines = dates.map((date, i) => ({ date, rateCents: base, discountCents: discounts[i] }));
  nightlyTotal(lines);
  return lines;
}
