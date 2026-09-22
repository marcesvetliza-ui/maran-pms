export interface InvoicePaymentRow {
  method: string;
  amount: string;
  retencionEnabled?: boolean;
  retencionMonto?: string;
}

export interface InvoicePaymentMethodDetail {
  method: string;
  amount: number;
}

export interface AppliedPaymentLike {
  id?: string | number | null;
  date?: string | null;
  method?: string | null;
  amount?: string | number | null;
  availableAdvanceAmount?: number;
  invoiceRef?: unknown;
  invoice_ref?: unknown;
  releasedFromCreditedInvoice?: boolean;
}

export interface AppliedPaymentApplication extends InvoicePaymentMethodDetail {
  paymentId?: string | number;
  releasedFromCreditedInvoice: boolean;
}

function hasInvoiceReference(payment: AppliedPaymentLike): boolean {
  const value = payment.invoiceRef ?? payment.invoice_ref;
  if (!value) return false;
  if (typeof value === "object" && !Array.isArray(value)) return true;
  if (typeof value !== "string") return false;
  try {
    const parsed = JSON.parse(value);
    return !!parsed && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

export function buildAppliedPaymentApplications(
  payments: AppliedPaymentLike[],
  amountToApply: number,
): AppliedPaymentApplication[] {
  let remaining = Number.isFinite(amountToApply) ? amountToApply : 0;
  const applications: AppliedPaymentApplication[] = [];
  const sorted = [...payments].sort((a, b) =>
    String(a.date || "").localeCompare(String(b.date || "")) ||
    String(a.id ?? "").localeCompare(String(b.id ?? ""))
  );
  const released = sorted.filter(payment =>
    payment.releasedFromCreditedInvoice === true || hasInvoiceReference(payment)
  );
  const ordinary = sorted.filter(payment =>
    payment.releasedFromCreditedInvoice !== true && !hasInvoiceReference(payment)
  );

  // The server reserves explicit released-credit reapplications first, then
  // fills the remainder with whole ordinary advances in date/id order.
  for (const payment of [...released, ...ordinary]) {
    if (remaining <= 0.005) break;
    const available = payment.availableAdvanceAmount ?? Number(payment.amount);
    if (!payment.method || !Number.isFinite(available) || available <= 0.005) continue;
    const releasedFromCreditedInvoice =
      payment.releasedFromCreditedInvoice === true || hasInvoiceReference(payment);
    // Ordinary advances are linked as immutable whole payments. Released
    // credit from an NC can be reapplied partially and records that allocation.
    if (!releasedFromCreditedInvoice && available > remaining + 0.005) continue;
    const applied = releasedFromCreditedInvoice ? Math.min(available, remaining) : available;
    applications.push({
      ...(payment.id != null ? { paymentId: payment.id } : {}),
      method: payment.method,
      amount: Number(applied.toFixed(2)),
      releasedFromCreditedInvoice,
    });
    remaining = Number((remaining - applied).toFixed(2));
  }

  return applications;
}

export function buildAppliedPaymentMethodDetails(
  payments: AppliedPaymentLike[],
  amountToApply: number,
): InvoicePaymentMethodDetail[] {
  const amountsByMethod = new Map<string, number>();

  for (const payment of buildAppliedPaymentApplications(payments, amountToApply)) {
    amountsByMethod.set(
      payment.method,
      Number(((amountsByMethod.get(payment.method) || 0) + payment.amount).toFixed(2)),
    );
  }

  return Array.from(amountsByMethod, ([method, amount]) => ({ method, amount }));
}

export function buildInvoicePaymentMethods(
  paymentRows: InvoicePaymentRow[],
  appliedPayments: InvoicePaymentMethodDetail[] = [],
): {
  cashFormaPago?: string;
  cashFormaPagoDetalle?: InvoicePaymentMethodDetail[];
} {
  const detail: InvoicePaymentMethodDetail[] = [];

  for (const payment of appliedPayments) {
    if (!payment.method || !Number.isFinite(payment.amount) || payment.amount <= 0.005) continue;
    detail.push({
      method: payment.method,
      amount: Number(payment.amount.toFixed(2)),
    });
  }

  for (const row of paymentRows) {
    const netAmount = Number(row.amount);
    const retentionAmount = row.retencionEnabled ? Number(row.retencionMonto) : 0;
    const amount = (Number.isFinite(netAmount) ? netAmount : 0) +
      (Number.isFinite(retentionAmount) ? retentionAmount : 0);
    if (!row.method || amount <= 0.005) continue;
    detail.push({ method: row.method, amount: Number(amount.toFixed(2)) });
  }

  if (detail.length === 0) return {};
  return {
    cashFormaPago: detail.length === 1 ? detail[0].method : "pago_dividido",
    cashFormaPagoDetalle: detail,
  };
}