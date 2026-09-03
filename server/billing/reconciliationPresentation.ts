function invoiceValue(invoice: any, snakeCase: string, camelCase: string) {
  return invoice?.[snakeCase] ?? invoice?.[camelCase];
}

/**
 * Historical group invoices can retain the draft's "pendiente" value even
 * after the group payment claimed them. Relational link evidence is
 * authoritative: once that link exists, there is no reconciliation left for
 * an operator to perform.
 */
export function exposeInvoiceReconciliation(invoice: any) {
  const storedStatus = invoiceValue(invoice, "reconciliation_status", "reconciliationStatus") ?? null;
  const reconciliationError = invoiceValue(invoice, "reconciliation_error", "reconciliationError") ?? null;
  const hasGroupIntent = Boolean(invoiceValue(invoice, "group_payment_intent", "groupPaymentIntent"));
  const groupLinkCompleted = Boolean(
    invoiceValue(invoice, "group_reconciliation_linked", "groupReconciliationLinked")
      ?? invoiceValue(invoice, "group_payment_id", "groupPaymentId"),
  );
  const status = storedStatus === "pendiente" && hasGroupIntent && groupLinkCompleted
    ? "conciliada"
    : storedStatus;
  const visibleError = status === "pendiente" ? reconciliationError : null;

  return {
    ...invoice,
    reconciliation_status: status,
    reconciliationStatus: status,
    reconciliation_error: visibleError,
    reconciliationError: visibleError,
  };
}