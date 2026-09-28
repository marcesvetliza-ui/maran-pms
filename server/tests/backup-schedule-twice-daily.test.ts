/**
 * El backup automático pasó de una corrida diaria (03:00) a dos, cada 12hs
 * (03:00 y 15:00, hora Argentina), a pedido del hotel — un solo backup por
 * día dejaba mucho margen de pérdida de datos si algo pasaba a mitad de la
 * jornada.
 */
import { describe, expect, it } from "vitest";
import { isBackupTime } from "../backup";

function argDate(hour: number, minute: number): Date {
  // Construye un instante UTC tal que, al proyectarlo a America/Argentina/Buenos_Aires
  // (UTC-3, sin horario de verano), caiga exactamente en hour:minute ARG.
  return new Date(Date.UTC(2026, 8, 27, hour + 3, minute));
}

describe("isBackupTime", () => {
  it("es hora de backup a las 03:00 ARG", () => {
    expect(isBackupTime(argDate(3, 0))).toBe(true);
  });

  it("es hora de backup a las 15:00 ARG", () => {
    expect(isBackupTime(argDate(15, 0))).toBe(true);
  });

  it("no es hora de backup a cualquier otra hora", () => {
    expect(isBackupTime(argDate(9, 0))).toBe(false);
    expect(isBackupTime(argDate(21, 0))).toBe(false);
    expect(isBackupTime(argDate(0, 0))).toBe(false);
  });

  it("no es hora de backup si no es exactamente el minuto 0", () => {
    expect(isBackupTime(argDate(3, 1))).toBe(false);
    expect(isBackupTime(argDate(15, 59))).toBe(false);
  });
});
