import { describe, expect, it } from "vitest";
import { getReservationFinancialSummary } from "./reservationFolio";

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
});