import { describe, expect, it } from "vitest";
import {
  assertOperationalCashArea,
  getCashShiftAreaVariants,
  isValidCashShiftArea,
  normalizeCashShiftArea,
} from "../cashArea";

describe("cash shift area aliases", () => {
  it.each([
    ["reception", "recepcion", ["reception", "recepcion"]],
    ["recepcion", "recepcion", ["reception", "recepcion"]],
    ["eventos", "events", ["eventos", "events"]],
    ["events", "events", ["eventos", "events"]],
    ["restaurant", "restaurant", ["restaurant"]],
  ])("normalizes and resolves %s", (rawArea, normalizedArea, variants) => {
    expect(normalizeCashShiftArea(rawArea)).toBe(normalizedArea);
    expect(getCashShiftAreaVariants(rawArea)).toEqual(variants);
  });

  it("validates aliases against the canonical cash shift areas", () => {
    expect(isValidCashShiftArea("reception")).toBe(true);
    expect(isValidCashShiftArea("eventos")).toBe(true);
    expect(isValidCashShiftArea("unknown")).toBe(false);
    expect(isValidCashShiftArea(null)).toBe(false);
  });
});

describe("retired Events drawer", () => {
  it.each(["events", "eventos"])("keeps %s readable but blocks new operations", area => {
    expect(isValidCashShiftArea(area)).toBe(true);
    expect(() => assertOperationalCashArea(area)).toThrow(/desactivada/);
  });
  it.each(["reception", "recepcion", "restaurant", "spa"])("keeps %s operational", area => {
    expect(() => assertOperationalCashArea(area)).not.toThrow();
  });
});
