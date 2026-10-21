import { describe, it, expect } from "vitest";
import {
  availabilitySchema,
  availabilityDescription,
} from "./housekeepingAvailability";
const base = {
  status: "working",
  shift: "night",
  startTime: "22:00",
  endTime: "06:00",
  notes: "",
};
describe("Disponibilidad diaria", () => {
  it("permite turno nocturno y explica el cruce de día", () => {
    expect(availabilitySchema.safeParse(base).success).toBe(true);
    expect(
      availabilityDescription({ ...base, userId: "u", fullName: "Ana" } as any),
    ).toContain("día siguiente");
  });
  it("rechaza horas incompletas, iguales o inválidas", () => {
    for (const patch of [
      { endTime: null },
      { endTime: "22:00" },
      { startTime: "25:00" },
    ])
      expect(availabilitySchema.safeParse({ ...base, ...patch }).success).toBe(
        false,
      );
  });
  it("permite franco sin horario y notas acotadas", () => {
    expect(
      availabilitySchema.safeParse({
        ...base,
        status: "day_off",
        shift: null,
        startTime: null,
        endTime: null,
      }).success,
    ).toBe(true);
    expect(
      availabilitySchema.safeParse({ ...base, notes: "x".repeat(501) }).success,
    ).toBe(false);
  });
});
