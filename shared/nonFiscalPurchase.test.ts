import { describe, expect, it } from "vitest";
import { calculatePurchaseInvoiceTotal, isSupplierPayableDocument, isValidPurchaseInvoiceTotal, nonFiscalPurchaseStockTotal, normalizeNonFiscalPurchase } from "./purchaseInvoiceTotals";
import { purchaseInvoiceBalanceAfterEdit } from "./purchase-invoice-edit";

describe("Comprobante no fiscal", () => {
  it("suma los subtotales por presentación, redondeados por renglón", () => {
    expect(nonFiscalPurchaseStockTotal([{ quantity: 2, unitCost: 1200 }, { quantity: 3, unitCost: 100.125 }])).toBe(2700.38);
    expect(() => nonFiscalPurchaseStockTotal([])).toThrow("requiere artículos");
  });
  it("elimina impuestos ocultos y el total equivale al neto", () => {
    const result = normalizeNonFiscalPurchase({ tipoComprobante: "REMITO-NF", montoNeto: "2400", montoIva21: "504", retencionIibb: "50", percepcionIva: "20" });
    expect(result).toMatchObject({ montoIva21: "0", retencionIibb: "0", percepcionIva: "0" });
    expect(calculatePurchaseInvoiceTotal(result)).toBe(2400);
    expect(isValidPurchaseInvoiceTotal("REMITO-NF", 0)).toBe(false);
    expect(isValidPurchaseInvoiceTotal("REMITO", 0)).toBe(true);
  });
  it("genera deuda y conserva pagos anteriores al corregir el importe", () => {
    expect(isSupplierPayableDocument("REMITO-NF")).toBe(true);
    expect(isSupplierPayableDocument("REMITO")).toBe(false);
    expect(purchaseInvoiceBalanceAfterEdit({ estado: "parcial", monto_total: 2400, saldo_pendiente: 1400 }, 2500, true)).toEqual({ saldo: 1500, estado: "parcial" });
  });
});
