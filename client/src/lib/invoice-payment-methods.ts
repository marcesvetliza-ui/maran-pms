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

export function buildInvoicePaymentMethods(
  paymentRows: InvoicePaymentRow[],
  appliedAdvanceAmount: number,
): {
  cashFormaPago?: string;
  cashFormaPagoDetalle?: InvoicePaymentMethodDetail[];
} {
  const detail: InvoicePaymentMethodDetail[] = [];

  if (Number.isFinite(appliedAdvanceAmount) && appliedAdvanceAmount > 0.005) {
    detail.push({ method: "adelanto", amount: Number(appliedAdvanceAmount.toFixed(2)) });
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