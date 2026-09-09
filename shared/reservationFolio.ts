const SALE_INVOICE_TYPES = new Set(["FA", "FB", "FC", "FT", "FM"]);

export type ReservationChargeLike = {
  amount?: string | number | null;
  category?: string | null;
  description?: string | null;
  status?: string | null;
};

export type ReservationInvoiceLike = {
  id?: string | number | null;
  tipo_comprobante?: string | null;
  tipoComprobante?: string | null;
  punto_venta?: string | number | null;
  puntoVenta?: string | number | null;
  numero?: string | number | null;
  monto_total?: string | number | null;
  montoTotal?: string | number | null;
  monto_acreditado?: string | number | null;
  montoAcreditado?: string | number | null;
  estado?: string | null;
};

export type ReservationPaymentLike = {
  id?: string | number | null;
  amount?: string | number | null;
  status?: string | null;
  invoiceRef?: unknown;
  invoice_ref?: unknown;
  invoiceLinkFailed?: boolean | null;
  invoice_link_failed?: boolean | null;
  method?: string | null;
};

export type ReservationRateAuditEvent = {
  tipo: "tarifa";
  descripcion: string;
};

/** Build a rate-history event only from a rate explicitly present in the
 * request. This prevents imports/partial updates from inventing a change. */
export function getReservationRateAuditEvent(
  previousRate: string | number | null | undefined,
  nextRate: string | number | null | undefined,
  initial = false,
): ReservationRateAuditEvent | null {
  if (nextRate === null || nextRate === undefined || String(nextRate).trim() === "") return null;
  const next = Number(nextRate);
  if (!Number.isFinite(next) || next < 0) return null;
  const previous = previousRate === null || previousRate === undefined || String(previousRate).trim() === ""
    ? null : Number(previousRate);
  if (!initial && previous !== null && Math.abs(previous - next) < 0.005) return null;
  const money = (value: number) => value.toFixed(2);
  return {
    tipo: "tarifa",
    descripcion: initial
      ? `Tarifa inicial asignada: $${money(next)} por noche`
      : `Tarifa modificada: $${money(previous ?? 0)} → $${money(next)} por noche`,
  };
}

export type AvailableReservationAdvancePayment<T extends ReservationPaymentLike = ReservationPaymentLike> = T & {
  availableAdvanceAmount: number;
  releasedFromCreditedInvoice: boolean;
};

export function parseReservationInvoiceRef(value: unknown): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function invoiceValue(invoice: ReservationInvoiceLike | Record<string, any>, snake: string, camel: string) {
  const record = invoice as Record<string, any>;
  return record?.[snake] ?? record?.[camel];
}

function invoiceKey(invoice: ReservationInvoiceLike | Record<string, any>): string | null {
  const id = invoiceValue(invoice, "id", "id") ?? (invoice as any).invoiceId;
  if (id !== null && id !== undefined && String(id).trim()) return `id:${String(id)}`;

  const type = invoiceValue(invoice, "tipo_comprobante", "tipoComprobante");
  const point = invoiceValue(invoice, "punto_venta", "puntoVenta");
  const number = invoiceValue(invoice, "numero", "numero");
  if (!type || point === null || point === undefined || number === null || number === undefined) return null;
  return `voucher:${String(type)}:${Number(point)}:${Number(number)}`;
}

export function formatReservationInvoiceRef(value: unknown): string | null {
  const ref = parseReservationInvoiceRef(value);
  if (!ref) return null;
  const type = invoiceValue(ref, "tipo_comprobante", "tipoComprobante");
  const point = invoiceValue(ref, "punto_venta", "puntoVenta");
  const number = invoiceValue(ref, "numero", "numero");
  if (!type || !Number.isFinite(Number(point)) || !Number.isFinite(Number(number))) return null;
  return `${String(type)} ${String(Number(point)).padStart(4, "0")}-${String(Number(number)).padStart(8, "0")}`;
}

export function isReservationCreditNoteAdjustment(charge: ReservationChargeLike): boolean {
  return charge.category === "adjustment" && /\[nc:\d+:[^\]]+\]/.test(String(charge.description || ""));
}

export function getOperationalReservationCharges<T extends ReservationChargeLike>(charges: T[] = []): T[] {
  return charges.filter(charge =>
    charge.status !== "anulado" && !isReservationCreditNoteAdjustment(charge)
  );
}

export function getNetReservationInvoicedTotal(invoices: ReservationInvoiceLike[] = []): number {
  return invoices.reduce((sum, invoice) => {
    const type = String(invoiceValue(invoice, "tipo_comprobante", "tipoComprobante") || "");
    if (!SALE_INVOICE_TYPES.has(type)) return sum;
    if (String(invoice.estado || "").toLowerCase() === "anulada") return sum;
    const total = Number(invoiceValue(invoice, "monto_total", "montoTotal") || 0);
    const credited = Number(invoiceValue(invoice, "monto_acreditado", "montoAcreditado") || 0);
    if (!Number.isFinite(total) || total <= 0) return sum;
    return sum + Math.max(0, total - (Number.isFinite(credited) ? credited : 0));
  }, 0);
}

function invoiceReleaseRatio(invoice: ReservationInvoiceLike): number {
  const type = String(invoiceValue(invoice, "tipo_comprobante", "tipoComprobante") || "");
  if (!SALE_INVOICE_TYPES.has(type)) return 0;
  const total = Number(invoiceValue(invoice, "monto_total", "montoTotal") || 0);
  const credited = Number(invoiceValue(invoice, "monto_acreditado", "montoAcreditado") || 0);
  if (!(total > 0)) return 0;
  if (invoice.estado === "anulada") return 1;
  return Math.max(0, Math.min(1, (Number.isFinite(credited) ? credited : 0) / total));
}

/**
 * A payment remains historically linked to its original invoice. When that
 * invoice is offset by a credit note, the matching proportion of the payment
 * becomes an available advance without deleting or rewriting that history.
 */
export function getAvailableReservationAdvancePayments<T extends ReservationPaymentLike>(
  payments: T[] = [],
  invoices: ReservationInvoiceLike[] = [],
): AvailableReservationAdvancePayment<T>[] {
  const releaseRatioByKey = new Map<string, number>();
  for (const invoice of invoices) {
    const releaseRatio = invoiceReleaseRatio(invoice);
    const idKey = invoiceKey(invoice);
    if (idKey) releaseRatioByKey.set(idKey, releaseRatio);
    const type = invoiceValue(invoice, "tipo_comprobante", "tipoComprobante");
    const point = invoiceValue(invoice, "punto_venta", "puntoVenta");
    const number = invoiceValue(invoice, "numero", "numero");
    if (type && point !== null && point !== undefined && number !== null && number !== undefined) {
      releaseRatioByKey.set(`voucher:${String(type)}:${Number(point)}:${Number(number)}`, releaseRatio);
    }
  }

  return payments.flatMap<AvailableReservationAdvancePayment<T>>(payment => {
    // Cuenta Corriente settles the folio by creating debt; it is never a
    // cash/advance credit that can be applied to a later invoice.
    if (payment.status === "anulado" || payment.method === "cuenta_corriente" ||
      payment.method === "current_account" || payment.invoiceLinkFailed || payment.invoice_link_failed) return [];
    const paymentAmount = Number(payment.amount) || 0;
    if (paymentAmount <= 0) return [];
    const ref = parseReservationInvoiceRef(payment.invoiceRef ?? payment.invoice_ref);
    if (!ref) {
      return [{
        ...payment,
        availableAdvanceAmount: paymentAmount,
        releasedFromCreditedInvoice: false,
      } as AvailableReservationAdvancePayment<T>];
    }
    const key = invoiceKey(ref);
    let releaseRatio = key ? releaseRatioByKey.get(key) : undefined;
    const type = invoiceValue(ref, "tipo_comprobante", "tipoComprobante");
    const point = invoiceValue(ref, "punto_venta", "puntoVenta");
    const number = invoiceValue(ref, "numero", "numero");
    releaseRatio ??= releaseRatioByKey.get(`voucher:${String(type)}:${Number(point)}:${Number(number)}`);
    const reapplications = Array.isArray(ref.reapplications) ? ref.reapplications : [];
    const amountStillApplied = reapplications.reduce((total, reapplication) => {
      if (!reapplication || typeof reapplication !== "object") return total;
      const reappliedAmount = Number((reapplication as any).amount) || 0;
      const reappliedKey = invoiceKey(reapplication as ReservationInvoiceLike);
      const targetReleaseRatio = reappliedKey ? (releaseRatioByKey.get(reappliedKey) || 0) : 0;
      return total + reappliedAmount * (1 - targetReleaseRatio);
    }, 0);
    const availableAdvanceAmount = Number(Math.max(
      0,
      paymentAmount * (releaseRatio || 0) - amountStillApplied,
    ).toFixed(2));
    return availableAdvanceAmount > 0.009
      ? [{
        ...payment,
        availableAdvanceAmount,
        releasedFromCreditedInvoice: true,
      } as AvailableReservationAdvancePayment<T>]
      : [];
  });
}

export function getAvailableReservationAdvanceTotal(
  payments: ReservationPaymentLike[] = [],
  invoices: ReservationInvoiceLike[] = [],
): number {
  return getAvailableReservationAdvancePayments(payments, invoices)
    .reduce((sum, payment) => sum + payment.availableAdvanceAmount, 0);
}

/**
 * Financial views must keep the operational folio and fiscal history separate:
 * an NC reduces the fiscal document, but it never removes a service or creates
 * a cash refund.  The released part of an historical payment is an advance
 * that may be applied to the next invoice.
 */
export function getReservationFinancialSummary(
  roomTotal: number,
  charges: ReservationChargeLike[] = [],
  payments: ReservationPaymentLike[] = [],
  invoices: ReservationInvoiceLike[] = [],
) {
  const operationalExtraCharges = getOperationalReservationCharges(charges)
    .reduce((sum, charge: any) => sum + (Number(charge.amount) || 0), 0);
  const operationalServices = Number(roomTotal || 0) + operationalExtraCharges;
  const activePayments = payments.filter(payment => payment.status !== "anulado");
  const historicalPayments = activePayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const netInvoiced = getNetReservationInvoicedTotal(invoices);
  const releasedAvailableAdvance = getAvailableReservationAdvanceTotal(activePayments, invoices);
  const pendingGrossInvoice = Math.max(0, operationalServices - netInvoiced);

  return {
    operationalServices: Number(operationalServices.toFixed(2)),
    netInvoiced: Number(netInvoiced.toFixed(2)),
    historicalPayments: Number(historicalPayments.toFixed(2)),
    // Stable names used by every financial view.  Keep the older names below
    // for consumers which still render the reservation folio contract.
    activeHistoricalSettlements: Number(historicalPayments.toFixed(2)),
    releasedAvailableAdvance: Number(releasedAvailableAdvance.toFixed(2)),
    availableReleasedCredit: Number(releasedAvailableAdvance.toFixed(2)),
    pendingGrossInvoice: Number(pendingGrossInvoice.toFixed(2)),
    pendingInvoicing: Number(pendingGrossInvoice.toFixed(2)),
    operationalFolioBalance: Number(Math.max(0, operationalServices - historicalPayments).toFixed(2)),
    appliedCreditForSelection: 0,
    // This is the operational balance before applying a released advance.
    pendingGrossCollection: Number(Math.max(0, operationalServices - historicalPayments).toFixed(2)),
    newCollectionNeeded: Number(Math.max(0, pendingGrossInvoice - releasedAvailableAdvance).toFixed(2)),
  };
}

/** Project the server contract onto a selected fiscal source without allowing
 * component-specific formulas to drift from the folio calculation. */
export function getReservationSelectionFinancialSummary(
  summary: ReturnType<typeof getReservationFinancialSummary>,
  selectedAmount: number,
  applyReleasedCredit = true,
) {
  const appliedCreditForSelection = Number(Math.min(
    Math.max(0, selectedAmount),
    applyReleasedCredit ? summary.availableReleasedCredit : 0,
  ).toFixed(2));
  const newCollectionRequired = Number(Math.max(
    0,
    selectedAmount - appliedCreditForSelection,
  ).toFixed(2));
  return { ...summary, appliedCreditForSelection, newCollectionRequired };
}