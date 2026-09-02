import { describe, expect, it } from "vitest";
import {
  getAllBillableFolioItems,
  getAdvancePaymentIdsToLink,
  getCreditedAdvanceReapplications,
  getEffectiveFolioItemAmounts,
  getInvoicedAmountsByCharge,
  getRemainingChargeAmounts,
  getSelectedFolioBalance,
  getSelectedFolioItems,
  getSelectedFolioTotal,
  isArgentineNationality,
  suggestTipo,
} from "./PrefacturaDialog";

const folio = {
  roomTotal: 120,
  roomNumber: "203",
  nights: 2,
  charges: [
    { id: "restaurant", description: "Cena", amount: "35.50", category: "restaurant" },
    { id: "transfer-out", description: "Traslado enviado", amount: "-20.00", category: "transfer_out" },
    { id: "transfer-in", description: "Traslado recibido", amount: "20.00", category: "transfer_in" },
  ],
};

describe("PrefacturaDialog selected folio projection", () => {
  it("uses only selected billable items for invoice source IDs and total", () => {
    const items = getSelectedFolioItems(
      new Set(["accommodation", "restaurant", "transfer-out", "transfer-in"]),
      folio,
    );

    expect(items).toEqual([
      expect.objectContaining({ id: "accommodation", amount: 120 }),
      expect.objectContaining({ id: "restaurant", amount: 35.5 }),
    ]);
    expect(getSelectedFolioTotal(items)).toBe(155.5);
  });

  it("does not apply a payment for an earlier charge to a later selected charge", () => {
    const restaurantOnly = getSelectedFolioItems(new Set(["restaurant"]), folio);
    const allItems = getSelectedFolioItems(new Set(["accommodation", "restaurant"]), folio);

    expect(getSelectedFolioBalance(restaurantOnly, allItems, [{ amount: "120.00" }])).toBe(35.5);
  });

  it("applies a prior payment to the selected first charge only", () => {
    const accommodationOnly = getSelectedFolioItems(new Set(["accommodation"]), folio);
    const allItems = getSelectedFolioItems(new Set(["accommodation", "restaurant"]), folio);

    expect(getSelectedFolioBalance(accommodationOnly, allItems, [{ amount: "50" }])).toBe(70);
  });

  it("selects and invoices only the residual of a partially invoiced accommodation", () => {
    const originalItems = getAllBillableFolioItems(folio);
    const invoiced = getInvoicedAmountsByCharge([{
      source_charge_amounts: { accommodation: 34 },
      monto_total: "34.00",
      monto_acreditado: "0.00",
    }]);
    const remaining = getRemainingChargeAmounts(originalItems, invoiced);
    const accommodationOnly = getSelectedFolioItems(
      new Set(["accommodation"]),
      folio,
      {},
      remaining,
    );

    expect(remaining.accommodation).toBe(86);
    expect(accommodationOnly).toEqual([
      expect.objectContaining({ id: "accommodation", originalAmount: 120, amount: 86 }),
    ]);
    expect(getSelectedFolioTotal(accommodationOnly)).toBe(86);
  });

  it("does not let an accommodation partial invoice reduce a selected parking charge", () => {
    const originalItems = getAllBillableFolioItems(folio);
    const remaining = getRemainingChargeAmounts(
      originalItems,
      getInvoicedAmountsByCharge([{
        source_charge_amounts: { accommodation: 120 },
        monto_total: "120",
        monto_acreditado: "0",
      }]),
    );
    const restaurantOnly = getSelectedFolioItems(new Set(["restaurant"]), folio, {}, remaining);

    expect(restaurantOnly).toEqual([
      expect.objectContaining({ id: "restaurant", amount: 35.5 }),
    ]);
    expect(getSelectedFolioBalance(restaurantOnly, getAllBillableFolioItems(folio, {}, remaining))).toBe(35.5);
  });

  it("subtracts a partial NC only from its linked charge in a multi-charge invoice", () => {
    const invoiced = getInvoicedAmountsByCharge([{
      source_charge_amounts: { accommodation: 100, restaurant: 100 },
      credit_source_charge_amounts: [{ accommodation: 50 }],
      monto_total: "200",
      monto_acreditado: "50",
    }]);

    expect(invoiced).toEqual({ accommodation: 50, restaurant: 100 });
    const remaining = getRemainingChargeAmounts([
      { id: "accommodation", amount: 100, originalAmount: 100, description: "Alojamiento" },
      { id: "restaurant", amount: 100, originalAmount: 100, description: "Cena" },
    ], invoiced);
    expect(remaining).toEqual({ accommodation: 50, restaurant: 0 });
  });

  it("keeps an uninvoiced advance out of the fiscal amount while reducing only collection", () => {
    const advanceFolio = {
      roomTotal: 286000,
      roomNumber: "203",
      nights: 2,
      charges: [{ id: "restaurant", description: "Consumos", amount: "7500", category: "restaurant" }],
    };
    const originalItems = getAllBillableFolioItems(advanceFolio);
    const remaining = getRemainingChargeAmounts(
      originalItems,
      getInvoicedAmountsByCharge([{
        source_charge_amounts: { accommodation: 112000 },
        monto_total: "112000",
        monto_acreditado: "0",
      }]),
    );
    const selected = getSelectedFolioItems(new Set(["accommodation", "restaurant"]), advanceFolio, {}, remaining);
    const invoiceAmount = getSelectedFolioTotal(selected);
    const amountToCollect = getSelectedFolioBalance(selected, getAllBillableFolioItems(advanceFolio, {}, remaining), [{ amount: "10000" }]);

    expect(invoiceAmount).toBe(181500);
    expect(amountToCollect).toBe(171500);
  });

  it("keeps a credit-note audit adjustment out of the operational charge amount", () => {
    const adjustedFolio = {
      roomTotal: 120,
      roomNumber: "203",
      nights: 2,
      charges: [
        { id: "restaurant", description: "Cena", amount: "100.00", category: "restaurant" },
        { id: "nc-adjustment", description: "Ajuste por NC NCB 0001-00000001 — Cena [nc:41:restaurant]", amount: "-35.00", category: "adjustment" },
      ],
    };

    expect(getEffectiveFolioItemAmounts(adjustedFolio)).toMatchObject({ accommodation: 120, restaurant: 100 });
    expect(getAllBillableFolioItems(adjustedFolio)).toEqual([
      expect.objectContaining({ id: "accommodation", amount: 120 }),
      expect.objectContaining({ id: "restaurant", originalAmount: 100, amount: 100 }),
    ]);
  });

  it("restores the whole operational charge for refactoring after a total NC", () => {
    const adjustedFolio = {
      roomTotal: 0,
      roomNumber: "203",
      nights: 0,
      charges: [
        { id: "parking", description: "Cochera", amount: "80.00", category: "parking" },
        { id: "nc-1", description: "Ajuste por NC NCB 0001-00000001 — Cochera [nc:41:parking]", amount: "-30.00", category: "adjustment" },
      ],
    };

    const items = getSelectedFolioItems(new Set(["parking"]), adjustedFolio);
    expect(items).toEqual([expect.objectContaining({ id: "parking", originalAmount: 80, amount: 80 })]);
    expect(getSelectedFolioTotal(items)).toBe(80);
  });

  it("restores invoice capacity when an ND reverses part of a prior NC", () => {
    const invoiced = getInvoicedAmountsByCharge([{
      source_charge_amounts: { accommodation: 100 },
      credit_source_charge_amounts: [{ accommodation: 60 }],
      debit_source_charge_amounts: [{ accommodation: 25 }],
      monto_total: "100",
      monto_acreditado: "35",
    }]);

    expect(invoiced).toEqual({ accommodation: 65 });
  });

  it("keeps the original invoice reference when a credited payment funds a re-invoice", () => {
    const payments = [
      {
        id: "credited-payment",
        amount: "100",
        availableAdvanceAmount: 40,
        invoiceRef: JSON.stringify({ id: 12, tipoComprobante: "FB", puntoVenta: 1, numero: 86 }),
      },
      {
        id: "never-invoiced-payment",
        amount: "20",
        availableAdvanceAmount: 20,
      },
    ];
    expect(getAdvancePaymentIdsToLink(payments, 60)).toEqual(["never-invoiced-payment"]);
    expect(getCreditedAdvanceReapplications(payments, 60)).toEqual([
      { paymentId: "credited-payment", amount: 40 },
    ]);
  });

  it("defaults to an electronic receipt for Consumidor Final", () => {
    expect(suggestTipo("", "Consumidor Final")).toBe("FB");
    expect(suggestTipo("30-12345678-9", "Responsable Inscripto")).toBe("FA");
  });

  it("recognizes Argentine nationality only from explicit Argentine data", () => {
    expect(isArgentineNationality("Argentina", null)).toBe(true);
    expect(isArgentineNationality(null, "ARG")).toBe(true);
    expect(isArgentineNationality("Uruguay", "URY")).toBe(false);
    expect(isArgentineNationality(undefined, undefined)).toBe(false);
  });
});