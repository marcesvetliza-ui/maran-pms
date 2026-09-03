import { describe, expect, it } from "vitest";
import { formatHotelDateTime, formatHotelTime } from "./hotelTime";

describe("horarios operativos del hotel", () => {
  it("usa Buenos Aires al cruzar de día aunque el navegador use otra zona", () => {
    const timestamp = "2026-09-04T01:30:00.000Z";

    expect(formatHotelDateTime(timestamp)).toBe("03/09/2026 22:30");
    expect(formatHotelTime(timestamp)).toBe("22:30");
  });

  it("permite formatos administrativos abreviados y con segundos", () => {
    const timestamp = "2026-09-04T01:30:45.000Z";

    expect(formatHotelDateTime(timestamp, { includeYear: false })).toBe("03/09 22:30");
    expect(formatHotelDateTime(timestamp, { includeSeconds: true })).toBe("03/09/2026 22:30:45");
  });

  it("no interpreta fechas calendario como marcas horarias", () => {
    const calendarDate = "2026-09-04";

    expect(calendarDate).toBe("2026-09-04");
  });

  it("tolera marcas vacías o inválidas", () => {
    expect(formatHotelDateTime(null)).toBe("—");
    expect(formatHotelDateTime("fecha inválida")).toBe("—");
  });
});