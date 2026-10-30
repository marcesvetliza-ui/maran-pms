import { describe, it, expect } from "vitest";
import { canEditPurchaseInvoice, purchaseInvoiceBalanceAfterEdit as balance } from "./purchase-invoice-edit";

describe("purchase invoice historical correction", () => {
  it("grants only the administration lead the state exception", () => {
    for (const state of ["pendiente", "parcial", "pagado", "registrado", "anulado"]) expect(canEditPurchaseInvoice("resp_administracion", state)).toBe(true);
    for (const role of [undefined, "admin", "manager", "resp_deposito", "reception"]) {
      expect(canEditPurchaseInvoice(role, "pendiente")).toBe(true);
      for (const state of ["parcial", "pagado", "registrado", "anulado"]) expect(canEditPurchaseInvoice(role, state)).toBe(false);
    }
  });
  it("preserves settled amounts when correcting a partial invoice", () => {
    const original = { estado: "parcial", monto_total: "100.00", saldo_pendiente: "40.00" };
    expect(balance(original, 120, true)).toEqual({ saldo: 60, estado: "parcial" });
    expect(balance(original, 60, true)).toEqual({ saldo: 0, estado: "pagado" });
    expect(() => balance(original, 59, true)).toThrow(/ya cancelado/);
  });
  it("does not reopen a paid invoice on a correction with unchanged total", () => {
    expect(balance({ estado: "pagado", monto_total: "100", saldo_pendiente: "0" }, 100, true)).toEqual({ saldo: 0, estado: "pagado" });
    expect(balance({ estado: "pagado", monto_total: "100", saldo_pendiente: "0" }, 120, true)).toEqual({ saldo: 20, estado: "parcial" });
  });
  it("does not fabricate cash or credit-note settlements", () => {
    for (const props of [{ condicion_pago: "contado" }, { tipo_comprobante: "NC-A" }]) {
      const original = { estado: "pagado", monto_total: "100", saldo_pendiente: "0", ...props };
      expect(() => balance(original, 110, true)).toThrow(/ajustá primero/);
      expect(balance(original, 100, true)).toEqual({ saldo: 0, estado: "pagado" });
    }
  });
  it("preserves cancelled and informational states", () => {
    for (const estado of ["anulado", "registrado"]) expect(balance({ estado, monto_total: "100", saldo_pendiente: "0" }, 120, true)).toEqual({ estado, saldo: 0 });
  });
  it("keeps rounding in cents and handles legacy pending records", () => {
    expect(balance({ estado: "parcial", monto_total: "0.30", saldo_pendiente: "0.20" }, .31, true)).toEqual({ estado: "parcial", saldo: .21 });
    expect(balance({ estado: "pendiente", monto_total: "96", saldo_pendiente: "100" }, 100, true)).toEqual({ estado: "pendiente", saldo: 100 });
  });
});
