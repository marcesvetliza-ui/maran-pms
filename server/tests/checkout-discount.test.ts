import { describe, expect, it } from "vitest";
import { calculateCheckoutDiscount } from "@shared/checkoutDiscount";
import { getReservationFinancialSummary } from "@shared/reservationFolio";

describe("checkout discount", () => {
  it("applies percent and fixed discounts to accommodation plus extras", () => {
    const sources = { accommodation: 100000, extra: 20000 };
    expect(calculateCheckoutDiscount(sources, { type: "percent", value: 10, reason: "Efectivo" }))
      .toMatchObject({ originalTotal: 120000, amount: 12000, sourceAmounts: { accommodation: 10000, extra: 2000 } });
    expect(calculateCheckoutDiscount(sources, { type: "fixed", value: 6000, reason: "Acuerdo" }).sourceAmounts)
      .toEqual({ accommodation: 5000, extra: 1000 });
  });
  it("allocates every cent exactly with uneven sources", () => {
    const result = calculateCheckoutDiscount({ a: 10, b: 10, c: 10 }, { type: "fixed", value: 1, reason: "Acuerdo" });
    expect(result.sourceAmounts).toEqual({ a: 0.34, b: 0.33, c: 0.33 });
  });
  it.each([
    { type: "percent", value: 101, reason: "Efectivo" },
    { type: "fixed", value: -1, reason: "Efectivo" },
    { type: "fixed", value: 100, reason: "Efectivo" },
    { type: "fixed", value: Infinity, reason: "Efectivo" },
    { type: "percent", value: 10, reason: " " },
  ])("rejects invalid discounts before writes", input => {
    expect(() => calculateCheckoutDiscount({ accommodation: 100 }, input as any)).toThrow();
  });
  it("reduces debt without recording the discount as received cash", () => {
    const summary = getReservationFinancialSummary(100, [{ amount: -10, category: "adjustment", description: "Descuento" }],
      [{ amount: 90, method: "efectivo" }], [{ tipo_comprobante: "FB", monto_total: 90, estado: "emitida" }]);
    expect(summary).toMatchObject({ operationalServices: 90, historicalPayments: 90, pendingInvoicing: 0, operationalFolioBalance: 0 });
  });
});
