import { describe, expect, it } from "vitest";
import { parseBookingRevision } from "../channex/bookingRevision";
import { rateUnits, settleBooking, settlementRateSchema } from "../channex/settlement";
import { settlementSettingsSchema } from "../channex/settlementConfig";
function booking(amount = "250.00", days = { "2026-11-01": "100.00", "2026-11-02": "150.00" }, rooms = 1) {
  return parseBookingRevision({
    id: "r1", attributes: {
      booking_id: "b1", property_id: "p1", inserted_at: "2026-10-30T00:00:00Z", status: "new",
      currency: "USD", arrival_date: "2026-11-01", departure_date: "2026-11-03", amount, customer: { name: "Test" },
      rooms: Array.from({ length: rooms }, (_, index) => ({ id: `room-${index}`, room_type_id: "type", rate_plan_id: "plan", days, occupancy: { adults: 1 } })),
    }
  }, "p1");
}
describe("explicit channel USD settlement in ARS", () => {
  it("converts with decimal precision and preserves the rounded total", () => {
    const source = booking(), saved = structuredClone(source);
    const [room] = settleBooking(source, "1250.123456");
    expect(room.totalCents).toBe(31_253_086);
    expect(room.nights.map(night => night.rateCents)).toEqual([12_501_234, 18_751_852]);
    expect(source).toEqual(saved);
  });
  it("allocates rounding deterministically across rooms and nights", () => {
    const rooms = settleBooking(booking("0.06", { "2026-11-01": "0.01", "2026-11-02": "0.02" }, 2), "1.5");
    expect(rooms.map(room => room.totalCents)).toEqual([5, 4]);
    expect(rooms.map(room => room.nights.map(night => night.rateCents))).toEqual([[2, 3], [1, 3]]);
  });
  it.each(["0", "-1", "1e3", "1.1234567", "1000000", "NaN", "", null, 1234])("requires an explicit exact positive quote: %s", rate => {
    expect(settlementRateSchema.safeParse(rate).success).toBe(false);
    expect(() => rateUnits(rate)).toThrow("SETTLEMENT_RATE_REQUIRED");
  });
  it("does not overflow the existing peso folio or accept another currency", () => {
    expect(() => settleBooking(booking(), "999999")).toThrow("SETTLEMENT_AMOUNT_EXCEEDS_LIMIT");
    expect(() => settleBooking({ ...booking(), currency: "EUR" }, "1250")).toThrow("UNSUPPORTED_CURRENCY");
  });
  it("keeps ARS unchanged and requires an audit reason even when removing a quote", () => {
    const source = { ...booking(), currency: "ARS" };
    expect(settleBooking(source, null)).toEqual(source.rooms);
    expect(settlementSettingsSchema.safeParse({ rate: null, reason: "" }).success).toBe(false);
    expect(settlementSettingsSchema.safeParse({ rate: null, reason: "Cotización desactivada" }).success).toBe(true);
  });
});
