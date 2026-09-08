import { describe, expect, it } from "vitest";
import {
  getPresupuestoQuantityLabel,
  getRecipientDetails,
  groupEventosItems,
  shouldMoveEventosGroupToFreshPage,
} from "../routes/presupuestos";

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

  it("groups Eventos items by configured category order and infers legacy items from the catalog", () => {
    const groups = groupEventosItems(
      [
        { descripcion: "Conferencia Básico", category: "equipamiento" },
        { descripcion: "Parque Urquiza" },
        { descripcion: "Cóctel 1", category: "coctel" },
      ],
      [{ name: "Parque Urquiza", category: "salon" }],
    );

    expect(groups.map(group => group.label)).toEqual([
      "Salones",
      "Cócteles",
      "Equipamiento Técnico",
    ]);
    expect(groups[0].items[0].descripcion).toBe("Parque Urquiza");
  });

  it("moves a complete category only when it fits on a fresh page", () => {
    expect(shouldMoveEventosGroupToFreshPage(600, 180, 158, 717)).toBe(true);
    expect(shouldMoveEventosGroupToFreshPage(600, 600, 158, 717)).toBe(false);
  });
});