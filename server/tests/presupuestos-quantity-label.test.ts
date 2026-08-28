import { describe, expect, it } from "vitest";
import { getPresupuestoQuantityLabel, getRecipientDetails } from "../routes/presupuestos";

describe("presupuesto PDF quantity label", () => {
  it("uses NOCHES only when every item is accommodation", () => {
    expect(getPresupuestoQuantityLabel([{ sector: "alojamiento" }])).toBe("NOCHES");
    expect(getPresupuestoQuantityLabel([{ sector: "alojamiento" }, { sector: "restaurant" }])).toBe("CANTIDAD");
  });

  it("builds the recipient line rendered by the PDFs", () => {
    expect(getRecipientDetails({
      cuit: "30-71234567-8",
      direccion: "San Martín 123, Paraná",
      contacto: "Ana · ana@example.invalid",
    })).toBe("CUIT: 30-71234567-8 · Dirección: San Martín 123, Paraná · Contacto: Ana · ana@example.invalid");
  });
});