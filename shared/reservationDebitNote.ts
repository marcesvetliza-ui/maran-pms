export function allocateDebitReversalBySource(
  creditedBySource: Record<string, number>,
  alreadyReversedBySource: Record<string, number>,
  requestedTotal: number,
): Record<string, number> {
  const remaining = Object.entries(creditedBySource)
    .map(([sourceId, credited]) => ({
      sourceId,
      amount: Math.max(0, Number(credited || 0) - Number(alreadyReversedBySource[sourceId] || 0)),
    }))
    .filter(entry => entry.amount > 0.009);
  const availableTotal = remaining.reduce((sum, entry) => sum + entry.amount, 0);

  if (!Number.isFinite(requestedTotal) || requestedTotal <= 0) {
    throw new Error("El monto de la Nota de Débito debe ser mayor a $0");
  }
  if (requestedTotal > availableTotal + 0.009) {
    throw new Error(`El monto de la Nota de Débito supera el saldo reversible de la Nota de Crédito ($${availableTotal.toFixed(2)})`);
  }

  let assigned = 0;
  const result: Record<string, number> = {};
  remaining.forEach((entry, index) => {
    const isLast = index === remaining.length - 1;
    const proportional = requestedTotal * (entry.amount / availableTotal);
    const amount = isLast
      ? Number((requestedTotal - assigned).toFixed(2))
      : Math.min(entry.amount, Number(proportional.toFixed(2)));
    if (amount > 0) {
      result[entry.sourceId] = amount;
      assigned = Number((assigned + amount).toFixed(2));
    }
  });

  return result;
}