import { describe, expect, it, vi } from "vitest";
import {
  assertInvoiceEmittedForLink,
  assertSameOriginalInvoice,
  canonicalInvoiceReference,
  canonicalPaymentLinkState,
} from "../billing/invoiceLinkIntegrity";

describe("group invoice link integrity", () => {
  it.each(["autorizacion_pendiente", "anulada", "parcial"])(
    "rejects %s before a linkage mutation",
    (estado) => {
      const mutate = vi.fn();
      expect(() => {
        assertInvoiceEmittedForLink({ id: 7, estado });
        mutate();
      }).toThrow();
      expect(mutate).not.toHaveBeenCalled();
      try {
        assertInvoiceEmittedForLink({ id: 7, estado });
      } catch (error: any) {
        expect(error.statusCode).toBe(409);
      }
    },
  );

  it("builds proof from the canonical emitted row and keeps retry idempotency possible", () => {
    const canonical = {
      id: 42,
      estado: "emitida",
      tipoComprobante: "FB",
      puntoVenta: 4,
      numero: 99,
      cae: "canonical-cae",
      caeFechaVto: "2026-12-01",
      montoTotal: "150.00",
    };
    assertInvoiceEmittedForLink(canonical);
    const first = canonicalInvoiceReference(canonical);
    const retry = canonicalInvoiceReference(canonical);
    expect(retry).toEqual(first);
    expect(first).toMatchObject({
      tipoComprobante: "FB",
      puntoVenta: 4,
      numero: 99,
      cae: "canonical-cae",
      estado: "emitida",
    });
    expect(first).not.toMatchObject({
      tipoComprobante: "FA",
      puntoVenta: 999,
      cae: "client-forged",
    });
  });

  it("produces a completed payment-link and reconciliation state from canonical fields", () => {
    const state = canonicalPaymentLinkState({
      id: 8,
      estado: "emitida",
      tipo_comprobante: "FB",
      punto_venta: 2,
      numero: 77,
      cae: "server-cae",
      monto_total: "45.00",
      // Browser-forged data is never an input to this canonical row helper.
    });
    expect(JSON.parse(state.invoiceRef)).toEqual(state.invoice);
    expect(state).toMatchObject({
      invoiceLinkFailed: false,
      reconciliationStatus: "conciliada",
      reconciliationError: null,
      invoice: { tipoComprobante: "FB", puntoVenta: 2, numero: 77, cae: "server-cae" },
    });
  });

  it("rejects replacement of established original invoice provenance", () => {
    const original = { id: 8, tipoComprobante: "FB", puntoVenta: 2, numero: 77 };
    expect(() => assertSameOriginalInvoice(original, {
      id: 9,
      tipoComprobante: "FB",
      puntoVenta: 2,
      numero: 77,
    })).toThrow(/no puede reemplazarse/i);
    try {
      assertSameOriginalInvoice(original, { id: 9 });
    } catch (error: any) {
      expect(error.statusCode).toBe(409);
    }
  });

  it("allows metadata enrichment for the same immutable invoice identity", () => {
    expect(() => assertSameOriginalInvoice(
      { id: 8, tipoComprobante: "FB", puntoVenta: 2, numero: 77 },
      { id: 8, tipoComprobante: "FB", puntoVenta: 2, numero: 77, cae: "updated" },
    )).not.toThrow();
    expect(() => assertSameOriginalInvoice(
      { id: 8, tipoComprobante: "FB", puntoVenta: 2, numero: 77 },
      { reconciliationError: "network timeout" },
    )).not.toThrow();
  });
});