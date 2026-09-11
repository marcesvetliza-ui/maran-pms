import { describe, expect, it } from "vitest";
import { getFolioPdfTotals } from "../routes/folios";

describe("reservation folio PDF totals", () => {
  it("uses operational totals instead of persisted folio totals when provided", () => {
    expect(getFolioPdfTotals(
      { totalCharges: "100", totalPayments: "100", balance: "0" } as any,
      {
        operationalServices: 1250,
        activeHistoricalSettlements: 300,
        operationalFolioBalance: 950,
      },
    )).toEqual({
      chargesLabel: "Total Servicios",
      paymentsLabel: "Total Liquidaciones",
      balanceLabel: "SALDO OPERATIVO",
      charges: 1250,
      payments: 300,
      balance: 950,
    });
  });

  it("preserves persisted totals for non-reservation folio PDFs", () => {
    expect(getFolioPdfTotals({
      totalCharges: "250",
      totalPayments: "100",
      balance: "150",
    } as any)).toMatchObject({
      chargesLabel: "Total Cargos",
      paymentsLabel: "Total Pagado",
      charges: "250",
      payments: "100",
      balance: 150,
    });
  });
});