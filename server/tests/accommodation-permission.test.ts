import { describe, expect, it } from "vitest";
import { accommodationPermission, changesAccommodation } from "@shared/accommodationPermission";

describe("individual accommodation permission", () => {
  it("preserves reception defaults without granting other roles", () => {
    expect(accommodationPermission("reception", null)).toBe(true);
    expect(accommodationPermission("piloto_externo", null)).toBe(false);
    expect(accommodationPermission("housekeeping", null)).toBe(false);
  });
  it("individual grant and revocation take precedence over roles, including admin", () => {
    expect(accommodationPermission("piloto_externo", true)).toBe(true);
    expect(accommodationPermission("reception", false)).toBe(false);
    expect(accommodationPermission("admin", false)).toBe(false);
  });
  it("can preserve the main system's existing role-based access without importing demo defaults", () => {
    expect(accommodationPermission("responsable_area", null, true)).toBe(true);
    expect(accommodationPermission("responsable_area", false, true)).toBe(false);
    expect(accommodationPermission("piloto_externo", true, false)).toBe(true);
  });
  it("does not block notes/guest edits or semantically identical financial values", () => {
    expect(changesAccommodation({ finalRatePerNight: "100.00" }, { notes: "nota", finalRatePerNight: 100 })).toBe(false);
    expect(changesAccommodation({ ratePlanId: null }, { ratePlanId: "" })).toBe(false);
  });
  it.each(["baseRatePerNight", "finalRatePerNight", "totalRoomAmount", "discountValue", "nights", "checkInDate", "checkOutDate", "discountType", "nightlyPricing", "pricingScheme", "packageId"])("detects changes to %s", key => {
    expect(changesAccommodation({ [key]: "1" }, { [key]: "2" })).toBe(true);
  });
});
