import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { parseReservationInvoiceRef, reservationPaymentReleasedCents } from "@shared/reservationFolio";
import { db } from "../db";
import { normalizeToSpanishPaymentMethod } from "../payment-method";

const methods = new Set(["efectivo", "tarjeta_debito", "tarjeta_credito", "transferencia", "mercadopago"]);
const reject = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const cents = (value: unknown) => Math.round(Number(value) * 100);
const saleTypes = new Set(['FA','FB','FC','FT','FM','FMB']);

/** Only one whole receipt, fully released by reconciled NCs and applied to
 * exactly one replacement invoice. Partial/shared coverage needs its own UI.
 * This validates both independent durable links: payment history and invoice
 * reconciliation intent. Matching amounts alone never authorize a correction.
 */
function exclusiveReapplication(invoice: any, payment: any, ref: any, invoices: any[]): number | null {
  const original = invoices.find(row => String(row.id)===String(ref?.id));
  const applications = ref?.reapplications;
  const intent = invoice.credit_reapplication_intent;
  if (!original || !saleTypes.has(original.tipo_comprobante) || original.estado!=='anulada' ||
      cents(original.monto_total)!==cents(payment.amount) || cents(original.monto_acreditado)!==cents(original.monto_total) ||
      !Array.isArray(applications) || applications.length!==1 || String(applications[0]?.invoiceId)!==String(invoice.id) ||
      cents(applications[0]?.amount)!==cents(payment.amount) ||
      !intent || intent.status!=='completed' || !intent.operationId || invoice.reconciliation_status!=='conciliada' ||
      cents(intent.invoiceTotal)!==cents(invoice.monto_total) ||
      !Array.isArray(intent.payments) || intent.payments.length!==1 || intent.payments[0]?.paymentId!==payment.id ||
      cents(intent.payments[0]?.amount)!==cents(payment.amount) ||
      (intent.ordinaryAdvances && (!Array.isArray(intent.ordinaryAdvances) || intent.ordinaryAdvances.length)) ||
      (intent.settlement && (intent.settlement.destination!=='none' || cents(intent.settlement.amount || 0)!==0))) return null;
  const notes = invoices.filter(row => String(row.nota_credito_id)===String(original.id));
  if (!notes.length || notes.some(row => !['NCA','NCB','NCC','NCT','NCM','NCMB'].includes(row.tipo_comprobante) ||
    row.estado!=='emitida' || row.reconciliation_status!=='conciliada' || cents(row.monto_total)<=0) ||
    notes.reduce((sum,row) => sum+cents(row.monto_total),0)!==cents(original.monto_total)) return null;
  if (ref.fundingReleases && (typeof ref.fundingReleases!=='object' || Array.isArray(ref.fundingReleases) ||
      Object.keys(ref.fundingReleases).some(id => id!==String(original.id) ||
        ref.fundingReleases[id]!==cents(payment.amount)))) return null;
  if (reservationPaymentReleasedCents(ref,original.id,cents(payment.amount),1)!==cents(payment.amount)) return null;
  return Number(original.id);
}

/** Correct the method of an existing, fully linked reservation receipt.
 * No new payment, balance change, fiscal emission or historical-shift rewrite.
 * Identity comes only from payment_id / invoice_ref, never amount or guest name.
 */
export async function editLinkedReservationInvoicePayment(invoiceId: number, method: string, operator: string) {
  if (!methods.has(method)) throw reject("Elegí una forma de pago real de Caja.", 400);
  return db.transaction(async tx => {
    const initial = (await tx.execute(sql`SELECT reserva_id FROM sales_invoices WHERE id=${invoiceId}`)).rows[0] as any;
    if (!initial?.reserva_id) throw reject("La factura no tiene una reserva vinculada.");
    const reservationId = String(initial.reserva_id);
    const lock = (await tx.execute(sql`SELECT pg_try_advisory_xact_lock(hashtext(${`folio-invoice:${reservationId}`})) AS locked`)).rows[0] as any;
    if (!lock?.locked) throw reject("Hay otra operación sobre el folio. Actualizá y reintentá.");
    const reservation = (await tx.execute(sql`SELECT id FROM reservations WHERE id=${reservationId} FOR UPDATE`)).rows[0] as any;
    if (!reservation) throw reject("El cobro requiere revisión desde su cuenta de origen.");
    // Same lock order as Reception's receipt correction / cash closing.
    await tx.execute(sql`SELECT cs.id FROM cash_shifts cs JOIN cash_movements cm ON cm.shift_id=cs.id
      JOIN payments p ON p.id=cm.payment_id WHERE p.reservation_id=${reservationId}
      ORDER BY cs.id FOR UPDATE OF cs`);
    const folios = (await tx.execute(sql`SELECT * FROM folios WHERE entity_type='reservation' AND entity_id=${reservationId} FOR UPDATE`)).rows as any[];
    const payments = (await tx.execute(sql`SELECT * FROM payments WHERE reservation_id=${reservationId} ORDER BY id FOR UPDATE`)).rows as any[];
    const invoices = (await tx.execute(sql`SELECT * FROM sales_invoices WHERE reserva_id=${reservationId} ORDER BY id FOR UPDATE`)).rows as any[];
    const invoice = invoices.find(row => Number(row.id) === invoiceId);
    if (!invoice || !['emitida', 'parcial'].includes(invoice.estado) || invoice.center_settlement_area ||
        !['FA','FB','FC','FT','FM','FMB'].includes(invoice.tipo_comprobante)) throw reject("El comprobante ya no está disponible para esta corrección.");
    if (Number(invoice.monto_acreditado || 0) || invoices.some(row => row.estado==='autorizacion_pendiente' ||
      (row.reconciliation_status && row.reconciliation_status!=='conciliada' && row.reconciliation_status!=='no_aplica'))) {
      throw reject("Hay crédito o conciliación fiscal pendiente. Corregí el cobro desde el folio con su revisión correspondiente.");
    }
    const fundingInstalled = (await tx.execute(sql`SELECT to_regclass('payment_funding.scopes') AS table_name`)).rows[0] as any;
    if (fundingInstalled?.table_name && (await tx.execute(sql`SELECT 1 FROM payment_funding.scopes WHERE kind='reservation' AND id=${reservationId}`)).rows.length) {
      throw reject("Esta reserva usa financiación completa. Corregí el cobro desde ese circuito.");
    }
    const direct = await tx.execute(sql`SELECT id FROM cash_movements WHERE source_type='comprobante' AND source_id=${String(invoiceId)} AND anulado=false`);
    if (direct.rows.length) throw reject("Cambió el vínculo del cobro. Actualizá el comprobante antes de editar.");
    const linked = payments.filter(p => {
      const ref = parseReservationInvoiceRef(p.invoice_ref);
      return p.status==='active' && (p.id===invoice.payment_id || String(ref?.id)===String(invoiceId) ||
        (Array.isArray(ref?.reapplications) && ref.reapplications.some((row:any) => String(row?.invoiceId)===String(invoiceId))));
    });
    if (linked.length!==1 || (invoice.payment_id && linked[0]?.id!==invoice.payment_id)) {
      throw reject("No se identifica un único cobro vinculado a esta factura. Requiere revisar el pago del folio.");
    }
    const payment = linked[0], ref = parseReservationInvoiceRef(payment.invoice_ref);
    const oldMethod = normalizeToSpanishPaymentMethod(payment.method);
    const reapplied = !!ref && String(ref.id)!==String(invoiceId);
    const originalId = reapplied ? exclusiveReapplication(invoice,payment,ref,invoices) : null;
    if (payment.group_payment_id || !methods.has(oldMethod) ||
        (reapplied ? originalId===null : (payment.invoice_ref && !ref) ||
          (ref?.reapplications && (!Array.isArray(ref.reapplications) || ref.reapplications.length)) ||
          (ref?.fundingReleases && Object.keys(ref.fundingReleases).length)) ||
        cents(payment.amount)!==cents(invoice.monto_total) || cents(payment.amount)<=0 ||
        invoices.some(row => Number(row.id)!==invoiceId && Number(row.id)!==originalId && row.payment_id===payment.id && row.estado!=='descartada')) {
      throw reject("El pago tiene una liquidación compartida, una reaplicación sin conciliar o un importe diferente. Requiere revisar el folio.");
    }
    const cashRows = (await tx.execute(sql`SELECT * FROM cash_movements WHERE payment_id=${payment.id} AND anulado=false FOR UPDATE`)).rows as any[];
    const movements = (await tx.execute(sql`SELECT m.* FROM folio_movements m
      WHERE m.source_type='payment' AND m.source_id=${payment.id} AND m.type='payment'
      AND NOT EXISTS(SELECT 1 FROM folio_movements v WHERE v.type='void' AND v.voided_movement_id=m.id)
      FOR UPDATE OF m`)).rows as any[];
    const cash = cashRows[0], movement = movements[0];
    if (folios.length!==1 || cashRows.length!==1 || movements.length!==1 || cash.movement_type!=='income' ||
        cash.source_type!=='reservation' || cash.source_id!==reservationId || !['reception','recepcion'].includes(cash.area) ||
        movement.folio_id!==folios[0].id || movement.cash_movement_id!==cash.id ||
        cents(cash.amount)!==cents(payment.amount) || cents(movement.amount)!==cents(payment.amount) ||
        normalizeToSpanishPaymentMethod(cash.payment_method)!==oldMethod ||
        normalizeToSpanishPaymentMethod(movement.payment_method)!==oldMethod) {
      throw reject("El vínculo entre el pago, Caja y folio no es unívoco. No se cambió el cobro.");
    }
    const shift = (await tx.execute(sql`SELECT status FROM cash_shifts WHERE id=${cash.shift_id} FOR UPDATE`)).rows[0] as any;
    if (shift?.status!=='open') throw reject("El turno de Caja de este cobro está cerrado. Requiere conciliar el cierre original; no se modifica desde esta acción.", 403);
    if (method!==oldMethod) {
      // Reception enforces ONE cash receipt per payment, including voided
      // history. Correct classification in place; preserve its id, shift,
      // receipt number and amount. The zero-value note records before/after.
      await tx.execute(sql`UPDATE cash_movements SET payment_method=${method} WHERE id=${cash.id}`);
      await tx.execute(sql`UPDATE payments SET method=${method} WHERE id=${payment.id}`);
      await tx.execute(sql`UPDATE folio_movements SET payment_method=${method} WHERE id=${movement.id}`);
      await tx.execute(sql`INSERT INTO folio_movements(id,folio_id,type,amount,description,source_type,source_id,registered_by)
        VALUES(${randomUUID()},${folios[0].id},'adjustment',0,${`Forma de pago corregida: ${oldMethod} → ${method}. Caja: ${cash.id}. Factura #${invoiceId}.`},
          'financial_correction',${cash.id},${operator})`);
      await tx.execute(sql`INSERT INTO reservation_changelog(reservation_id,operador,tipo,descripcion)
        VALUES(${reservationId},${operator},'pago',${`Forma de pago de factura #${invoiceId}: ${oldMethod} → ${method}. Importe conservado: ${payment.amount}. Caja: ${cash.id}.`})`);
    }
    return (await tx.execute(sql`UPDATE sales_invoices SET cash_forma_pago=${method},
      cash_forma_pago_detalle=${JSON.stringify([{method,amount:Number(payment.amount)}])}::jsonb WHERE id=${invoiceId} RETURNING *`)).rows[0];
  });
}
