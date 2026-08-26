export type GroupInvoiceAvailableSource = {
  id: string;
  available: number;
};

const cents = (amount: number) => Math.round((Number(amount) || 0) * 100);

/** The approved invoice amount is the exact sum of gross line cents. */
export function grossItemsTotal(items: Array<{ subtotal: number }>): number {
  return items.reduce((total, item) => total + cents(item.subtotal), 0) / 100;
}

/**
 * Claims group sources in a stable order and never loses a cent. The total
 * must be the gross-line total used by fiscal emission, not a UI IVA preview.
 */
export function allocateGroupInvoiceSources(
  sources: GroupInvoiceAvailableSource[],
  grossTotal: number,
): Record<string, number> {
  let remaining = cents(grossTotal);
  const allocation: Record<string, number> = {};
  for (const source of [...sources]
    .filter((source) => Number(source.available) > 0)
    .sort((a, b) => a.id.localeCompare(b.id))) {
    if (remaining <= 0) break;
    const allocated = Math.min(remaining, cents(source.available));
    if (allocated > 0) allocation[source.id] = allocated / 100;
    remaining -= allocated;
  }
  return allocation;
}