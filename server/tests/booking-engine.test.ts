import { describe, expect, it } from "vitest";
import { bookingStaySchema, bookingConfigSchema, quoteBooking } from "../../shared/booking-engine";
import { readBookingImage } from "../bookingEngineImages";

const plan = { id: "rack", room_type_id: "double", base_rate: "100000.00", currency: "ARS", rate_2pax: "120000.00" };
const stay = { checkIn: "2027-01-02", checkOut: "2027-01-04", adults: 2 };
const config = { ratePlanId: "rack", discountPercent: 10, publicDescription: null, amenities: null,
  photos: null, sortOrder: 0, showInBooking: true };
describe("booking quotes use the selected plan and the PMS calendar", () => {
  it("quotes the full family occupancy without changing the original tariff", () => {
    const familyPlan = { ...plan, rate_3pax: "150000" };
    expect(quoteBooking(familyPlan, [], { ...stay, children: 1, childrenAges: [8] }, 10).totalAmount).toBe(270000);
    for (const patch of [{ children: -1 }, { children: 1.5 }, { children: 5 },
      { adults: 6, children: 1 }, { children: 1, childrenAges: [] }, { children: 1, childrenAges: [13] }])
      expect(bookingStaySchema.safeParse({ ...stay, ...patch }).success).toBe(false);
  });
  it("derives Rack minus 10 percent without mutating Rack", () => {
    const before = JSON.stringify(plan);
    expect(quoteBooking(plan, [], stay, 10)).toMatchObject({ totalAmount: 216000, pricePerNight: 108000, nights: 2 });
    expect(JSON.stringify(plan)).toBe(before);
  });
  it("preserves different nightly prices and discounts in integer cents", () => {
    const quote = quoteBooking(plan, [{ stay_date: "2027-01-03", occupancy_rates: { "2": "150000.01" } }], stay, 10);
    expect(quote.totalAmount).toBe(243000.01);
    expect(quote.variableNightlyRates).toBe(true);
    expect(quote.nightlyPricing[1]).toEqual({ date: "2027-01-03", rateCents: 15000001, discountCents: 1500000 });
  });
  it("uses occupancy overrides then general calendar then base occupancy", () => {
    expect(quoteBooking(plan, [{ stay_date: "2027-01-02", rate: "90000", occupancy_rates: { "2": "95000" } }], stay, 0).totalAmount).toBe(215000);
    expect(quoteBooking(plan, [{ stay_date: "2027-01-02", rate: "90000" }], stay, 0).totalAmount).toBe(210000);
  });
  it.each(["2027-01-02", "2027-01-03"])("closes the whole stay when %s is stop-sell", day => {
    expect(() => quoteBooking(plan, [{ stay_date: day, stop_sell: true }], stay, 10)).toThrow("venta");
  });
  it("does not apply stop-sell or plan validity to the unoccupied checkout night", () => {
    expect(quoteBooking({ ...plan, valid_to: "2027-01-03" }, [{ stay_date: "2027-01-04", stop_sell: true }], stay, 0).nights).toBe(2);
  });
  it("honors arrival closure on check-in, departure closure on checkout", () => {
    expect(() => quoteBooking(plan, [{ stay_date: stay.checkIn, closed_to_arrival: true }], stay, 0)).toThrow("llegadas");
    expect(() => quoteBooking(plan, [{ stay_date: stay.checkOut, closed_to_departure: true }], stay, 0)).toThrow("salidas");
    expect(quoteBooking(plan, [{ stay_date: "2027-01-03", closed_to_arrival: true, closed_to_departure: true }], stay, 0).nights).toBe(2);
  });
  it("enforces arrival minimum, through minimum and maximum", () => {
    for (const values of [{ min_stay_arrival: 3 }, { min_stay_through: 3 }, { max_stay: 1 }])
      expect(() => quoteBooking(plan, [{ stay_date: stay.checkIn, ...values }], stay, 0)).toThrow();
    expect(() => quoteBooking(plan, [{ stay_date: "2027-01-03", min_stay_through: 3 }], stay, 0)).toThrow("mínimo");
    expect(quoteBooking(plan, [{ stay_date: "2027-01-03", min_stay_arrival: 5 }], stay, 0).nights).toBe(2);
  });
  it("does not use expired or future plans for any occupied night", () => {
    expect(() => quoteBooking({ ...plan, valid_from: "2027-01-03" }, [], stay, 0)).toThrow("venta");
    expect(() => quoteBooking({ ...plan, valid_to: "2027-01-02" }, [], stay, 0)).toThrow("venta");
  });
  it.each([NaN, -1, 100, Infinity])("rejects invalid discount %s", discount =>
    expect(() => quoteBooking(plan, [], stay, discount)).toThrow("Descuento"));
  it("rejects zero nightly prices and discounts rounded to zero", () => {
    expect(() => quoteBooking({ ...plan, rate_2pax: "0" }, [], stay, 0)).toThrow();
    expect(() => quoteBooking({ ...plan, rate_2pax: "0.01" }, [], stay, 99.99)).toThrow();
  });
  it.each([
    { checkIn: "2027-02-30" }, { checkOut: stay.checkIn }, { checkOut: "2026-01-01" },
    { adults: 0 }, { adults: 1.5 }, { adults: 7 }, { adults: "2people" }, { checkOut: "2030-01-01" },
  ])("validates civil dates, maximum horizon and integer occupancy %j", patch =>
    expect(bookingStaySchema.safeParse({ ...stay, ...patch }).success).toBe(false));
  it("validates configuration percentages and rejects unknown fields", () => {
    expect(bookingConfigSchema.safeParse(config).success).toBe(true);
    for (const discountPercent of [-1, 100, 10.001, "10"])
      expect(bookingConfigSchema.safeParse({ ...config, discountPercent }).success).toBe(false);
    expect(bookingConfigSchema.safeParse({ ...config, baseRate: 1 }).success).toBe(false);
    expect(bookingConfigSchema.safeParse({ ...config, ratePlanId: null }).success).toBe(true);
  });
});
describe("booking photo validation", () => {
  it.each(["data:image/svg+xml;base64,PHN2Zz4=", "data:text/html;base64,PGgxPg==",
    "data:image/jpeg;base64,PHN2Zz4=", "https://example.com/a.jpg", "", null])("rejects arbitrary content %s", input => {
    expect(() => readBookingImage(input)).toThrow();
  });
  it("rejects oversized encoded content before decoding", () => {
    expect(() => readBookingImage("data:image/jpeg;base64," + "a".repeat(820001))).toThrow();
  });
});
