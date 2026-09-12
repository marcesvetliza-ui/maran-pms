import { describe, expect, it } from "vitest";
import { buildInvoicePaymentMethods } from "./invoice-payment-methods";

describe("invoice payment method detail", () => {
  it("sends the method for a single cash payment", () => {
    expect(buildInvoicePaymentMethods([
      { method: "efectivo", amount: "125000" },
    ], 0)).toEqual({
      cashFormaPago: "efectivo",
      cashFormaPagoDetalle: [{ method: "efectivo", amount: 125000 }],
    });
  });

  it("preserves split payments and their amounts", () => {
    expect(buildInvoicePaymentMethods([
      { method: "efectivo", amount: "50000" },
      { method: "tarjeta", amount: "75000" },
    ], 0)).toEqual({
      cashFormaPago: "pago_dividido",
      cashFormaPagoDetalle: [
        { method: "efectivo", amount: 50000 },
        { method: "tarjeta", amount: 75000 },
      ],
    });
  });

  it("keeps a Cuenta Corriente row inside a split payment without classifying the whole invoice as Cuenta Corriente", () => {
    expect(buildInvoicePaymentMethods([
      { method: "efectivo", amount: "50000" },
      { method: "cuenta_corriente", amount: "75000" },
    ], 0)).toEqual({
      cashFormaPago: "pago_dividido",
      cashFormaPagoDetalle: [
        { method: "efectivo", amount: 50000 },
        { method: "cuenta_corriente", amount: 75000 },
      ],
    });
  });

  it("includes applied advances and retentions in the documented split", () => {
    expect(buildInvoicePaymentMethods([
      {
        method: "transferencia",
        amount: "80000",
        retencionEnabled: true,
        retencionMonto: "5000",
      },
    ], 20000)).toEqual({
      cashFormaPago: "pago_dividido",
      cashFormaPagoDetalle: [
        { method: "adelanto", amount: 20000 },
        { method: "transferencia", amount: 85000 },
      ],
    });
  });
});