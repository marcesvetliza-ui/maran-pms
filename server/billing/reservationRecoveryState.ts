/** Fiscal issuance and later credit notes are independent from local settlement.
 * Never replay a credited invoice's original settlement unless it already finished. */
export function assertReservationInvoiceRecoverable(invoice: any): void {
  if (invoice?.estado === "emitida") return;
  if (invoice?.estado === "parcial") {
    const intent = invoice.credit_reapplication_intent;
    const completed = intent?.status === "completed" && invoice.reconciliation_status === "conciliada"
      && (!intent.settlement || intent.settlement.status === "completed");
    if (Number(invoice.monto_acreditado || 0) === 0 || completed) return;
    throw Object.assign(new Error("La factura tiene una nota de crédito y una liquidación pendiente. Requiere conciliación antes de recuperar el cargo original."), { statusCode: 409 });
  }
  const document = `${invoice?.tipo_comprobante || "Comprobante"} ${invoice?.punto_venta ?? ""}-${invoice?.numero ?? ""}`;
  throw Object.assign(new Error(`${document}: el estado ${String(invoice?.estado || "desconocido")} no permite recuperar la liquidación. No se volvió a facturar.`), { statusCode: 409 });
}
