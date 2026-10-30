import { createHash } from "node:crypto";
import { z } from "zod";
import { addDays, daysBetween } from "./ari";

export class BookingReviewError extends Error { constructor(readonly code: string) { super(code); } }
export const review = (code: string): never => { throw new BookingReviewError(code); };
// Never persist payment-card, guarantee, document or free-text values from
// notifications. Only a fetched revision is a source for booking changes.
export function redactBooking(value: unknown): any {
  if (Array.isArray(value)) return value.map(redactBooking);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, val]) =>
    [key, /card|cvv|cvc|guarantee|password|token|document|passport|notes|message|special_requests/i.test(key) ? "[redacted]" : redactBooking(val)]));
  return value;
}
export const revisionHash = (value: unknown): string => {
  const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
};
const id = z.string().min(1).max(160).refine(value => value === value.trim());
const money = z.union([z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/), z.number().finite().nonnegative().refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001)])
  .transform(value => Math.round(Number(value) * 100)).refine(value => Number.isSafeInteger(value) && value <= 9999999999);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { try { return addDays(value, 0) === value; } catch { return false; } });
// Channex serializes UTC insertion timestamps without an offset, including
// microseconds. Add the UTC designator explicitly, never the server's timezone.
const insertedAt = z.string().transform(value =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/.test(value) ? `${value}Z` : value
).pipe(z.string().datetime({ offset: true }));
const roomSchema = z.object({
  id: id.optional(), booking_room_id: id.optional(), room_type_id: id, rate_plan_id: id,
  days: z.record(day, money), occupancy: z.object({ adults: z.number().int().min(1).max(20), children: z.number().int().min(0).max(20).default(0), infants: z.number().int().min(0).max(20).default(0) }),
});
export function parseBookingRevision(raw: any, property: string) {
  const head = z.object({
    id, attributes: z.object({
      booking_id: id, property_id: id,
      inserted_at: insertedAt, status: z.enum(["new", "modified", "cancelled"]),
    }).passthrough()
  }).safeParse(raw);
  if (!head.success) return review("INVALID_REVISION");
  const { attributes: a } = head.data;
  if (a.property_id !== property) return review("WRONG_PROPERTY");
  const base = { revisionId: head.data.id, bookingId: a.booking_id, insertedAt: a.inserted_at, status: a.status };
  if (a.status === "cancelled") return { ...base, currency: null, customer: null, arrival: null, departure: null, rooms: [] };
  const data = z.object({
    currency: z.string().regex(/^[A-Z]{3}$/), arrival_date: day, departure_date: day,
    amount: money, customer: z.object({
      name: z.string().trim().min(1).max(120), surname: z.string().trim().max(120).default(""),
      mail: z.string().email().max(254).nullish(), phone: z.string().max(80).nullish()
    }),
    rooms: z.array(roomSchema).min(1).max(20),
  }).safeParse(a);
  if (!data.success) return review("INVALID_BOOKING");
  const b = data.data;
  let dates: string[];
  try { dates = daysBetween(b.arrival_date, addDays(b.departure_date, -1)); } catch { return review("INVALID_STAY"); }
  const keys = b.rooms.map(room => room.booking_room_id || room.id || (b.rooms.length === 1 ? "single" : review("MISSING_ROOM_ID")));
  if (new Set(keys).size !== keys.length) return review("DUPLICATE_ROOM_ID");
  const rooms = b.rooms.map((room, index) => {
    if (Object.keys(room.days).length !== dates.length || dates.some(date => room.days[date] === undefined)) return review("INCOMPLETE_NIGHTLY_RATES");
    return {
      key: keys[index], remoteType: room.room_type_id, remotePlan: room.rate_plan_id,
      occupancy: room.occupancy.adults + room.occupancy.children + room.occupancy.infants,
      nights: dates.map(date => ({ date, rateCents: room.days[date], discountCents: 0 })),
      totalCents: dates.reduce((sum, date) => sum + room.days[date], 0)
    };
  });
  if (rooms.reduce((sum, room) => sum + room.totalCents, 0) !== b.amount) return review("TOTAL_REQUIRES_REVIEW");
  return { ...base, currency: b.currency, customer: b.customer, arrival: b.arrival_date, departure: b.departure_date, rooms };
}
export type ParsedBookingRevision = ReturnType<typeof parseBookingRevision>;
