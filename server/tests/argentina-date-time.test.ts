import { afterEach, describe, expect, it } from "vitest";
import {
  formatArgentinaDate,
  formatArgentinaDateTime,
  formatArgentinaFilenameTimestamp,
  getArgentinaOperationalParts,
} from "../utils/argentinaDateTime";

const originalTimeZone = process.env.TZ;

afterEach(() => {
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }
});

describe("Argentina server date/time formatting", () => {
  it("formats instants in Buenos Aires when the process uses another timezone", () => {
    process.env.TZ = "Pacific/Kiritimati";
    const instant = new Date("2026-09-05T01:30:00.000Z");

    expect(instant.getDate()).toBe(5);
    expect(instant.getHours()).toBe(15);
    expect(formatArgentinaDate(instant)).toBe("04/09/2026");
    expect(formatArgentinaDateTime(instant)).toBe("04/09/2026 22:30");
    expect(formatArgentinaFilenameTimestamp(instant)).toBe("04_09_2026_22_30");
    expect(getArgentinaOperationalParts(instant)).toEqual({
      date: "2026-09-04",
      time: "22:30",
      hour: 22,
    });
  });

  it("preserves calendar-only dates without timezone conversion", () => {
    process.env.TZ = "Pacific/Kiritimati";

    expect(formatArgentinaDate("2026-09-05")).toBe("05/09/2026");
  });

  it("rejects invalid timestamp values instead of silently shifting them", () => {
    expect(() => formatArgentinaDateTime("not-a-date")).toThrow(RangeError);
  });
});