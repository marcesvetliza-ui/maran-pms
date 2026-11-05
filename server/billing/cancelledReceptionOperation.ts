import { sql } from "drizzle-orm";
import type { BillingOperation } from "./operationJournal";

/** Closing a stale UI intent changes only its journal entry. Require evidence
 * of completed original settlement or reconciled fiscal cancellation; never discard pending new money. */
export async function canCloseCancelledReceptionOperation(executor: any, operation: BillingOperation, invoice: any, lock = false): Promise<boolean> {
  const request = operation.request_snapshot;
  const recovery = request?.prefacturaRecovery;
  if (invoice?.estado !== "anulada" || String(invoice.reserva_id) !== operation.owner_id ||
      operation.owner_type !== "reservation" || recovery?.version !== 2 ||
      !Array.isArray(recovery.payments) || recovery.payments.length !== 0 ||
      !(request.cashFormaPago === "cuenta_corriente" || request.reservationSettlementMethod === "cuenta_corriente") ||
      !(Number(operation.invoice_id) === Number(invoice.id) || invoice.credit_reapplication_intent?.operationId === operation.operation_id)) return false;
  const total = Number(invoice.monto_total), credited = Number(invoice.monto_acreditado);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(credited) || Math.abs(total - credited) > .009) return false;
  // Legacy cancellations may have no NC row in this reservation's invoice
  // list. The durable original CC settlement can already be fully completed.
  // Retire only the journal/UI intent; its ledger and cancellation stay intact.
  const intent = invoice.credit_reapplication_intent;
  if (intent?.operationId === operation.operation_id && intent.status === 'completed' && intent.settlement?.status === 'completed') return true;
  const notes = (await executor.execute(sql`SELECT id,estado,monto_total,monto_acreditado,reconciliation_status FROM sales_invoices
    WHERE nota_credito_id=${Number(invoice.id)} AND reserva_id=${operation.owner_id}
      AND tipo_comprobante IN ('NCA','NCB','NCC','NCT','NCM','NCMB')
    ORDER BY id ${lock ? sql`FOR UPDATE` : sql``}`)).rows as any[];
  if (!notes.length || notes.some(note => !['emitida','parcial','anulada'].includes(note.estado) ||
      note.reconciliation_status != null && note.reconciliation_status !== 'conciliada')) return false;
  let net = 0;
  for (const note of notes) {
    const amount = Number(note.monto_total), reversed = Number(note.monto_acreditado || 0);
    if (!Number.isFinite(amount) || !Number.isFinite(reversed) || amount < 0 || reversed < 0 || reversed > amount + .009) return false;
    net += note.estado === 'anulada' ? 0 : Math.round((amount - reversed) * 100);
  }
  return net === Math.round(total * 100);
}
