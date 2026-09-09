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
    expect(formatHotelDateTime(timestamp, { twoDigitYear: true })).toBe("03/09/26 22:30");
  });

  it("formatea aperturas y movimientos administrativos en la misma hora del hotel", () => {
    const openedAt = new Date("2026-09-04T01:30:00.000Z");

    expect(formatHotelDateTime(openedAt)).toBe("03/09/2026 22:30");
    expect(formatHotelTime(openedAt)).toBe("22:30");
  });

  it("muestra en folios la hora argentina del instante reportado", () => {
    expect(formatHotelTime("2026-09-09T23:00:00.000Z")).toBe("20:00");
    expect(formatHotelDateTime("2026-09-09T19:21:04.345Z", { twoDigitYear: true }))
      .toBe("09/09/26 16:21");
  });

  it("usa el ciclo 00–23 durante la primera hora del día", () => {
    const midnight = "2026-09-04T03:00:00.000Z";
    const halfPastMidnight = "2026-09-04T03:30:00.000Z";

    expect(formatHotelDateTime(midnight)).toBe("04/09/2026 00:00");
    expect(formatHotelTime(midnight)).toBe("00:00");
    expect(formatHotelDateTime(halfPastMidnight)).toBe("04/09/2026 00:30");
    expect(formatHotelTime(halfPastMidnight)).toBe("00:30");
  });

  it("cubre las presentaciones de cada pantalla operativa corregida", () => {
    const timestamp = "2026-09-04T01:30:00.000Z";
    const operationalFormats = [
      ["mantenimiento: reportada", formatHotelDateTime(timestamp, { twoDigitYear: true }).split(" ")[0], "03/09/26"],
      ["mantenimiento: completada", formatHotelDateTime(timestamp), "03/09/2026 22:30"],
      ["restaurant: apertura e impresión de cocina", formatHotelTime(timestamp), "22:30"],
      ["eventos: cierres", formatHotelDateTime(timestamp), "03/09/2026 22:30"],
      ["operaciones y caja: horarios de turnos", formatHotelTime(timestamp), "22:30"],
      ["dashboard: actividad reciente", formatHotelDateTime(timestamp), "03/09/2026 22:30"],
      ["inventario: movimiento", formatHotelDateTime(timestamp, { includeYear: false }), "03/09 22:30"],
      ["inventario: impresión", formatHotelDateTime(timestamp), "03/09/2026 22:30"],
      ["housekeeping: préstamo", formatHotelDateTime(timestamp, { includeYear: false }), "03/09 22:30"],
      ["caja: auditoría e impresión", formatHotelDateTime(timestamp), "03/09/2026 22:30"],
      ["hospitalidad: reconocimiento", formatHotelDateTime(timestamp, { includeYear: false }), "03/09 22:30"],
      ["OTA: última sincronización", formatHotelDateTime(timestamp), "03/09/2026 22:30"],
      ["email: registro", formatHotelDateTime(timestamp), "03/09/2026 22:30"],
      ["reporte diario, grupos y SPA: impresión", formatHotelDateTime(timestamp), "03/09/2026 22:30"],
      ["reservas: cancelación", formatHotelDateTime(timestamp), "03/09/2026 22:30"],
      ["reservas: historial de cambios", formatHotelDateTime(timestamp), "03/09/2026 22:30"],
      ["reseñas: análisis", formatHotelDateTime(timestamp), "03/09/2026 22:30"],
      ["vouchers: emisión y uso", formatHotelDateTime(timestamp), "03/09/2026 22:30"],
      ["FolioViewer: año abreviado", formatHotelDateTime(timestamp, { twoDigitYear: true }), "03/09/26 22:30"],
    ] as const;

    for (const [screen, formatted, expected] of operationalFormats) {
      expect(formatted, screen).toBe(expected);
    }
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