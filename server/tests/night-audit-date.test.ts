import { describe, expect, it } from "vitest";
import { addCalendarDays } from "@shared/nightAuditDate";

describe("night audit date-only arithmetic", () => {
  it("derives the next date across month and year boundaries", () => {
    expect(addCalendarDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(addCalendarDays("2024-12-31", 1)).toBe("2025-01-01");
  });

  it("supports historical audit dates independently of today", () => {
    expect(addCalendarDays("2019-07-15", 1)).toBe("2019-07-16");
  });
});