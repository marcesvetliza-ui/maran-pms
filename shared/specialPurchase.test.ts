import { describe, it, expect } from "vitest";
import {
  specialPurchaseTotals,
  specialPurchaseAccountCode,
} from "./specialPurchase";
describe("comprobantes administrativos", () => {
  it("retención no agrega IVA ni cargos", () =>
    expect(
      specialPurchaseTotals({
        tipo: "RETENCION",
        importe: 50,
        neto21: 100,
        percepcionIva: 7,
      }),
    ).toEqual({ neto: 50, iva21: 0, iva105: 0, total: 50 }));
  it("suma bases mixtas y conceptos separados", () =>
    expect(
      specialPurchaseTotals({
        tipo: "LIQ-TARJETA",
        neto21: 100,
        neto105: 200,
        retencionIibb: 3,
        percepcionIva: 4,
      }),
    ).toEqual({ neto: 300, iva21: 21, iva105: 21, total: 349 }));
  it("redondea el IVA por base a centavos", () =>
    expect(
      specialPurchaseTotals({
        tipo: "RESUMEN-BANCO",
        neto21: 1.03,
        ley25413: 0.05,
      }),
    ).toEqual({ neto: 1.03, iva21: 0.22, iva105: 0, total: 1.3 }));
  it("respeta corrección informada, incluso cero", () =>
    expect(
      specialPurchaseTotals({
        tipo: "RESUMEN-BANCO",
        neto21: 100,
        iva21Override: 0,
      }).total,
    ).toBe(100));
  it("asocia retenciones a cuentas de activo", () =>
    expect(specialPurchaseAccountCode("RETENCION", "iva")).toBe(
      "1.1.4.01.04.01",
    ));
});
