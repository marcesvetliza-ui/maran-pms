function invoiceValue(invoice: any, snakeCase: string, camelCase: string) {
  return invoice?.[snakeCase] ?? invoice?.[camelCase];
}

/**
 * Historical group invoices can retain the draft's "pendiente" value even
 * after their operational link completed. A payment requires its payment
 * link; a direct invoice requires a group_invoices link to its owner group.
 * Normalize only these completed links for display; never alter stored
 * documents, authorization-pending invoices or fiscal adjustments.
 */
export function exposeInvoiceReconciliation(invoice: any) {
  const storedStatus = invoiceValue(invoice, "reconciliation_status", "reconciliationStatus") ?? null;
  const reconciliationError = invoiceValue(invoice, "reconciliation_error", "reconciliationError") ?? null;
  const hasGroupIntent = Boolean(invoiceValue(invoice, "group_payment_intent", "groupPaymentIntent"));
  const groupLinkCompleted = Boolean(
    invoiceValue(invoice, "group_reconciliation_linked", "groupReconciliationLinked")
      ?? invoiceValue(invoice, "group_payment_id", "groupPaymentId"),
  );
  const isDirectGroupInvoice = Boolean(invoiceValue(invoice, "group_id", "groupId"))
    && ["FA", "FB", "FC", "FT", "FM", "FMB"].includes(String(invoiceValue(invoice, "tipo_comprobante", "tipoComprobante")))
    && ["emitida", "parcial", "anulada"].includes(String(invoice.estado))
    && !hasGroupIntent
    && !invoiceValue(invoice, "group_payment_id", "groupPaymentId");
  // This flag is produced only from a group_invoices row matching BOTH the
  // invoice and its owner group. A CAE or group_id alone proves no link.
  const directLinkCompleted = invoiceValue(invoice, "direct_group_reconciliation_linked", "directGroupReconciliationLinked") === true;
  const status = storedStatus === "pendiente" && ((hasGroupIntent && groupLinkCompleted) || (isDirectGroupInvoice && directLinkCompleted))
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