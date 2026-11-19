import { describe, it, expect } from "vitest";
import { reviewToday, moveReviewDay, reviewPeriod } from "./review-period";
describe("Bandeja diaria de encuestas en Argentina", () => {
  it("antes de las 03:00 UTC sigue siendo el día anterior en el hotel", () => {
    expect(reviewToday(new Date("2026-11-19T02:59:59Z"))).toBe("2026-11-18");
    expect(reviewToday(new Date("2026-11-19T03:00:00Z"))).toBe("2026-11-19");
  });
  it.each([
    ["2026-03-01", -1, "2026-02-28"],
    ["2024-03-01", -1, "2024-02-29"],
    ["2026-01-01", -1, "2025-12-31"],
    ["2026-11-30", 1, "2026-12-01"],
  ])(
    "mueve %s sin cambiar la fecha por la zona del navegador",
    (day, amount, expected) =>
      expect(moveReviewDay(day, Number(amount))).toBe(expected),
  );
  it("ayer sigue al día operativo al dejar la página abierta y la fecha elegida se conserva", () => {
    expect(
      reviewPeriod("yesterday", "2026-11-19", "2026-01-01", "2026-01-05"),
    ).toEqual({ from: "2026-11-18", to: "2026-11-18" });
    expect(
      reviewPeriod("today", "2026-11-19", "2026-01-01", "2026-01-05"),
    ).toEqual({ from: "2026-11-19", to: "2026-11-19" });
    expect(
      reviewPeriod("custom", "2026-11-19", "2026-01-01", "2026-01-05"),
    ).toEqual({ from: "2026-01-01", to: "2026-01-05" });
  });
});
