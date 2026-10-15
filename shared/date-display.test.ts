import { describe, it, expect } from "vitest";
import { formatDisplayDate, formatDisplayDateTime } from "./date-display";

describe("Argentine dates for display", () => {
  it("keeps calendar dates on their specified day and pads day/month", () => {
    expect(formatDisplayDate("2026-10-09")).toBe("09/10/2026");
    expect(formatDisplayDate("2024-02-29")).toBe("29/02/2024");
    expect(formatDisplayDate("9/10/2026")).toBe("09/10/2026");
  });
  it("converts instants to Argentina, including the previous day at UTC midnight", () => {
    expect(formatDisplayDate("2026-10-09T01:30:00Z")).toBe("08/10/2026");
    expect(formatDisplayDateTime("2026-10-09T01:30:00Z")).toBe("08/10/2026 22:30");
    expect(formatDisplayDateTime(new Date("2026-10-09T03:00:00Z"))).toBe("09/10/2026 00:00");
    expect(formatDisplayDateTime("2026-10-09")).toBe("09/10/2026");
  });
  it("handles empty or invalid dates without exposing Invalid Date", () => {
    for (const value of [null, undefined, "", "not-a-date", "2026-02-30", "2026-99-09", new Date(NaN)]) {
      expect(formatDisplayDate(value)).toBe("—");
      expect(formatDisplayDateTime(value)).toBe("—");
    }
  });
  it("does not mutate values used by forms or API payloads", () => {
    const payload = { date: "2026-10-09", timestamp: new Date("2026-10-09T01:30:00Z") };
    formatDisplayDate(payload.date);
    formatDisplayDateTime(payload.timestamp);
    expect(payload.date).toBe("2026-10-09");
    expect(payload.timestamp.toISOString()).toBe("2026-10-09T01:30:00.000Z");
  });
});
