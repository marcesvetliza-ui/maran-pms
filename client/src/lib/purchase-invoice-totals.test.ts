import { describe, expect, it } from "vitest";
import {
  calculatePurchaseInvoiceAmountsFromNetLines,
  calculatePurchaseInvoiceTotal,
  mapPurchaseInvoiceAmountFields,
  purchaseInvoiceRetentionSide,
  shouldRegisterPracticedIibbRetention,
} from "@shared/purchaseInvoiceTotals";

describe("purchase invoice totals", () => {
  it("adds suffered retentions to a card settlement total", () => {
    const amounts = calculatePurchaseInvoiceAmountsFromNetLines([
      { neto: "112837.20", alicuota: "21" },
      { neto: "48944.87", alicuota: "10.5" },
    ]);

    expect(amounts).toMatchObject({
      montoNeto: "161782.07",
      montoIva21: "23695.81",
      montoIva105: "5139.21",
    });

    const total = calculatePurchaseInvoiceTotal({
      tipoComprobante: "LIQ-TARJETA",
      ...amounts,
      retencionIibb: "13646.50",
      percepcionIva: "4087.08",
    });

    expect(total).toBe(208350.67);
    expect(purchaseInvoiceRetentionSide("LIQ-TARJETA")).toBe("debe");
    expect(shouldRegisterPracticedIibbRetention("LIQ-TARJETA")).toBe(false);
  });

  it("keeps subtracting practiced retentions from a regular invoice", () => {
    const total = calculatePurchaseInvoiceTotal({
      tipoComprobante: "FACT-A",
      montoNeto: "100.00",
      montoIva21: "21.00",
      percepcionIva: "5.00",
      retencionIibb: "10.00",
    });

    expect(total).toBe(116);
    expect(purchaseInvoiceRetentionSide("FACT-A")).toBe("haber");
    expect(shouldRegisterPracticedIibbRetention("FACT-A")).toBe(true);
  });

  it("preserves every amount used when editing an existing invoice", () => {
    expect(mapPurchaseInvoiceAmountFields({
      monto_neto: "100.00",
      monto_iva21: "21.00",
      monto_iva105: "10.50",
      monto_iva27: "27.00",
      monto_iva5: "5.00",
      monto_iva25: "2.50",
      monto_exento: "30.00",
      monto_no_gravado: "40.00",
      impuestos_internos: "4.00",
      ley_25413: "3.00",
      percepcion_iibb: "2.00",
      percepcion_iva: "1.00",
      percepcion_ganancias: "6.00",
      retencion_iibb: "7.00",
      retencion_ganancias: "8.00",
      retencion_iva: "9.00",
      retencion_suss: "10.00",
      monto_total: "217.00",
    })).toEqual({
      montoNeto: "100.00",
      montoIva21: "21.00",
      montoIva105: "10.50",
      montoIva27: "27.00",
      montoIva5: "5.00",
      montoIva25: "2.50",
      montoExento: "30.00",
      montoNoGravado: "40.00",
      impuestosInternos: "4.00",
      ley25413: "3.00",
      percepcionIibb: "2.00",
      percepcionIva: "1.00",
      percepcionGanancias: "6.00",
      retencionIibb: "7.00",
      retencionGanancias: "8.00",
      retencionIva: "9.00",
      retencionSuss: "10.00",
      montoTotal: "217.00",
    });
  });
});