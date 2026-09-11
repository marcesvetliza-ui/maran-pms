import { describe, expect, it } from "vitest";
import { canInvoiceReservationPayment, getReservationFinancialSummary, getReservationRateAuditEvent } from "./reservationFolio";

describe("reservation payment invoice eligibility", () => {
  it("allows only active payments without fiscal recovery/link state", () => {
    expect(canInvoiceReservationPayment({ status: "active" })).toBe(true);
    expect(canInvoiceReservationPayment({ status: "anulado" })).toBe(false);
    expect(canInvoiceReservationPayment({ status: "active", invoiceRef: { id: 1 } })).toBe(false);
    expect(canInvoiceReservationPayment({ status: "active", invoiceLinkFailed: true })).toBe(false);
    expect(canInvoiceReservationPayment({ status: "active", pendingAuthorization: { id: 2 } })).toBe(false);
  });
});

describe("reservation folio financial summary", () => {
  it("keeps services and historical cash intact after a full credit note", () => {
    const summary = getReservationFinancialSummary(
      143000,
      [
        { id: "parking", amount: "2500", category: "otros", status: "active" } as any,
        {
          id: "nc-audit",
          amount: "-43000",
          category: "adjustment",
          status: "active",
          description: "Ajuste por NC [nc:90:accommodation]",
        },
      ],
      [{
        id: "cash-1",
        amount: "43000",
        invoiceRef: JSON.stringify({ id: 12, tipo_comprobante: "FB", punto_venta: 1, numero: 8 }),
      }],
      [{
        id: 12,
        tipo_comprobante: "FB",
        punto_venta: 1,
        numero: 8,
        monto_total: "43000",
        monto_acreditado: "43000",
        estado: "anulada",
      }],
    );

    expect(summary).toMatchObject({
      operationalServices: 145500,
      netInvoiced: 0,
      pendingGrossInvoice: 145500,
      historicalPayments: 43000,
      releasedAvailableAdvance: 43000,
      newCollectionNeeded: 102500,
    });
  });

  it("counts Cuenta Corriente as an active settlement, never as released cash credit", () => {
    const summary = getReservationFinancialSummary(
      139000,
      [
        { id: "parking", amount: "2500", category: "otros", status: "active" },
        { id: "minibar", amount: "1200", category: "otros", status: "active" },
      ],
      [
        {
          id: "cc",
          amount: "139000",
          method: "cuenta_corriente",
          invoiceRef: JSON.stringify({ id: 10, tipo_comprobante: "FB", punto_venta: 1, numero: 1 }),
        },
        {
          id: "cash",
          amount: "3700",
          method: "efectivo",
          invoiceRef: JSON.stringify({ id: 11, tipo_comprobante: "FB", punto_venta: 1, numero: 2 }),
        },
      ],
      [
        { id: 10, tipo_comprobante: "FB", monto_total: "139000", monto_acreditado: "0", estado: "emitida" },
        { id: 11, tipo_comprobante: "FB", monto_total: "3700", monto_acreditado: "2500", estado: "parcial" },
      ],
    );

    expect(summary).toMatchObject({
      operationalServices: 142700,
      activeHistoricalSettlements: 142700,
      operationalFolioBalance: 0,
      netInvoiced: 140200,
      pendingInvoicing: 2500,
      availableReleasedCredit: 2500,
      newCollectionNeeded: 0,
    });
  });

  it("uses active charges and payments while ignoring annulled rows", () => {
    const summary = getReservationFinancialSummary(
      1000,
      [
        { id: "active-charge", amount: "250", category: "otros", status: "active" },
        { id: "void-charge", amount: "900", category: "otros", status: "anulado" },
      ],
      [
        { id: "active-payment", amount: "1250", method: "efectivo", status: "active" },
        { id: "void-payment", amount: "600", method: "efectivo", status: "anulado" },
      ],
      [],
    );

    expect(summary).toMatchObject({
      operationalServices: 1250,
      activeHistoricalSettlements: 1250,
      operationalFolioBalance: 0,
    });
  });
});

describe("reservation rate chronology", () => {
  it("records an explicit initial assignment and later previous/new rate", () => {
    expect(getReservationRateAuditEvent(null, "139000", true)).toEqual({
      tipo: "tarifa",
      descripcion: "Tarifa inicial asignada: $139000.00 por noche",
    });
    expect(getReservationRateAuditEvent("139000", 145000)).toEqual({
      tipo: "tarifa",
      descripcion: "Tarifa modificada: $139000.00 → $145000.00 por noche",
    });
  });

  it("does not fabricate events for omitted or unchanged rates", () => {
    expect(getReservationRateAuditEvent(undefined, undefined, true)).toBeNull();
    expect(getReservationRateAuditEvent("139000", "139000")).toBeNull();
    expect(getReservationRateAuditEvent("139000", "")).toBeNull();
  });

  it("treats an annulled invoice as zero fiscal coverage even with stale credit data", () => {
    const summary = getReservationFinancialSummary(1000, [], [], [{
      tipo_comprobante: "FB",
      monto_total: 1000,
      monto_acreditado: 0,
      estado: "anulada",
    }]);
    expect(summary.netInvoiced).toBe(0);
    expect(summary.pendingInvoicing).toBe(1000);
  });
});