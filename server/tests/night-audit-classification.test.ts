import { describe, expect, it } from "vitest";
import {
  isActiveNightAuditPayment,
  isNightAuditReportingOnly,
  classifyReservationRate,
  parseNightAuditDetail,
} from "@shared/nightAudit";

describe("night audit execution policy", () => {
  it("forces historical runs into reporting-only mode even before the first audit", () => {
    expect(isNightAuditReportingOnly({ isManual: true, forceDate: "2020-01-01" }, false)).toBe(true);
    expect(isNightAuditReportingOnly({ isManual: true }, false)).toBe(false);
    expect(isNightAuditReportingOnly({ isManual: true }, true)).toBe(true);
  });

  it("treats null and active payment statuses as active, but excludes voided", () => {
    expect(isActiveNightAuditPayment(null)).toBe(true);
    expect(isActiveNightAuditPayment("active")).toBe(true);
    expect(isActiveNightAuditPayment("anulado")).toBe(false);
    expect(isActiveNightAuditPayment("pending")).toBe(false);
  });

  it("classifies malformed and zero rates without flagging positive rates", () => {
    expect(classifyReservationRate(null, null)).toBe("missingOrZeroWithoutReason");
    expect(classifyReservationRate(" ", null)).toBe("missingOrZeroWithoutReason");
    expect(classifyReservationRate("abc", null)).toBe("missingOrZeroWithoutReason");
    expect(classifyReservationRate("0", null)).toBe("missingOrZeroWithoutReason");
    expect(classifyReservationRate("0", "cortesía")).toBe("zeroWithReason");
    expect(classifyReservationRate("125.50", null)).toBeNull();
  });

  it("parses legacy and malformed detail safely", () => {
    expect(parseNightAuditDetail('{"inHouse":[{"id":"r1"}],"arrivals":[]}').inHouse).toHaveLength(1);
    expect(parseNightAuditDetail('not-json')).toMatchObject({ version: 0, inHouse: [], arrivals: [] });
  });
});