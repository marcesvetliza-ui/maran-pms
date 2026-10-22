import { it, expect } from "vitest";
import { hasDailyHousekeepingPending as pending } from "./housekeepingService";
it("identifica el servicio pendiente de una habitación que sigue ocupada", () => {
  expect(pending("occupied", "2026-10-21", "2026-10-22")).toBe(true);
});
it("no confunde un ingreso, un servicio de hoy ni un bloqueo con limpieza pendiente", () => {
  for (const [status, day] of [
    ["occupied", null],
    ["occupied", "2026-10-22"],
    ["limpia_ocupada", "2026-10-21"],
    ["no_molestar", "2026-10-21"],
    ["maintenance", "2026-10-21"],
  ])
    expect(pending(status, day, "2026-10-22")).toBe(false);
});
