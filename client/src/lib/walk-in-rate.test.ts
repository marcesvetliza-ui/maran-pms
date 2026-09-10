import { describe, expect, it } from "vitest";
import { canUseWalkInRate } from "./walk-in-rate";

describe("walk-in rate validation", () => {
  it("rejects a walk-in without a selected rate", () => {
    expect(canUseWalkInRate({
      usesSpecialRate: false,
      selectedRatePlanExists: false,
      effectiveNightRate: "0",
      specialRateReason: "",
    })).toBe(false);
  });

  it("accepts an applicable rate plan with a positive rate", () => {
    expect(canUseWalkInRate({
      usesSpecialRate: false,
      selectedRatePlanExists: true,
      effectiveNightRate: "85000",
      specialRateReason: "",
    })).toBe(true);
  });

  it("requires both a positive amount and a reason for a special rate", () => {
    const base = {
      usesSpecialRate: true,
      selectedRatePlanExists: false,
    };

    expect(canUseWalkInRate({
      ...base,
      effectiveNightRate: "65000",
      specialRateReason: "",
    })).toBe(false);
    expect(canUseWalkInRate({
      ...base,
      effectiveNightRate: "0",
      specialRateReason: "Convenio comercial",
    })).toBe(false);
    expect(canUseWalkInRate({
      ...base,
      effectiveNightRate: "65000",
      specialRateReason: "Convenio comercial",
    })).toBe(true);
  });
});