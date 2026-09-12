type FolioDisplaySource = {
  totalCharges: string | number;
  totalPayments: string | number;
  balance: string | number;
  financialSummary?: {
    operationalServices: number;
    activeHistoricalSettlements: number;
    operationalFolioBalance: number;
  };
};

export function getFolioDisplayTotals(entityType: string, folio: FolioDisplaySource) {
  if (entityType === "reservation" && folio.financialSummary) {
    return {
      charges: folio.financialSummary.operationalServices,
      payments: folio.financialSummary.activeHistoricalSettlements,
      balance: folio.financialSummary.operationalFolioBalance,
      labels: {
        charges: "Servicios",
        payments: "Liquidaciones",
        balance: "Saldo operativo",
      },
    };
  }

  return {
    charges: Number(folio.totalCharges),
    payments: Number(folio.totalPayments),
    balance: Number(folio.balance),
    labels: {
      charges: "Cargos",
      payments: "Cobrado",
      balance: "Saldo",
    },
  };
}