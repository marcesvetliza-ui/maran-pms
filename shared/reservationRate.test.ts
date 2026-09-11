import { describe, expect, it } from "vitest";
import {
  getReservationRateValidationError,
  isZeroReservationRate,
  normalizeZeroRateNotes,
} from "./reservationRate";

describe("reservation zero-rate rules", () => {
  it("recognizes only a valid numeric zero as a zero rate", () => {
    expect(isZeroReservationRate(0)).toBe(true);
    expect(isZeroReservationRate("0.00")).toBe(true);
    expect(isZeroReservationRate("")).toBe(false);
    expect(isZeroReservationRate("not-a-rate")).toBe(false);
  });

  it("allows zero with a reason and positive rates without one", () => {
    expect(getReservationRateValidationError("0", "Cortesía gerencia")).toBeNull();
    expect(getReservationRateValidationError("100", "")).toBeNull();
  });

  it("rejects zero without a reason, negative rates, and invalid rates", () => {
    expect(getReservationRateValidationError("0", " ")).toMatch(/motivo/i);
    expect(getReservationRateValidationError("-1", "Canje")).toMatch(/negativa/i);
    expect(getReservationRateValidationError("abc", "Canje")).toMatch(/número válido/i);
  });

  it("adds, replaces, and removes the visible zero-rate tag without duplicating it", () => {
    expect(normalizeZeroRateNotes("Observación", "0", "Canje comercial"))
      .toBe("[Tarifa $0: Canje comercial] Observación");
    expect(normalizeZeroRateNotes("[Tarifa $0: Viejo] Observación", 0, "Cortesía"))
      .toBe("[Tarifa $0: Cortesía] Observación");
    expect(normalizeZeroRateNotes("[Tarifa $0: Viejo] Observación", 1200, "Viejo"))
      .toBe("Observación");
  });
});