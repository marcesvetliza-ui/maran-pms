import { describe, expect, it } from "vitest";
import {
  formatReservationInvoiceRef,
  getAvailableReservationAdvanceTotal,
  getAvailableReservationAdvancePayments,
  getNetReservationInvoicedTotal,
  getOperationalReservationCharges,
  parseReservationInvoiceRef,
} from "@shared/reservationFolio";
import {
  getAllBillableFolioItems,
  getAdvancePaymentIdsToLink,
  getInvoicedAmountsByCharge,
  getRemainingChargeAmounts,
  getSelectedFolioTotal,
} from "@/components/PrefacturaDialog";
import { formatFolioDateAR, folioDateSortValue } from "./utils";

describe("reservation folio after a total credit note", () => {
  it("keeps operational totals, restores fiscal capacity and preserves the original receipt", () => {
    const charges = [
      { id: "parking", category: "otros", description: "Cochera", amount: "2500.00", status: "active", date: "2026-08-31" },
      {
        id: "nc-adjustment",
        category: "adjustment",
        description: "Ajuste por NC NCB 0001-00000087 — Alojamiento [nc:87:accommodation]",
        amount: "-43000.00",
        status: "active",
        date: "2026-08-31",
      },
    ];
    const invoices = [
      {
        id: 86,
        tipo_comprobante: "FB",
        punto_venta: 1,
        numero: 86,
        monto_total: "43000.00",
        monto_acreditado: "43000.00",
        estado: "anulada",
        source_charge_amounts: { accommodation: 43000 },
        credit_source_charge_amounts: [{ accommodation: 43000 }],
      },
      {
        id: 87,
        tipo_comprobante: "NCB",
        punto_venta: 1,
        numero: 87,
        monto_total: "43000.00",
        monto_acreditado: "0.00",
        estado: "emitida",
      },
    ];
    const payments = [{
      id: "payment-1",
      amount: "43000.00",
      status: "active",
      date: "2026-08-31",
      invoiceRef: JSON.stringify({ id: 86, tipoComprobante: "FB", puntoVenta: 1, numero: 86 }),
    }];

    const operationalCharges = getOperationalReservationCharges(charges);
    const operationalTotal = 143000 + operationalCharges.reduce((sum, charge) => sum + Number(charge.amount), 0);
    expect(operationalCharges.map(charge => charge.id)).toEqual(["parking"]);
    expect(operationalTotal).toBe(145500);
    expect(operationalTotal - Number(payments[0].amount)).toBe(102500);

    expect(getNetReservationInvoicedTotal(invoices)).toBe(0);
    const availablePayments = getAvailableReservationAdvancePayments(payments, invoices);
    expect(getAvailableReservationAdvanceTotal(payments, invoices)).toBe(43000);
    expect(getAdvancePaymentIdsToLink(availablePayments, 43000)).toEqual([]);
    expect(operationalTotal - getNetReservationInvoicedTotal(invoices)).toBe(145500);
    expect(formatReservationInvoiceRef(payments[0].invoiceRef)).toBe("FB 0001-00000086");
    expect(formatReservationInvoiceRef(
      JSON.stringify({ tipo_comprobante: "FB", punto_venta: 1, numero: 86 }),
    )).toBe("FB 0001-00000086");

    const folio = {
      roomTotal: 143000,
      roomNumber: "101",
      nights: 1,
      charges,
    };
    const originalItems = getAllBillableFolioItems(folio);
    const remaining = getRemainingChargeAmounts(
      originalItems,
      getInvoicedAmountsByCharge([invoices[0]]),
    );
    expect(getSelectedFolioTotal(getAllBillableFolioItems(folio, {}, remaining))).toBe(145500);

    expect(formatFolioDateAR(charges[0].date)).toBe("31/08/2026");
    expect(formatFolioDateAR(payments[0].date)).toBe("31/08/2026");
    expect(folioDateSortValue("2026-08-31")).toBe(new Date("2026-08-31T12:00:00").getTime());
  });

  it("releases only the credited proportion of a historically linked payment", () => {
    const payments = [{
      id: "payment-1",
      amount: "100.00",
      status: "active",
      invoiceRef: JSON.stringify({ id: 86, tipoComprobante: "FB", puntoVenta: 1, numero: 86 }),
    }];
    const invoices = [{
      id: 86,
      tipo_comprobante: "FB",
      punto_venta: 1,
      numero: 86,
      monto_total: "100.00",
      monto_acreditado: "40.00",
      estado: "parcial",
    }];

    expect(getAvailableReservationAdvancePayments(payments, invoices)).toEqual([
      expect.objectContaining({
        id: "payment-1",
        amount: "100.00",
        availableAdvanceAmount: 40,
        releasedFromCreditedInvoice: true,
      }),
    ]);
    expect(getAvailableReservationAdvanceTotal(payments, invoices)).toBe(40);
  });

  it("subtracts a recorded reapplication while preserving the original receipt", () => {
    const originalRef = {
      id: 86,
      tipoComprobante: "FB",
      puntoVenta: 1,
      numero: 86,
      reapplications: [{
        invoiceId: 87,
        tipoComprobante: "FB",
        puntoVenta: 1,
        numero: 87,
        amount: 40,
      }],
    };
    const payments = [{
      id: "payment-1",
      amount: "100.00",
      status: "active",
      invoiceRef: JSON.stringify(originalRef),
    }];
    const invoices = [
      {
        id: 86,
        tipo_comprobante: "FB",
        punto_venta: 1,
        numero: 86,
        monto_total: "100.00",
        monto_acreditado: "40.00",
        estado: "parcial",
      },
      {
        id: 87,
        tipo_comprobante: "FB",
        punto_venta: 1,
        numero: 87,
        monto_total: "40.00",
        monto_acreditado: "0.00",
        estado: "emitida",
      },
    ];

    expect(parseReservationInvoiceRef(payments[0].invoiceRef)).toMatchObject({
      tipoComprobante: "FB",
      puntoVenta: 1,
      numero: 86,
    });
    expect(getAvailableReservationAdvanceTotal(payments, invoices)).toBe(0);
  });
});