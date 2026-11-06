import { z } from "zod";
import type { ParsedBookingRevision } from "./bookingRevision";
import { review } from "./bookingRevision";

// Pesos per USD, entered explicitly by the operator. No floating-point FX.
export const settlementRateSchema = z.string().regex(/^\d{1,6}(?:\.\d{1,6})?$/)
  .refine(value => Number(value) > 0);
export function rateUnits(value: unknown): bigint {
  const parsed = settlementRateSchema.safeParse(value);
  if (!parsed.success) return review("SETTLEMENT_RATE_REQUIRED");
  const [whole, fraction = ""] = parsed.data.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}
export function settleBooking(booking: ParsedBookingRevision, rate: string | null) {
  if (booking.currency === "ARS") return booking.rooms;
  if (booking.currency !== "USD") return review("UNSUPPORTED_CURRENCY");
  const units = rateUnits(rate);
  const pieces = booking.rooms.flatMap((room, roomIndex) => room.nights.map((night, nightIndex) => {
    const numerator = BigInt(night.rateCents) * units;
    return { roomIndex, nightIndex, cents: numerator / 1_000_000n, remainder: numerator % 1_000_000n };
  }));
  const originalTotal = booking.rooms.reduce((sum, room) => sum + BigInt(room.totalCents), 0n);
  const target = (originalTotal * units + 500_000n) / 1_000_000n;
  let extra = target - pieces.reduce((sum, piece) => sum + piece.cents, 0n);
  // Largest remainder, stable by original room/night order, preserves the
  // rounded booking total and all room/night sums to the last centavo.
  for (const piece of [...pieces].sort((a, b) => a.remainder === b.remainder ? 0 : a.remainder > b.remainder ? -1 : 1)) {
    if (extra-- > 0n) piece.cents++;
  }
  return booking.rooms.map((room, roomIndex) => {
    const nightly = pieces.filter(piece => piece.roomIndex === roomIndex);
    const total = nightly.reduce((sum, piece) => sum + piece.cents, 0n);
    if (total > 9_999_999_999n) return review("SETTLEMENT_AMOUNT_EXCEEDS_LIMIT");
    return { ...room, totalCents: Number(total), nights: room.nights.map((night, index) => ({ ...night, rateCents: Number(nightly[index].cents) })) };
  });
}
