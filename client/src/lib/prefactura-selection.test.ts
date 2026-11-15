import { beforeEach, describe, expect, it } from "vitest";
import { readPrefacturaSelection, savePrefacturaSelection, retainedPrefacturaSelection, originalPrefacturaLines, pendingPrefacturaSourceIds } from "./prefactura-selection";

beforeEach(() => sessionStorage.clear());
describe("Selección explícita por reserva", () => {
  it("distingue selección ausente, vacía y guardada; no mezcla reservas", () => {
    expect(readPrefacturaSelection(sessionStorage, "202")).toBeNull();
    savePrefacturaSelection(sessionStorage, "202", []);
    expect([...readPrefacturaSelection(sessionStorage, "202")!]).toEqual([]);
    expect(readPrefacturaSelection(sessionStorage, "706")).toBeNull();
    savePrefacturaSelection(sessionStorage, "202", ["extra"]);
    expect([...readPrefacturaSelection(sessionStorage, "202")!]).toEqual(["extra"]);
  });
  it("elimina conceptos que dejaron de ser elegibles sin seleccionar nuevos", () => {
    expect([...retainedPrefacturaSelection(["extra", "anulado"], ["extra", "noche", "nuevo"])]).toEqual(["extra"]);
  });
  it("rechaza almacenamiento roto o perteneciente a otra reserva", () => {
    sessionStorage.setItem("prefactura-selection:202", "{");
    expect(() => readPrefacturaSelection(sessionStorage, "202")).toThrow("No se pudo conservar");
    sessionStorage.setItem("prefactura-selection:202", JSON.stringify({ version: 1, reservationId: "706", ids: [] }));
    expect(() => readPrefacturaSelection(sessionStorage, "202")).toThrow();
    expect(() => savePrefacturaSelection({ setItem() { throw Error("quota"); } }, "202", [])).toThrow("No se emitió ni cobró");
  });
  it("muestra las líneas congeladas y conserva sus fuentes, no las del folio nuevo", () => {
    const attempt = { invoiceRequest: { sourceChargeIds: ["accommodation:noche", "extra"],
      items: [{ descripcion: "Noche", subtotal: 150000 }, { descripcion: "Cargo", subtotal: 1000 }] },
      invoice: null, payments: [], checkoutRequested: false };
    expect(pendingPrefacturaSourceIds(attempt)).toEqual(["accommodation:noche", "extra"]);
    expect(originalPrefacturaLines(attempt)).toEqual([{ description: "Noche", amount: 150000 }, { description: "Cargo", amount: 1000 }]);
    expect(originalPrefacturaLines(attempt).reduce((sum, line) => sum + line.amount, 0)).toBe(151000);
  });
});
