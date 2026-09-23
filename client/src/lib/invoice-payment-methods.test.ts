import { describe, expect, it } from "vitest";
import {
  buildAppliedPaymentApplications,
  buildAppliedPaymentMethodDetails,
  buildInvoicePaymentMethods,
} from "./invoice-payment-methods";

describe("invoice payment method detail", () => {
  it("sends the method for a single cash payment", () => {
    expect(buildInvoicePaymentMethods([
      { method: "efectivo", amount: "125000" },
    ])).toEqual({
      cashFormaPago: "efectivo",
      cashFormaPagoDetalle: [{ method: "efectivo", amount: 125000 }],
    });
  });

  it("preserves split payments and their amounts", () => {
    expect(buildInvoicePaymentMethods([
      { method: "efectivo", amount: "50000" },
      { method: "tarjeta", amount: "75000" },
    ])).toEqual({
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
    ])).toEqual({
      cashFormaPago: "pago_dividido",
      cashFormaPagoDetalle: [
        { method: "efectivo", amount: 50000 },
        { method: "cuenta_corriente", amount: 75000 },
      ],
    });
  });

  it("preserves the real method of applied prior payments", () => {
    const applied = buildAppliedPaymentMethodDetails([
      { method: "tarjeta_credito", amount: "151500", availableAdvanceAmount: 151500 },
      { method: "tarjeta_credito", amount: "4500", availableAdvanceAmount: 4500 },
    ], 151500);

    expect(buildInvoicePaymentMethods([
      {
        method: "transferencia",
        amount: "80000",
        retencionEnabled: true,
        retencionTipo: "iibb",
        retencionMonto: "5000",
      },
    ], applied)).toEqual({
      cashFormaPago: "pago_dividido",
      cashFormaPagoDetalle: [
        { method: "tarjeta_credito", amount: 151500 },
        { method: "transferencia", amount: 80000 },
        { method: "retencion_iibb", amount: 5000 },
      ],
    });
  });

  it("gives a retención its own line instead of folding it into the real payment method", () => {
    expect(buildInvoicePaymentMethods([
      {
        method: "efectivo",
        amount: "98000",
        retencionEnabled: true,
        retencionTipo: "ganancias",
        retencionMonto: "2000",
      },
    ])).toEqual({
      cashFormaPago: "pago_dividido",
      cashFormaPagoDetalle: [
        { method: "efectivo", amount: 98000 },
        { method: "retencion_ganancias", amount: 2000 },
      ],
    });
  });

  it("skips an oversized ordinary advance so detail matches the payment that can be linked", () => {
    expect(buildAppliedPaymentMethodDetails([
      { method: "tarjeta_credito", amount: "151500", availableAdvanceAmount: 151500 },
      { method: "efectivo", amount: "4500", availableAdvanceAmount: 4500 },
    ], 4500)).toEqual([
      { method: "efectivo", amount: 4500 },
    ]);
  });

  it("partially reapplies released credit while preserving its original method", () => {
    expect(buildAppliedPaymentApplications([
      {
        id: "card-credit",
        method: "tarjeta_credito",
        amount: "151500",
        availableAdvanceAmount: 151500,
        releasedFromCreditedInvoice: true,
      },
    ], 4500)).toEqual([{
      paymentId: "card-credit",
      method: "tarjeta_credito",
      amount: 4500,
      releasedFromCreditedInvoice: true,
    }]);
  });

  it("applies released credit first and ordinary advances in the same date/id order as the server", () => {
    expect(buildAppliedPaymentApplications([
      { id: "b", date: "2026-09-21", method: "efectivo", amount: 50 },
      { id: "a", date: "2026-09-20", method: "transferencia", amount: 30 },
      {
        id: "released",
        date: "2026-09-22",
        method: "tarjeta_credito",
        amount: 10,
        releasedFromCreditedInvoice: true,
      },
    ], 50)).toEqual([
      {
        paymentId: "released",
        method: "tarjeta_credito",
        amount: 10,
        releasedFromCreditedInvoice: true,
      },
      {
        paymentId: "a",
        method: "transferencia",
        amount: 30,
        releasedFromCreditedInvoice: false,
      },
    ]);
  });

  it("does not include a stale collection row when the caller has no new collection", () => {
    const applied = buildAppliedPaymentMethodDetails([
      { method: "tarjeta_credito", amount: "4500", availableAdvanceAmount: 4500 },
    ], 4500);
    expect(buildInvoicePaymentMethods([], applied)).toEqual({
      cashFormaPago: "tarjeta_credito",
      cashFormaPagoDetalle: [{ method: "tarjeta_credito", amount: 4500 }],
    });
  });
});