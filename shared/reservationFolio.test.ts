import { describe, expect, it } from "vitest";
import { getNetReservationInvoicedTotal, getNetReservationDocumentedTotal, getAvailableReservationAdvanceTotal, canInvoiceReservationPayment, getReservationFinancialSummary, getReservationRateAuditEvent } from "./reservationFolio";

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

describe("room voucher closes the operation without becoming a fiscal invoice", () => {
  const voucher = { id: 1203, tipo_comprobante: "cierre_habitacion", monto_total: "144000.00", monto_acreditado: "0", estado: "emitida" };
  const payment = { id: "cash-1203", status: "active", amount: "144000.00", method: "efectivo", invoiceRef: JSON.stringify({ id: 1203, tipoComprobante: "cierre_habitacion" }) };
  it("recognizes documented total and leaves collection and documentation at zero", () => {
    expect(getReservationFinancialSummary(144000, [], [payment], [voucher])).toMatchObject({
      netInvoiced: 0, documentedTotal: 144000, nonFiscalDocumentedTotal: 144000,
      historicalPayments: 144000, operationalFolioBalance: 0,
      pendingInvoicing: 0, newCollectionNeeded: 0, availableReleasedCredit: 0,
    });
    expect(getNetReservationInvoicedTotal([voucher])).toBe(0);
    expect(getNetReservationDocumentedTotal([voucher])).toBe(144000);
    expect(getAvailableReservationAdvanceTotal([payment], [voucher])).toBe(0);
  });
  it("leaves only new services outstanding after the voucher", () => {
    expect(getReservationFinancialSummary(144000, [{ amount: 5000, category: "restaurant" }], [payment], [voucher])).toMatchObject({
      pendingInvoicing: 5000, operationalFolioBalance: 5000, newCollectionNeeded: 5000,
    });
  });
  it("does not close with an annulled voucher or another area's voucher", () => {
    expect(getNetReservationDocumentedTotal([{ ...voucher, estado: "anulada" }])).toBe(0);
    expect(getNetReservationDocumentedTotal([{ ...voucher, tipo_comprobante: "cierre_spa" }])).toBe(0);
  });
});


it.each(["FA", "FB", "FC", "FT", "FM", "FMB"])("a fully paid %s closes the documented balance", type => {
  const invoice = { id: 1, tipo_comprobante: type, monto_total: 144000, monto_acreditado: 0, estado: "emitida" };
  expect(getReservationFinancialSummary(144000, [], [{ amount: 144000, status: "active", invoiceRef: JSON.stringify({ id: 1 }) }], [invoice])).toMatchObject({
    netInvoiced: 144000, documentedTotal: 144000, pendingInvoicing: 0, newCollectionNeeded: 0, operationalFolioBalance: 0,
  });
});


it.each(["FB", "cierre_habitacion"])("an issued %s does not hide an unpaid balance", type => {
  const invoice = { id: 1, tipo_comprobante: type, monto_total: 144000, estado: "emitida" };
  expect(getReservationFinancialSummary(144000, [], [{ amount: 50000, status: "active", invoiceRef: JSON.stringify({ id: 1 }) }], [invoice])).toMatchObject({
    documentedTotal: 144000, pendingInvoicing: 0, operationalFolioBalance: 94000, newCollectionNeeded: 94000,
  });
});
