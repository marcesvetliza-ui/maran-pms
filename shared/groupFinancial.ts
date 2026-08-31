const cents = (value: unknown) => Math.round((Number(value) || 0) * 100);

export type GroupFinancialSnapshot = {
  operationalTotal: number;
  collected: number;
  nonFiscalAdvances: number;
  operationalBalance: number;
  invoiced: number;
  fiscalAvailable: number;
};

export function buildGroupFinancialSnapshot(input: {
  operationalTotal: number;
  collected: number;
  invoiced: number;
  fiscalAvailable?: number;
}): GroupFinancialSnapshot {
  const operationalCents = cents(input.operationalTotal);
  const collectedCents = cents(input.collected);
  const invoicedCents = cents(input.invoiced);
  return {
    operationalTotal: operationalCents / 100,
    collected: collectedCents / 100,
    nonFiscalAdvances: Math.max(0, collectedCents - invoicedCents) / 100,
    operationalBalance: Math.max(0, operationalCents - collectedCents) / 100,
    invoiced: invoicedCents / 100,
    fiscalAvailable: input.fiscalAvailable == null
      ? Math.max(0, operationalCents - invoicedCents) / 100
      : Math.max(0, cents(input.fiscalAvailable)) / 100,
  };
}

export function requiredGroupInvoiceCollection(conceptsTotal: number, nonFiscalAdvances = 0): number {
  const conceptCents = cents(conceptsTotal);
  return Math.max(0, conceptCents - Math.min(conceptCents, Math.max(0, cents(nonFiscalAdvances)))) / 100;
}

export function groupInvoiceCollectionMatches(input: {
  newCollection: number;
  conceptsTotal: number;
  nonFiscalAdvances?: number;
  closeAllRooms?: boolean;
  operationalBalance?: number;
}): boolean {
  const collectionCents = cents(input.newCollection);
  const requiredFiscalCents = cents(requiredGroupInvoiceCollection(
    input.conceptsTotal,
    input.nonFiscalAdvances,
  ));
  if (!input.closeAllRooms) return collectionCents === requiredFiscalCents;
  return collectionCents === cents(input.operationalBalance)
    && collectionCents >= requiredFiscalCents;
}