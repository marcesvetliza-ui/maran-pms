import { describe, expect, it } from "vitest";
import { remitoBalance, validateNonFiscalPayment } from "./purchase-remito";
const nf = [{ tipo_comprobante: "REMITO-NF" }];
describe("Compras no fiscales: efectivo obligatorio", () => {
  it.each(["transferencia", "cheque", "dep_bancario", undefined])("rechaza %s", formaPago => {
    expect(() => validateNonFiscalPayment(nf, { formaPago, efectivo: 100 }, 100)).toThrow("únicamente en efectivo");
  });
  it.each(["depBancario", "cheques", "retencionIibb", "retencionGanancias", "retencionIva", "retencionProfLibs", "compensacion"] as const)("rechaza %s aunque diga efectivo", field => {
    expect(() => validateNonFiscalPayment(nf, { formaPago: "efectivo", efectivo: 100, [field]: 1 }, 100)).toThrow();
  });
  it("rechaza pagos mixtos, insuficientes, excesivos y no finitos", () => {
    expect(() => validateNonFiscalPayment([...nf, { tipo_comprobante: "FACT-A" }], { formaPago: "efectivo", efectivo: 100 }, 100)).toThrow();
    for (const efectivo of [0, 99, 101, "NaN", "Infinity"]) expect(() => validateNonFiscalPayment(nf, { formaPago: "efectivo", efectivo }, 100)).toThrow();
  });
  it("admite efectivo exacto y no cambia los métodos de documentos fiscales", () => {
    expect(() => validateNonFiscalPayment(nf, { formaPago: "efectivo", efectivo: "100.00" }, 100)).not.toThrow();
    expect(() => validateNonFiscalPayment([{ tipo_comprobante: "FACT-A" }], { formaPago: "transferencia" }, 100)).not.toThrow();
  });
});
describe("La factura conserva los pagos del remito", () => {
  it("traslada el saldo y no considera pago un remito de entrega", () => {
    expect(remitoBalance(2420, { tipo_comprobante: "REMITO-NF", monto_total: 2400, saldo_pendiente: 1400 }, 1000)).toMatchObject({ saldo: 1420, estado: "parcial" });
    expect(remitoBalance(2420, { tipo_comprobante: "REMITO", monto_total: 0, saldo_pendiente: 0 }, 0)).toMatchObject({ saldo: 2420, estado: "pendiente" });
  });
  it("bloquea pagos inconsistentes y facturas menores a lo ya pagado", () => {
    const previous = { tipo_comprobante: "REMITO-NF", monto_total: 2400, saldo_pendiente: 1400 };
    expect(() => remitoBalance(2420, previous, 500)).toThrow("conciliación");
    expect(() => remitoBalance(999, previous, 1000)).toThrow("ya pagado");
  });
});
