import { describe, expect, it } from "vitest";
import { getUncoveredReservationSettlement } from "../billing/reservationCreditReconciliation";

describe("reservation CC invoice settlement", () => {
  it("uses only the uncovered remainder for partial credit", () => {
    expect(getUncoveredReservationSettlement(144000, [{ amount: 44000 }])).toBe(100000);
  });

  it("does not create a settlement amount when credit covers the invoice", () => {
    expect(getUncoveredReservationSettlement(144000, [{ amount: 144000 }])).toBe(0);
  });

  it("leaves a plain CC invoice fully uncovered", () => {
    expect(getUncoveredReservationSettlement(100000, [])).toBe(100000);
  });
});