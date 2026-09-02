import { describe, expect, it } from "vitest";
import { allocateDebitReversalBySource } from "@shared/reservationDebitNote";

describe("reservation debit-note source allocation", () => {
  it("restores a partial ND proportionally across the NC source amounts", () => {
    expect(allocateDebitReversalBySource(
      { accommodation: 80, parking: 20 },
      {},
      50,
    )).toEqual({ accommodation: 40, parking: 10 });
  });

  it("uses only the still-reversible amount after an earlier ND", () => {
    expect(allocateDebitReversalBySource(
      { accommodation: 80, parking: 20 },
      { accommodation: 40, parking: 10 },
      50,
    )).toEqual({ accommodation: 40, parking: 10 });
  });

  it("rejects a second reversal above the NC balance", () => {
    expect(() => allocateDebitReversalBySource(
      { accommodation: 80, parking: 20 },
      { accommodation: 80, parking: 20 },
      1,
    )).toThrow("supera el saldo reversible");
  });

  it("keeps cent-level allocations equal to the requested total", () => {
    const result = allocateDebitReversalBySource(
      { accommodation: 33.33, parking: 33.33, restaurant: 33.34 },
      {},
      10,
    );
    expect(Object.values(result).reduce((sum, amount) => sum + amount, 0)).toBe(10);
  });
});