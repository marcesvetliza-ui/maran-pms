import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { withReservationFinancialLock } from '../nightlyPricingGuard';
import { calcularMontos, isNonFiscalTipo } from './invoiceService';
import { operationSnapshot, payloadHash } from './operationJournal';
import { prefacturaCollectionDifference } from '@shared/prefacturaCollection';

const fail = (message: string) => Object.assign(new Error(message), {statusCode:409});
const cents = (value: unknown) => {
  const amount = Number(value), result = Math.round(amount * 100);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(result) || result < 0 || Math.abs(amount*100-result)>0.00001) throw fail('El importe del cobro no es válido.');
  return result;
};
const methods = new Set(['efectivo','transferencia','tarjeta_debito','tarjeta_credito','mercadopago','cheque','echeq','retencion_iibb','retencion_ganancias','retencion_iva']);

/** Retires only an impossible, unissued amount mismatch. Never rewrites money
 * or an invoice. The replacement, including payment keys, is durable on retry. */
export async function prepareExcessReservationCollection(reservationId: string, attempt: any, actorId?: string) {
  const request = attempt?.invoiceRequest;
  const operationId = request?.creditOperationId;
  if (!request || String(request.reservaId) !== reservationId || !/^[0-9a-f-]{36}$/i.test(String(operationId)) ||
      attempt.invoice || attempt.acknowledgedPaymentIds?.length || !Array.isArray(attempt.payments) || !attempt.payments.length ||
      request.prefacturaRecovery?.version !== 2 || payloadHash(request.prefacturaRecovery.payments) !== payloadHash(attempt.payments) ||
      request.prefacturaRecovery.checkoutRequested !== attempt.checkoutRequested || request.groupDocumentationOnly ||
      !['FA','FB','FC','FT','FM','FMB','cierre_habitacion'].includes(request.tipoComprobante) ||
      request.reservationSettlementMethod === 'cuenta_corriente') throw fail('El intento no permite separar un cobro excedente. Conservamos sus datos.');
  const total = calcularMontos(request.items, request.tipoComprobante).montoTotal;
  const difference = prefacturaCollectionDifference(request, total);
  if (difference.excess <= 0.02 || !(total > 0)) throw fail('El intento no tiene un excedente para confirmar.');
  const originalHash = payloadHash(operationSnapshot(request));
  return withReservationFinancialLock(reservationId, () => db.transaction(async tx => {
    const reservation = (await tx.execute(sql`SELECT id,status FROM reservations WHERE id=${reservationId} FOR UPDATE`)).rows[0] as any;
    if (!reservation || ['cancelled','no_show'].includes(reservation.status)) throw fail('La reserva no admite este cobro.');
    const operation = (await tx.execute(sql`SELECT * FROM billing_operations WHERE operation_id=${operationId} FOR UPDATE`)).rows[0] as any;
    if (operation && (operation.owner_type !== 'reservation' || operation.owner_id !== reservationId || operation.payload_hash !== originalHash)) throw fail('La operación conserva otros datos. Actualizá la prefactura.');
    const replacement = operation?.request_snapshot?._excessCollectionReplacement;
    if (operation?.stage === 'corrected' && operation.error_code === 'EXCESS_COLLECTION_SEPARATED' && replacement) return replacement;
    if (operation && (operation.invoice_id || !['prepared','blocked'].includes(operation.stage))) throw fail('El intento tiene actividad fiscal. Hay que recuperar su resultado antes de corregirlo.');
    const invoices = await tx.execute(sql`SELECT id FROM sales_invoices WHERE reserva_id=${reservationId} AND
      (fiscal_identity->>'operationId'=${operationId} OR credit_reapplication_intent->>'operationId'=${operationId}) LIMIT 1`);
    if (invoices.rows.length) throw fail('Ya existe un comprobante de este intento. No se modificó ni se volvió a cobrar.');
    const paymentIds = attempt.payments.map((payment: any) => payment.paymentRequestId);
    if (paymentIds.some((id: any) => !/^[0-9a-f-]{36}$/i.test(String(id))) || new Set(paymentIds).size !== paymentIds.length) throw fail('Las claves del cobro no son válidas.');
    const existing = await tx.execute(sql`SELECT id FROM payments WHERE payment_request_id IN (${sql.join(paymentIds.map((id: string) => sql`${id}`), sql`,`)}) LIMIT 1`);
    if (existing.rows.length) throw fail('Hay cobros registrados de este intento. Conservamos la operación para su recuperación.');
    const applied = [...(request.creditReapplications || []), ...(request.ordinaryAdvanceApplications || [])].reduce((sum: number, row: any) => sum + cents(row.amount), 0);
    let remaining = cents(total) - applied;
    const requestedByMethod = new Map<string, number>();
    for (const row of request.cashFormaPagoDetalle || []) {
      if (!methods.has(row.method)) throw fail('El excedente requiere medios de cobro directos.');
      requestedByMethod.set(row.method, (requestedByMethod.get(row.method) || 0) + cents(row.amount));
    }
    const newByMethod = new Map<string, number>();
    const invoiceMethods = new Map<string, number>();
    const payments: any[] = [];
    for (const payment of attempt.payments) {
      if (String(payment.reservationId) !== reservationId || payment.invoiceData || payment.invoiceRef || !methods.has(payment.method) || payment.unlinkedAdvance) throw fail('Los datos del cobro cambiaron.');
      const amount = cents(payment.amount);
      if (!amount) throw fail('El cobro debe tener un importe positivo.');
      newByMethod.set(payment.method, (newByMethod.get(payment.method) || 0) + amount);
      const linked = Math.min(amount, Math.max(0, remaining)); remaining -= linked;
      if (linked) { payments.push({...payment, amount:(linked/100).toFixed(2), paymentRequestId:randomUUID()}); invoiceMethods.set(payment.method, (invoiceMethods.get(payment.method) || 0) + linked); }
      if (amount > linked) payments.push({...payment, amount:((amount-linked)/100).toFixed(2), paymentRequestId:randomUUID(), unlinkedAdvance:true, receiptType:'none'});
    }
    // The residual detail belongs to advances already applied to this invoice.
    let appliedDetail = 0;
    for (const [method, amount] of requestedByMethod) {
      const residual = amount - (newByMethod.get(method) || 0);
      if (residual < 0) throw fail('Los medios del comprobante no coinciden con el cobro.');
      appliedDetail += residual;
      if (residual) invoiceMethods.set(method, (invoiceMethods.get(method) || 0) + residual);
    }
    if (remaining !== 0 || appliedDetail !== applied || [...newByMethod.keys()].some(method => !requestedByMethod.has(method))) throw fail('El detalle de los anticipos requiere revisión.');
    const detail = [...invoiceMethods].filter(([, amount]) => amount > 0).map(([method,amount]) => ({method,amount:amount/100}));
    const invoiceRequest = {...request, creditOperationId:randomUUID(), cashFormaPago:detail.length===1?detail[0].method:'pago_dividido', cashFormaPagoDetalle:detail,
      prefacturaRecovery:{...request.prefacturaRecovery,payments}, excessCollection:{originalOperationId:operationId,collected:difference.collected,documented:total,advance:difference.excess}};
    const result = {...attempt, ownerReservationId:reservationId, invoiceRequest, payments};
    const snapshot = {...request, _excessCollectionReplacement:result};
    if (operation) await tx.execute(sql`UPDATE billing_operations SET stage='corrected',error_code='EXCESS_COLLECTION_SEPARATED',request_snapshot=${JSON.stringify(snapshot)}::jsonb,updated_at=now() WHERE operation_id=${operationId}`);
    else await tx.execute(sql`INSERT INTO billing_operations(operation_id,owner_type,owner_id,payload_hash,request_snapshot,fiscal_identity,stage,error_code)
      VALUES(${operationId},'reservation',${reservationId},${originalHash},${JSON.stringify(snapshot)}::jsonb,${JSON.stringify({type:request.tipoComprobante,pointOfSale:request.puntoVentaOverride,environment:'unissued'})}::jsonb,'corrected','EXCESS_COLLECTION_SEPARATED')`);
    if (isNonFiscalTipo(request.tipoComprobante)) await tx.execute(sql`INSERT INTO billing_operations(operation_id,owner_type,owner_id,payload_hash,request_snapshot,fiscal_identity,stage)
      VALUES(${invoiceRequest.creditOperationId},'reservation',${reservationId},${payloadHash(operationSnapshot(invoiceRequest))},${JSON.stringify(invoiceRequest)}::jsonb,${JSON.stringify({type:request.tipoComprobante,pointOfSale:request.puntoVentaOverride,environment:'non_fiscal'})}::jsonb,'prepared')`);
    await tx.execute(sql`INSERT INTO audit_logs(user_id,action,module,entity_type,entity_id,description,details,timestamp)
      VALUES(${actorId || null},'update','billing','billing_operation',${operationId},'Cobro excedente confirmado y separado como anticipo; sin emisión ni cobro',${JSON.stringify({originalOperationId:operationId,replacementOperationId:invoiceRequest.creditOperationId,...difference})},now())`);
    return result;
  }));
}
