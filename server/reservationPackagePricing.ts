import { moneyCents, pricingError, type PricedNight } from "../shared/nightlyPricing";
/** Applying a package never changes an existing stay's dates or ancillary charges. */
export function packageNightlyProposal(reservation: any, pkg: any, before: PricedNight[]) {
  if (!pkg || pkg.status !== "active") pricingError("El paquete no está disponible.", 409);
  if (pkg.nights !== before.length) pricingError("La duración del paquete no coincide con la reserva. Modificá primero la estadía desde el Folio.", 409);
  if ((pkg.validFrom && reservation.checkInDate < pkg.validFrom) || (pkg.validUntil && before.some(n => n.date > pkg.validUntil))) pricingError("El paquete no está vigente para las fechas de esta reserva.", 409);
  const roomPrice = pkg.roomPrices?.find((p: any) => p.roomTypeId === reservation.roomTypeId);
  if (pkg.roomTypeId && pkg.roomTypeId !== reservation.roomTypeId && !roomPrice) pricingError("El paquete no tiene precio para la categoría de esta reserva.", 409);
  if (reservation.voucherId || Number(reservation.voucherAppliedAmount || 0) > 0) pricingError("La reserva tiene un voucher aplicado. Revisá su aplicación antes de cambiarla a paquete.", 409);
  const total = moneyCents(roomPrice ? roomPrice.price : pkg.basePrice);
  const base = Math.floor(total / before.length), remainder = total % before.length;
  return { packageId: pkg.id, packageName: pkg.name, packageTotalCents: total,
    after: before.map((night, i) => ({date: night.date, rateCents: base + (i < remainder ? 1 : 0), discountCents: 0})) };
}
export function packageNotes(notes: string | null | undefined, name: string) {
  const rest = (notes || "").replace(/\[Paquete:[^\]]*\]\s*/g, "").trim();
  return `[Paquete: ${name.replace(/[\[\]\r\n]/g," ")}]${rest ? ` ${rest}` : ""}`;
}
