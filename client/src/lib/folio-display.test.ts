import { describe, expect, it } from "vitest";
import { getFolioDisplayTotals } from "./folio-display";

describe("folio display totals", () => {
  it("shows the operational contract for a reservation instead of its cached ledger balance", () => {
    const totals = getFolioDisplayTotals("reservation", {
      totalCharges: "100",
      totalPayments: "100",
      balance: "0",
      financialSummary: {
        operationalServices: 1200,
        activeHistoricalSettlements: 300,
        operationalFolioBalance: 900,
      },
    });

    expect(totals).toEqual({
      charges: 1200,
      payments: 300,
      balance: 900,
      labels: {
        charges: "Servicios",
        payments: "Liquidaciones",
        balance: "Saldo operativo",
      },
    });
  });

  it("keeps persisted movement totals for historical non-reservation folios", () => {
    expect(getFolioDisplayTotals("restaurant_order", {
      totalCharges: "250",
      totalPayments: "100",
      balance: "150",
    })).toMatchObject({
      charges: 250,
      payments: 100,
      balance: 150,
      labels: { balance: "Saldo" },
    });
  });
});