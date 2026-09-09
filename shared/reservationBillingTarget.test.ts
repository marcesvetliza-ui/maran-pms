import { describe, expect, it } from "vitest";
import { resolveReservationBillingTarget } from "./reservationBillingTarget";

describe("reservation advance billing target", () => {
  it("prefers the explicit payment company over reservation defaults", () => {
    expect(resolveReservationBillingTarget(
      { billingTarget: "company", companyId: "ESCO-PAY" },
      { companyId: "reservation-company", agencyId: "agency", guestId: "guest" },
    )).toEqual({ type: "company", id: "ESCO-PAY" });
  });

  it("preserves an explicit guest target on a company reservation", () => {
    expect(resolveReservationBillingTarget(
      { billingTarget: "guest" },
      { companyId: "company", guestId: "reservation-guest" },
    )).toEqual({ type: "guest", id: "reservation-guest" });
  });

  it("preserves an explicit agency target and recovers its reservation agency ID", () => {
    expect(resolveReservationBillingTarget(
      { billingTarget: "agency", agencyId: null },
      { companyId: "company", agencyId: "reservation-agency", guestId: "guest" },
    )).toEqual({ type: "agency", id: "reservation-agency" });
  });

  it.each([
    [{ companyId: "company" }, { type: "company", id: "company" }],
    [{ agencyId: "agency" }, { type: "agency", id: "agency" }],
    [{ guestId: "guest" }, { type: "guest", id: "guest" }],
  ])("falls back company, agency, then guest", (reservation, expected) => {
    expect(resolveReservationBillingTarget({}, reservation)).toEqual(expected);
  });
});