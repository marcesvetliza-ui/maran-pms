import { describe, expect, it } from "vitest";
import { parseGroupInvoiceSourceAmounts } from "../billing/groupInvoiceScope";
import { calcularMontos } from "../billing/invoiceService";
import { allocateGroupInvoiceSources, grossItemsTotal } from "../../client/src/lib/group-invoice-allocation";

describe("group invoice source availability", () => {
  it("keeps a partial invoice allocation by concept", () => {
    expect(parseGroupInvoiceSourceAmounts({
      monto_total: "100.00",
      monto_acreditado: "0.00",
      source_charge_amounts: {
        "reservation:r-1:accommodation": 70,
        "group-charge:g-1": 30,
      },
    })).toEqual({
      "reservation:r-1:accommodation": 70,
      "group-charge:g-1": 30,
    });
  });

  it("restores the proportional available amount after a partial credit note without a legacy source map", () => {
    expect(parseGroupInvoiceSourceAmounts({
      monto_total: "100.00",
      monto_acreditado: "25.00",
      source_charge_amounts: {
        "reservation:r-1:accommodation": 60,
        "group-charge:g-1": 40,
      },
      credit_source_charge_amounts: [],
    })).toEqual({
      "reservation:r-1:accommodation": 45,
      "group-charge:g-1": 30,
    });
  });

  it("uses an explicit credit-note allocation when it is available for a deterministic reissue", () => {
    expect(parseGroupInvoiceSourceAmounts({
      monto_total: "100.00",
      monto_acreditado: "25.00",
      source_charge_amounts: {
        "reservation:r-1:accommodation": 60,
        "group-charge:g-1": 40,
      },
      credit_source_charge_amounts: [{
        "reservation:r-1:accommodation": 20,
        "group-charge:g-1": 5,
      }],
    })).toEqual({
      "reservation:r-1:accommodation": 40,
      "group-charge:g-1": 35,
    });
  });

  it("preserves gross cents across multiple VAT lines", () => {
    const totals = calcularMontos([
      { descripcion: "Concepto 1", cantidad: 1, precioUnitario: 0.03, alicuotaIva: "21", subtotalNeto: 0.02, subtotal: 0.03 },
      { descripcion: "Concepto 2", cantidad: 1, precioUnitario: 0.03, alicuotaIva: "21", subtotalNeto: 0.02, subtotal: 0.03 },
    ], "FB");

    expect(totals).toMatchObject({ montoNeto: 0.05, montoIva21: 0.01, montoTotal: 0.06 });
  });

  it("builds a group source payload from gross cents instead of rounded IVA preview values", () => {
    const items = [{
      descripcion: "Concepto de tres centavos",
      cantidad: 1,
      precioUnitario: 0.03,
      alicuotaIva: "21",
      subtotalNeto: 0.02,
      subtotal: 0.03,
    }];
    const total = grossItemsTotal(items);

    expect(total).toBe(0.03);
    expect(allocateGroupInvoiceSources([{ id: "group-charge:g-1", available: 0.03 }], total))
      .toEqual({ "group-charge:g-1": 0.03 });
    expect(calcularMontos(items, "FB").montoTotal).toBe(total);
  });
});