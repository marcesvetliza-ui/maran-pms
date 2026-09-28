import { describe, expect, it } from "vitest";
import { daysBetweenCalendarDates } from "../utils/argentinaDateTime";

describe("daysBetweenCalendarDates", () => {
  it("cuenta los días de calendario entre dos fechas", () => {
    expect(daysBetweenCalendarDates("2026-06-01", "2026-08-15")).toBe(75);
  });

  it("da 0 para la misma fecha", () => {
    expect(daysBetweenCalendarDates("2026-06-01", "2026-06-01")).toBe(0);
  });

  it("cruza fin de año correctamente", () => {
    expect(daysBetweenCalendarDates("2025-12-20", "2026-01-05")).toBe(16);
  });

  it("da negativo si toDate es anterior a fromDate", () => {
    expect(daysBetweenCalendarDates("2026-06-01", "2026-05-01")).toBe(-31);
  });
});
