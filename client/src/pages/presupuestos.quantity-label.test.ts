import { describe, expect, it } from "vitest";
import { getPresupuestoQuantityLabel } from "./presupuestos";

describe("presupuesto quantity label", () => {
  it("uses Noches for an accommodation-only budget", () => {
    expect(getPresupuestoQuantityLabel([
      { sector: "alojamiento" },
      { sector: "alojamiento" },
    ])).toBe("Noches");
  });

  it("keeps Cantidad when the budget contains another sector", () => {
    expect(getPresupuestoQuantityLabel([
      { sector: "alojamiento" },
      { sector: "spa" },
    ])).toBe("Cantidad");
  });
});