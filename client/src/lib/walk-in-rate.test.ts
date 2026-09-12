import { describe, expect, it } from "vitest";
import { canUseWalkInRate } from "./walk-in-rate";

describe("walk-in rate validation", () => {
  it("rejects a walk-in without a selected rate", () => {
    expect(canUseWalkInRate({
      usesSpecialRate: false,
      selectedRatePlanExists: false,
      effectiveNightRate: "0",
      specialRateReason: "",
      specialRateAmountProvided: false,
    })).toBe(false);
  });

  it("accepts an applicable rate plan with a positive rate", () => {
    expect(canUseWalkInRate({
      usesSpecialRate: false,
      selectedRatePlanExists: true,
      effectiveNightRate: "85000",
      specialRateReason: "",
      specialRateAmountProvided: true,
    })).toBe(true);
  });

  it("requires a reason for a special rate, including a valid zero rate", () => {
    const base = {
      usesSpecialRate: true,
      selectedRatePlanExists: false,
      specialRateAmountProvided: true,
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
    })).toBe(true);
    expect(canUseWalkInRate({
      ...base,
      effectiveNightRate: "65000",
      specialRateReason: "Convenio comercial",
    })).toBe(true);
  });

  it("does not treat an empty manual-rate field as an explicit zero", () => {
    expect(canUseWalkInRate({
      usesSpecialRate: true,
      selectedRatePlanExists: false,
      effectiveNightRate: "0",
      specialRateReason: "Cortesía",
      specialRateAmountProvided: false,
    })).toBe(false);
  });

  it("requires a reason when an ordinary rate plan resolves to zero", () => {
    expect(canUseWalkInRate({
      usesSpecialRate: false,
      selectedRatePlanExists: true,
      effectiveNightRate: "0",
      specialRateReason: "",
      specialRateAmountProvided: true,
    })).toBe(false);
    expect(canUseWalkInRate({
      usesSpecialRate: false,
      selectedRatePlanExists: true,
      effectiveNightRate: "0",
      specialRateReason: "Canje",
      specialRateAmountProvided: true,
    })).toBe(true);
  });
});