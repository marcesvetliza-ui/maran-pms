import { sql } from "drizzle-orm";
import { classifyReservationPaymentMethod } from '../payment-method';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { isNonFiscalDocument } from '../../shared/cash-document-classification';
import { parseReservationInvoiceRef } from '../../shared/reservationFolio';
import { isValidCashShiftArea, normalizeCashShiftArea } from '../cashArea';

export const nonFiscalAnnulmentProof = sql`(SELECT jsonb_build_object('reason',a.details::jsonb->>'reason','actor',a.user_name,'at',a.timestamp)
  FROM audit_logs a WHERE a.entity_type='non_fiscal_annulment' AND a.entity_id=si.id::text ORDER BY a.timestamp DESC LIMIT 1)`;
export const NON_FISCAL_VOID_PERMISSION = 'api:billing:non-fiscal-void';
const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });
export function validateNonFiscalAnnulmentReason(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 3 || value.trim().length > 500)
    throw fail('Ingresá un motivo de eliminación de entre 3 y 500 caracteres.', 400);
  return value.trim();
}
export function canAnnulNonFiscalInvoice(invoice: any): boolean {
  return isNonFiscalDocument(invoice?.tipo_comprobante) && !invoice.cae && ['emitida','registrada'].includes(invoice.estado);
}
/** Release this document's exact application, preserving the receipt and all
 * other applications. Neither a matching amount nor a matching name is a link. */
export function releaseNonFiscalApplication(payment: any, invoice: any): any | null {
  if (payment.status === 'anulado' || classifyReservationPaymentMethod(payment.method).informational) return null;
  const ref = parseReservationInvoiceRef(payment.invoice_ref);
  if (!ref) {
    if (payment.invoice_ref || String(invoice.payment_id || '') === String(payment.id)) throw fail('Un cobro tiene una referencia incompleta. Requiere conciliación antes de borrar el voucher.');
    return null;
  }
  const id = String(invoice.id);
  const legacyMatch = ref.id == null && String((ref as any).tipoComprobante ?? (ref as any).tipo_comprobante) === invoice.tipo_comprobante &&
    Number((ref as any).puntoVenta ?? (ref as any).punto_venta) === Number(invoice.punto_venta) && Number(ref.numero) === Number(invoice.numero);
  const direct = String(ref.id) === id || legacyMatch;
  const applications = Array.isArray(ref.reapplications) ? ref.reapplications.filter((entry: any) => String(entry?.invoiceId) === id) : [];
  if (!direct && !applications.length) return null;
  if (applications.length > 1 || (direct && applications.length)) throw fail('El cobro tiene aplicaciones duplicadas. Requiere conciliación.');
  const amount = direct ? Number(payment.amount) : Number((applications[0] as any).amount);
  const cents = Math.round(amount * 100), paymentCents = Math.round(Number(payment.amount) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > paymentCents) throw fail('La aplicación del cobro no es válida. Se conserva el voucher.');
  return { ...ref, ...(legacyMatch ? { id: invoice.id } : {}), fundingReleases: { ...(ref as any).fundingReleases, [id]: cents } };
}

export async function nonFiscalAnnulmentArea(pool: Pool, invoice: any): Promise<string> {
  const fixed = invoice.center_settlement_area || (invoice.reserva_id || invoice.group_id ? 'recepcion' :
    invoice.spa_account_id || String(invoice.tipo_comprobante).startsWith('cierre_spa') ? 'spa' :
      invoice.restaurant_order_id || ['voucher_justo','voucher_pedidos_ya','voucher_room_service','voucher_consumo_interno'].includes(invoice.tipo_comprobante) ? 'restaurant' : null);
  if (fixed && isValidCashShiftArea(fixed)) return normalizeCashShiftArea(fixed) === 'events' ? 'recepcion' : normalizeCashShiftArea(fixed);
  const rows = (await pool.query("SELECT DISTINCT area FROM cash_movements WHERE source_type='comprobante' AND source_id=$1 AND anulado=false", [String(invoice.id)])).rows;
  const areas = [...new Set(rows.map(row => normalizeCashShiftArea(row.area)))];
  if (areas.length === 1 && isValidCashShiftArea(areas[0])) return areas[0] === 'events' ? 'recepcion' : areas[0];
  const configs = (await pool.query('SELECT DISTINCT area FROM pos_configs WHERE numero=$1 AND activo=true', [invoice.punto_venta])).rows;
  const configured = [...new Set(configs.map(row => normalizeCashShiftArea(row.area)))];
  if (configured.length === 1 && isValidCashShiftArea(configured[0])) return configured[0] === 'events' ? 'recepcion' : configured[0];
  throw fail('No se pudo determinar la Caja de origen del comprobante. Configurá su punto de venta antes de borrarlo.');
}

/** Caller holds the invoice owner financial lock. A single transaction retires
 * the document, releases reservation advances and writes Caja plus audit. */
export async function annulNonFiscalInvoice(pool: Pool, invoiceId: number, reasonValue: unknown,
  actor: { id: string | null; name: string }, area: string, shiftId: string, expectedOwner: any) {
  const reason = validateNonFiscalAnnulmentReason(reasonValue);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    // Same first row lock as closeShift: never add a late event to a closed turn.
    const shift = (await c.query('SELECT * FROM cash_shifts WHERE id=$1 FOR UPDATE', [shiftId])).rows[0];
    const invoice = (await c.query('SELECT * FROM sales_invoices WHERE id=$1 FOR UPDATE', [invoiceId])).rows[0];
    if (!invoice) throw fail('Comprobante no encontrado.', 404);
    const previous = (await c.query("SELECT id FROM audit_logs WHERE entity_type='non_fiscal_annulment' AND entity_id=$1", [String(invoiceId)])).rows;
    if (invoice.estado === 'anulada' && previous.length) { await c.query('COMMIT'); return { annulled: true, alreadyAnnulled: true, invoiceId }; }
    if (!canAnnulNonFiscalInvoice(invoice)) throw fail('Solo se pueden eliminar comprobantes no fiscales vigentes y sin CAE. Las facturas fiscales requieren su circuito fiscal.', 400);
    if (!shift || shift.status !== 'open' || normalizeCashShiftArea(shift.area) !== area) throw fail('El turno de Caja cambió. Actualizá la pantalla y volvé a intentar.');
    if (['reserva_id','group_id','spa_account_id','restaurant_order_id','folio_id'].some(key => (invoice[key] ?? null) !== (expectedOwner[key] ?? null))) throw fail('El propietario del comprobante cambió. Actualizá la pantalla.');
    const archived = (await c.query("SELECT 1 FROM sales_control_archive WHERE kind='invoice' AND record_id=$1", [String(invoiceId)])).rows;
    if (archived.length) throw fail('El comprobante pertenece a un archivo histórico. No se modificó.');
    const adjustments = (await c.query("SELECT id FROM sales_invoices WHERE nota_credito_id=$1 AND estado IS DISTINCT FROM 'anulada' LIMIT 1", [invoiceId])).rows;
    if (adjustments.length) throw fail('Hay un intento de NC/ND vinculado. Resolvé primero esa conciliación para poder borrar el voucher.');
    const intent = invoice.credit_reapplication_intent;
    if ((intent && (intent.status !== 'completed' || intent.settlement && intent.settlement.status !== 'completed')) || invoice.center_settlement_status === 'pending' || Number(invoice.monto_acreditado || 0) !== 0)
      throw fail('El comprobante tiene una liquidación o ajuste pendiente. Completá su conciliación antes de borrarlo.');
    const paymentUpdates: any[] = [];
    if (invoice.reserva_id) {
      const payments = (await c.query('SELECT * FROM payments WHERE reservation_id=$1 ORDER BY id COLLATE "C" FOR UPDATE', [invoice.reserva_id])).rows;
      for (const payment of payments) {
        const released = releaseNonFiscalApplication(payment, invoice);
        if (released) {
          paymentUpdates.push({ id: payment.id, before: payment.invoice_ref, after: released });
          await c.query('UPDATE payments SET invoice_ref=$2 WHERE id=$1', [payment.id, JSON.stringify(released)]);
        }
      }
    }
    if (invoice.reserva_id) {
      const ownedCash = (await c.query("SELECT amount FROM cash_movements WHERE source_type='comprobante' AND source_id=$1 AND movement_type='income' AND anulado=false FOR UPDATE", [String(invoiceId)])).rows;
      const cashCents = ownedCash.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
      const appliedCents = paymentUpdates.reduce((sum, update) => sum + Number(update.after.fundingReleases[String(invoiceId)]), 0);
      if (cashCents > appliedCents) throw fail('El voucher tiene un cobro en Caja sin pago de reserva vinculado suficiente. Conciliá ese cobro antes de borrarlo para conservarlo como anticipo.');
    }
    const releasedCents = paymentUpdates.reduce((sum, update) => sum + Number(update.after.fundingReleases[String(invoiceId)]), 0);
    if (releasedCents > Math.round(Number(invoice.monto_total) * 100)) throw fail('Los cobros aplicados superan el importe del voucher. Requiere conciliación.');
    let discountBefore: any = null;
    let retiredIntent = intent;
    if (intent?.checkoutDiscount) {
      const discount = intent.checkoutDiscount;
      const cents = Math.round(Number(discount.amount) * 100);
      if (!invoice.reserva_id || !invoice.folio_id || !Number.isSafeInteger(cents) || cents <= 0) throw fail('El descuento del voucher requiere conciliación.');
      const discountId = `checkout-discount:${invoiceId}`;
      const folio = (await c.query("SELECT * FROM folios WHERE id=$1 AND entity_type='reservation' AND entity_id=$2 FOR UPDATE", [invoice.folio_id, invoice.reserva_id])).rows[0];
      const charge = (await c.query('SELECT * FROM charges WHERE id=$1 FOR UPDATE', [discountId])).rows[0];
      const movement = (await c.query('SELECT * FROM folio_movements WHERE id=$1 FOR UPDATE', [discountId])).rows[0];
      const voids = (await c.query("SELECT id FROM folio_movements WHERE voided_movement_id=$1 AND type='void'", [discountId])).rows;
      if (!folio || !charge || charge.reservation_id !== invoice.reserva_id || charge.status !== 'active' || Math.round(Number(charge.amount)*100) !== -cents ||
        !movement || movement.folio_id !== invoice.folio_id || movement.type !== 'discount' || movement.source_type !== 'checkout_discount' ||
        String(movement.source_id) !== String(invoiceId) || Math.round(Number(movement.amount)*100) !== cents || voids.length)
        throw fail('El descuento aplicado no coincide con el voucher. Se conserva el comprobante para revisión.');
      discountBefore = { discount, charge, movement };
      await c.query("UPDATE charges SET status='anulado',anulado_por=$2,motivo_anulacion=$3,anulado_at=now() WHERE id=$1", [discountId, actor.name, reason]);
      await c.query(`INSERT INTO folio_movements(id,folio_id,type,amount,description,source_type,source_id,registered_by,voided_movement_id,void_reason)
        VALUES($1,$2,'void',$3,$4,'non_fiscal_void',$5,$6,$7,$8)`,
        [randomUUID(),invoice.folio_id,(-cents/100).toFixed(2),`Retiro de descuento por eliminación de voucher — ${reason}`,String(invoiceId),actor.name,discountId,reason]);
      await c.query(`UPDATE folios SET
        total_charges=(SELECT COALESCE(SUM(amount::numeric) FILTER(WHERE type IN ('charge','transfer_in')),0) FROM folio_movements WHERE folio_id=$1),
        total_payments=(SELECT COALESCE(SUM(amount::numeric) FILTER(WHERE type IN ('payment','advance','discount','transfer_out','void')),0) FROM folio_movements WHERE folio_id=$1),
        balance=(SELECT COALESCE(SUM(CASE WHEN type IN ('charge','transfer_in') THEN amount::numeric WHEN type IN ('payment','advance','discount','transfer_out','void') THEN -amount::numeric ELSE 0 END),0) FROM folio_movements WHERE folio_id=$1)
        WHERE id=$1`, [invoice.folio_id]);
      // Keep the original terms in the cancellation provenance, but remove the
      // active discount key so historical coverage cannot reserve these sources.
      retiredIntent = { ...intent, nonFiscalAnnulment: { discountVoided: true, originalCheckoutDiscount: discount, reason } };
      delete retiredIntent.checkoutDiscount;
    }
    const movementId = randomUUID();
    const reference = `${invoice.tipo_comprobante} ${String(invoice.punto_venta).padStart(4,'0')}-${String(invoice.numero).padStart(8,'0')}`;
    const documentAmount = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number(invoice.monto_total));
    const label = `Comprobante eliminado — ${reference} — Importe del comprobante: ${documentAmount} — Motivo: ${reason} — Cobro conservado, sin devolución`;
    await c.query(`INSERT INTO cash_movements(id,shift_id,area,source_type,source_id,source_label,payment_method,amount,movement_type,receipt_type,registered_by,receipt_number)
      VALUES($1,$2,$3,'non_fiscal_void',$4,$5,'sin_movimiento',0,'informational',$6,$7,nextval('cash_movements_receipt_number_seq')::text)`,
      [movementId, shiftId, area, String(invoiceId), label, invoice.tipo_comprobante, actor.name]);
    await c.query(`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp)
      VALUES($1,$2,'delete','billing','non_fiscal_annulment',$3,$4,$5,now())`, [actor.id, actor.name, String(invoiceId), label,
      JSON.stringify({ before: invoice, reason, paymentUpdates, discountBefore, cashMovementId: movementId, preserveCollection: true })]);
    await c.query("UPDATE sales_invoices SET estado='anulada',reconciliation_status='conciliada',reconciliation_error=NULL,reconciliation_updated_at=now(),credit_reapplication_intent=$2::jsonb WHERE id=$1", [invoiceId, retiredIntent ? JSON.stringify(retiredIntent) : null]);
    await c.query('COMMIT');
    return { annulled: true, alreadyAnnulled: false, invoiceId, cashMovementId: movementId, releasedPayments: paymentUpdates.length };
  } catch (error) { await c.query('ROLLBACK').catch(() => {}); throw error; }
  finally { c.release(); }
}
