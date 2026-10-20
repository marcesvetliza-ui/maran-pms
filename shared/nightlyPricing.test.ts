import { describe, it, expect } from "vitest";
import { buildPackagePricingPatch } from "../client/src/lib/reservation-package-pricing";
import { allocateCents, calendarNights, editNights, initialNightlyPricing, moneyCents, nightlyTotal, type NightlyEdit } from "./nightlyPricing";
const nights = [
  { date: "2026-10-20", rateCents: 9_000_000, discountCents: 0 },
  { date: "2026-10-21", rateCents: 9_500_000, discountCents: 0 },
];
const edit = (extra: Partial<Extract<NightlyEdit, { kind: "rates" }>> = {}) =>
  editNights(nights, { kind: "rates", dates: nights.map(n => n.date), discountMode: "amount", discountScope: "night", ...extra });
describe("Contratos nocturnos en centavos", () => {
  it("mantiene tarifas diferentes con pesos por noche y porcentaje real", () => {
    const pesos = edit({ discount: "5000" });
    expect(pesos.map(n => n.rateCents)).toEqual([9_000_000, 9_500_000]);
    expect(nightlyTotal(pesos)).toBe(17_500_000);
    const percent = edit({ discount: "10", discountMode: "percent" });
    expect(percent.map(n => n.discountCents)).toEqual([900_000, 950_000]);
    expect(nightlyTotal(percent)).toBe(16_650_000);
  });
  it("vacío conserva descuentos; cero elimina; un valor nuevo reemplaza", () => {
    const old = edit({ discount: "5000" });
    const base = { kind: "rates" as const, dates: nights.map(n => n.date), discountMode: "amount" as const, discountScope: "night" as const };
    expect(editNights(old, { ...base, rate: "", discount: "" })).toEqual(old);
    expect(editNights(old, { ...base, discount: "0" }).map(n => n.discountCents)).toEqual([0, 0]);
    expect(editNights(old, { ...base, discount: "3000" }).map(n => n.discountCents)).toEqual([300_000, 300_000]);
  });
  it("tarifa común explícita reemplaza sólo seleccionadas", () => {
    const result = edit({ dates: [nights[0].date], rate: "123.45" });
    expect(result[0].rateCents).toBe(12345);
    expect(result[1]).toEqual(nights[1]);
  });
  it("distribuye un total proporcional sin perder un centavo", () => {
    const result = edit({ discount: "10000.01", discountScope: "selection" });
    expect(result.reduce((s, n) => s + n.discountCents, 0)).toBe(1_000_001);
    expect(result[0].discountCents).not.toBe(result[1].discountCents);
    expect(allocateCents(1, [1, 1, 1])).toEqual([1, 0, 0]);
    expect(allocateCents(0, [0, 0])).toEqual([0, 0]);
  });
  it("propiedad de distribución: suma exacta y límites por noche", () => {
    for (let size = 1; size <= 30; size++) {
      const weights = Array.from({ length: size }, (_, i) => i * 13 + 1);
      const sum = weights.reduce((s, n) => s + n, 0);
      for (const total of [0, 1, Math.floor(sum / 3), sum]) {
        const pieces = allocateCents(total, weights);
        expect(pieces.reduce((s, n) => s + n, 0)).toBe(total);
        expect(pieces.every((value, i) => Number.isInteger(value) && value >= 0 && value <= weights[i])).toBe(true);
      }
    }
  });
  it.each(["-1", "NaN", "Infinity", "1.001", "", "1e3"])("rechaza importe %s", value => expect(() => moneyCents(value)).toThrow());
  it.each(["100.01", "-1"])("rechaza porcentaje fuera de rango %s", discount => expect(() => edit({ discount, discountMode: "percent" })).toThrow());
  it("no admite descuento mayor a la tarifa ni reducción incompatible", () => {
    expect(() => edit({ discount: "90001" })).toThrow();
    expect(() => edit({ discount: "185001", discountScope: "selection" })).toThrow();
    const old = edit({ discount: "5000" });
    expect(() => editNights(old, { kind: "rates", dates: [nights[0].date], rate: "1", discountMode: "amount", discountScope: "night" })).toThrow();
  });
  it("conserva noches retenidas y exige precio explícito para agregadas", () => {
    const old = edit({ discount: "5000" });
    expect(() => editNights(old, { kind: "stay", checkIn: "2026-10-20", checkOut: "2026-10-23", addedRates: {} })).toThrow();
    const result = editNights(old, { kind: "stay", checkIn: "2026-10-21", checkOut: "2026-10-23", addedRates: { "2026-10-22": "97000.01" } });
    expect(result[0]).toEqual(old[1]);
    expect(result[1]).toEqual({ date: "2026-10-22", rateCents: 9_700_001, discountCents: 0 });
  });
  it("fechas calendarias independientes de zona horaria, incluye año bisiesto", () => {
    expect(calendarNights("2028-02-28", "2028-03-01")).toEqual(["2028-02-28", "2028-02-29"]);
    expect(() => calendarNights("2026-02-30", "2026-03-02")).toThrow();
    expect(() => calendarNights("2026-03-02", "2026-03-02")).toThrow();
  });
  it.each([3,6,7])("conserva el total de un paquete de %i noches sin crear descuentos por redondeo", count => {
    const dates = calendarNights("2090-01-01", `2090-01-${String(count+1).padStart(2,"0")}`);
    const lines = initialNightlyPricing({...buildPackagePricingPatch(100,count),checkInDate:dates[0],checkOutDate:`2090-01-${String(count+1).padStart(2,"0")}`});
    expect(nightlyTotal(lines)).toBe(10000);
    expect(lines.every(n=>n.discountCents===0)).toBe(true);
    expect(Math.max(...lines.map(n=>n.rateCents))-Math.min(...lines.map(n=>n.rateCents))).toBeLessThanOrEqual(1);
  });
  it("contrata al crear con total exacto y no inventa un importe incompatible", () => {
    const result = initialNightlyPricing({ checkInDate: "2026-10-20", checkOutDate: "2026-10-22", baseRatePerNight: "90000", totalRoomAmount: "179999.99" });
    expect(nightlyTotal(result)).toBe(17_999_999);
    expect(result.map(n => n.discountCents)).toEqual([1, 0]);
    expect(() => initialNightlyPricing({ checkInDate: "2026-10-20", checkOutDate: "2026-10-22", baseRatePerNight: "1", totalRoomAmount: "3" })).toThrow();
  });
});
