import { describe, expect, it } from "vitest";
import {
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
