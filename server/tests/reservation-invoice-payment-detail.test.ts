import { describe, expect, it } from "vitest";
import { validateReservationInvoicePaymentDetail } from "../billing/routes";

describe("reservation invoice payment detail validation", () => {
  it("accepts payment methods that exactly cover the invoice", () => {
    expect(() => validateReservationInvoicePaymentDetail([
      { method: "tarjeta_credito", amount: 151500 },
      { method: "transferencia", amount: 4500 },
    ], 156000)).not.toThrow();
  });

  it("rejects stale payment amounts carried from another invoice", () => {
    expect(() => validateReservationInvoicePaymentDetail([
      { method: "efectivo", amount: 151500 },
      { method: "tarjeta_credito", amount: 4500 },
    ], 4500)).toThrow(/no coinciden con el total/);
  });

  it("rejects unknown methods instead of treating them as cash", () => {
    expect(() => validateReservationInvoicePaymentDetail([
      { method: "otro", amount: 4500 },
    ], 4500)).toThrow(/Forma de pago inválida/);
  });

  it("rejects a missing detail for reservation invoices", () => {
    expect(() => validateReservationInvoicePaymentDetail(undefined, 4500))
      .toThrow(/debe informar sus formas de pago/);
  });
});