export type GroupInvoiceAvailableSource = {
  id: string;
  available: number;
};

const cents = (amount: number) => Math.round((Number(amount) || 0) * 100);

export type GroupInvoiceSourceDetail = GroupInvoiceAvailableSource & {
  concept?: string;
  destination?: string;
};

export type GroupInvoiceDistribution = "none" | "totalizados" | "detallados";

export type GroupInvoiceGeneratedItem = {
  descripcion: string;
  precioUnitario: number;
};

/** Available is the only source of truth for pre-filling a group invoice. */
export function availableGroupInvoiceTotal(sources: GroupInvoiceAvailableSource[]): number {
  return sources.reduce((total, source) => total + Math.max(0, cents(source.available)), 0) / 100;
}

/** Builds invoice concepts without reintroducing gross folio totals or operational debt. */
export function buildGroupInvoiceItems(
  sources: GroupInvoiceSourceDetail[],
  distribution: GroupInvoiceDistribution,
  groupName = "",
): GroupInvoiceGeneratedItem[] {
  const available = sources
    .filter((source) => cents(source.available) > 0)
    .map((source) => ({ ...source, available: cents(source.available) / 100 }));
  const total = availableGroupInvoiceTotal(available);
  if (total <= 0) return [];

  if (distribution === "none") {
    return [{ descripcion: `Pago grupal — ${groupName}`.trim(), precioUnitario: total }];
  }
  if (distribution === "detallados") {
    return available.map((source) => ({
      descripcion: [source.destination, source.concept].filter(Boolean).join(" — ") || "Concepto grupal",
      precioUnitario: source.available,
    }));
  }

  const buckets = new Map<string, number>();
  for (const source of available) {
    const text = `${source.id} ${source.concept || ""} ${source.destination || ""}`;
    const label = /accommodation|alojamiento|hospedaje|habitaci[oó]n/i.test(text)
      ? "Alojamiento Grupal"
      : "Consumos y Extras";
    buckets.set(label, (buckets.get(label) || 0) + cents(source.available));
  }
  return [...buckets].map(([descripcion, amountCents]) => ({
    descripcion,
    precioUnitario: amountCents / 100,
  }));
}

export function exceedsGroupInvoiceAvailable(conceptsTotal: number, available: number): boolean {
  return cents(conceptsTotal) > Math.max(0, cents(available));
}

/**
 * A zero-value collection documents a previous advance and therefore does not
 * constrain concept total. When money is collected now, both gross totals
 * (cash/card/etc. plus retentions) must match to the cent.
 */
export function groupInvoicePaymentMatchesConcepts(paymentGross: number, conceptsTotal: number): boolean {
  const paymentCents = cents(paymentGross);
  return paymentCents === 0 || paymentCents === cents(conceptsTotal);
}

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