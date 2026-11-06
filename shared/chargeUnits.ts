/** The charge editor persists integer quantities as a terminal `(xN)` suffix. */
export function chargeUnits<T extends { id: string; description: string; amount: string | number; category?: string }>(charge: T): T[] {
  const match = String(charge.description || '').match(/\s+\(x([1-9]\d*)\)$/);
  const quantity = match ? Number(match[1]) : 1;
  const cents = Math.round(Number(charge.amount) * 100);
  const excluded = ['transfer_in', 'transfer_out', 'adjustment', 'payment'].includes(charge.category || '');
  if (quantity < 2 || quantity > 1000 || !Number.isSafeInteger(cents) || cents < quantity || excluded) return [charge];
  return Array.from({ length: quantity }, (_, index) => ({
    ...charge,
    id: `charge-unit:${charge.id}:${index + 1}`,
    amount: (Math.floor(cents / quantity) + (index < cents % quantity ? 1 : 0)) / 100,
    description: `${charge.description.slice(0, match!.index).trim()} · unidad ${index + 1} de ${quantity}`,
  }));
}

export function unitParent(id: string): string | null {
  return /^charge-unit:(.+):[1-9]\d*$/.exec(id)?.[1] ?? null;
}

/** Allocate old grouped documents to remaining unit capacity, retaining any excess. */
export function expandChargeUnitCoverage(amounts: Record<string, number>, units: { id: string; amount: number | string }[]): Record<string, number> {
  const result = { ...amounts };
  const groups = new Map<string, typeof units>();
  for (const unit of units) {
    const parent = unitParent(unit.id);
    if (parent) groups.set(parent, [...(groups.get(parent) || []), unit]);
  }
  for (const [parent, rows] of groups) {
    let legacy = Math.max(0, Math.round((result[parent] || 0) * 100));
    delete result[parent];
    for (const row of rows) {
      const direct = Math.max(0, Math.round((result[row.id] || 0) * 100));
      const take = Math.min(legacy, Math.max(0, Math.round(Number(row.amount) * 100) - direct));
      legacy -= take;
      result[row.id] = (direct + take) / 100;
    }
    if (legacy) result[rows[0].id] = (result[rows[0].id] || 0) + legacy / 100;
  }
  return result;
}

export function groupedChargeCoverage(amounts: Record<string, number>, parent: string): number {
  return Object.entries(amounts).reduce((total, [id, amount]) => total + (id === parent || unitParent(id) === parent ? amount : 0), 0);
}
