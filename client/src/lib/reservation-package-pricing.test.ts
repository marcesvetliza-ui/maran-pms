import { describe, expect, it } from "vitest";
import { buildPackagePricingPatch } from "./reservation-package-pricing";

describe("reservation package pricing", () => {
  it("replaces a previous corporate plan and all persisted rate fields", () => {
    const updated = {
      ratePlanId: "corporate-plan",
      baseRatePerNight: "90000.00",
      finalRatePerNight: "90000.00",
      totalRoomAmount: "180000.00",
      ...buildPackagePricingPatch(120000, 2),
    };

    expect(updated).toMatchObject({
      ratePlanId: "",
      specialRateReason: "",
      baseRatePerNight: "60000.00",
      finalRatePerNight: "60000.00",
      totalRoomAmount: "120000.00",
      discountType: "none",
      discountValue: "0",
    });
  });
});