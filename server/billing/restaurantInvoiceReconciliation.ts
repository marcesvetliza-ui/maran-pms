import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { withFinancialScopeLock } from '../nightlyPricingGuard';
import { activeSalesRecord } from '../salesArchive';
import { payloadHash } from './operationJournal';

type Row = Record<string, any>;
const cashMethods = new Set(['efectivo', 'tarjeta_debito', 'tarjeta_credito', 'transferencia', 'mercadopago']);
const fiscalTypes = new Set(['FA', 'FB', 'FC', 'FM', 'FMB']);
const receiptTypes: Record<string, string> = { factura_a: 'FA', factura_b: 'FB', factura_c: 'FC' };
const cents = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = Number(value), rounded = Math.round(n * 100);
  return Number.isFinite(n) && Number.isSafeInteger(rounded) && Math.abs(n * 100 - rounded) < 0.0001 ? rounded : null;
};
const method = (value: unknown) => ({ cash: 'efectivo', debit_card: 'tarjeta_debito', credit_card: 'tarjeta_credito', transfer: 'transferencia' } as Record<string, string>)[String(value)] || String(value || '');
const receiptMatches = (value: unknown, type: string) => !value || (receiptTypes[String(value)] || value) === type;
const paymentSignature = (rows: Row[], methodKey: string) => rows.map(row => `${method(row[methodKey])}:${cents(row.amount)}`).sort();
export type RestaurantReconciliationResult = { status: 'completed' | 'already_completed' | 'review' | 'not_applicable'; reason?: string; invoiceId: number };

/** Only an unambiguous, fully paid order can repair a historical draft flag.
 * Partial sales, account/room transfers and fiscal adjustments retain their
 * existing review flow; matching totals alone never identify a payment. */
export function restaurantReconciliationProof(invoice: Row, operation: Row | undefined, order: Row,
  folios: Row[], movements: Row[], cash: Row[], otherDocuments: Row[]) {
  const reject = (reason: string) => ({ ok: false as const, reason });
  const total = cents(invoice.monto_total), identity = invoice.fiscal_identity;
  if (invoice.estado !== 'emitida' || !fiscalTypes.has(invoice.tipo_comprobante) || invoice.modo_ficticio !== false
    || !/^\d{14}$/.test(String(invoice.cae || '')) || invoice.reconciliation_error || total === null || total <= 0)
    return reject('fiscal_document_requires_review');
  if (['reserva_id', 'payment_id', 'group_id', 'group_payment_id', 'group_payment_intent', 'spa_account_id',
    'nota_credito_id', 'center_settlement_area', 'center_settlement_status', 'credit_reapplication_intent', 'source_charge_ids', 'source_charge_amounts'].some(key => invoice[key] != null)
    || Number(invoice.monto_acreditado || 0) !== 0 || String(invoice.restaurant_order_id) !== String(order.id))
    return reject('mixed_or_adjusted_owner');
  if (!identity || !['homologacion', 'produccion'].includes(identity.environment) || !/^\d{11}$/.test(String(identity.issuer || ''))
    || identity.type !== invoice.tipo_comprobante || identity.pointOfSale !== Number(invoice.punto_venta)
    || !operation || operation.operation_id !== identity.operationId || Number(operation.invoice_id) !== Number(invoice.id)
    || operation.owner_type !== 'direct' || operation.owner_id !== String(order.id) || operation.stage !== 'authorized' || operation.error_code
    || ['environment', 'issuer', 'type', 'pointOfSale'].some(key => identity[key] !== operation.fiscal_identity?.[key]))
    return reject('fiscal_operation_not_proven');
  const request = operation.request_snapshot;
  if (!request || request.tipoComprobante !== invoice.tipo_comprobante || !Array.isArray(request.items) || !request.items.length
    || !Array.isArray(invoice.items) || payloadHash(request.items) !== payloadHash(invoice.items)
    || (request.restaurantOrderId != null && request.restaurantOrderId !== order.id)
    || (request._numberAttempt != null && Number(request._numberAttempt) !== Number(invoice.numero))
    || ['reservaId', 'paymentId', 'groupId', 'groupPaymentId', 'groupPaymentIntent', 'spaAccountId', 'creditReapplications', 'creditOperationId', 'recipientMode'].some(key => request[key] != null))
    return reject('fiscal_request_not_proven');
  const { _numberAttempt, ...originalRequest } = request;
  if (payloadHash(originalRequest) !== operation.payload_hash) return reject('fiscal_request_not_proven');
  const itemCents = invoice.items.map((item: Row) => cents(item.subtotal));
  if (itemCents.some((amount: number | null) => amount === null) || itemCents.reduce<number>((sum, amount) => sum + (amount ?? 0), 0) !== total)
    return reject('fiscal_total_mismatch');
  if (order.status !== 'closed' || !order.closed_at || ['true', true].includes(order.charged_to_room)
    || !cashMethods.has(method(order.payment_method)) || cents(order.total) !== total || !receiptMatches(order.receipt_type, invoice.tipo_comprobante))
    return reject('order_not_completed');
  if (otherDocuments.length) return reject('multiple_or_corrected_documents');
  if (folios.length !== 1) return reject('folio_not_unique');
  const folio = folios[0];
  if (!['open','closed'].includes(folio.status) || folio.entity_type !== 'restaurant_order' || folio.entity_id !== order.id || invoice.folio_id && invoice.folio_id !== folio.id
    || cents(folio.total_charges) !== total || cents(folio.total_payments) !== total || cents(folio.balance) !== 0)
    return reject('folio_totals_mismatch');
  // A payment-method correction has a negative reversal and a replacement.
  // Prove the exact reversal; positive legacy NC voids remain for review.
  const voided = new Set<string>();
  for (const row of movements.filter(row => row.type === 'void')) {
    const original = movements.find(m => m.id === row.voided_movement_id);
    if (!original || original.type !== 'payment' || cents(original.amount) === null || cents(row.amount) !== -cents(original.amount)!
      || voided.has(original.id)) return reject('folio_adjustment_requires_review');
    voided.add(original.id);
  }
  const active = movements.filter(row => row.type !== 'void' && !voided.has(row.id));
  const charges = active.filter(row => row.type === 'charge'), payments = active.filter(row => row.type === 'payment');
  if (active.length !== charges.length + payments.length || charges.length !== 1
    || charges[0].source_type !== 'restaurant_order' || charges[0].source_id !== order.id || cents(charges[0].amount) !== total
    || !payments.length || payments.some(row => row.source_type !== 'restaurant_payment' || row.source_id !== order.id
      || !cashMethods.has(method(row.payment_method)) || (cents(row.amount) ?? 0) <= 0 || !receiptMatches(row.receipt_type, invoice.tipo_comprobante))
    || payments.reduce((sum, row) => sum + (cents(row.amount) ?? 0), 0) !== total)
    return reject('folio_payment_not_proven');
  if (!cash.length || cash.some(row => row.area !== 'restaurant' || row.source_type !== 'restaurant_order' || row.source_id !== order.id
    || row.anulado !== false || row.movement_type !== 'income' || !cashMethods.has(method(row.payment_method))
    || (cents(row.amount) ?? 0) <= 0 || !receiptMatches(row.receipt_type, invoice.tipo_comprobante)
    || row.payment_id && !payments.some(payment => payment.id === row.payment_id))
    || cash.reduce((sum, row) => sum + (cents(row.amount) ?? 0), 0) !== total
    || payloadHash(paymentSignature(payments, 'payment_method')) !== payloadHash(paymentSignature(cash, 'payment_method')))
    return reject('cash_payment_mismatch');
  const linkedPayments = payments.filter(row => row.cash_movement_id);
  if (new Set(linkedPayments.map(row => row.cash_movement_id)).size !== linkedPayments.length
    || linkedPayments.some(row => !cash.some(movement => movement.id === row.cash_movement_id
      && method(movement.payment_method) === method(row.payment_method) && cents(movement.amount) === cents(row.amount))))
    return reject('cash_payment_link_mismatch');
  if (invoice.cash_forma_pago && !payments.some(row => method(row.payment_method) === method(invoice.cash_forma_pago))
    || invoice.cash_forma_pago_detalle != null && (!Array.isArray(invoice.cash_forma_pago_detalle)
      || payloadHash(paymentSignature(invoice.cash_forma_pago_detalle, 'method')) !== payloadHash(paymentSignature(cash, 'payment_method'))))
    return reject('invoice_payment_mismatch');
  return { ok: true as const, evidence: { orderId: order.id, folioId: folio.id, operationId: operation.operation_id,
    amountCents: total, chargeIds: charges.map(row => row.id), paymentIds: payments.map(row => row.id), cashMovementIds: cash.map(row => row.id) } };
}

/** Updates reconciliation metadata and audit together; never emits, collects,
 * changes a shift, or modifies the order, fiscal identity or financial ledger. */
export async function reconcileRestaurantInvoice(invoiceId: number): Promise<RestaurantReconciliationResult> {
  if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) return { status: 'not_applicable', invoiceId };
  const initial = (await db.execute(sql`SELECT restaurant_order_id FROM sales_invoices WHERE id=${invoiceId}`)).rows[0] as Row | undefined;
  if (!initial?.restaurant_order_id) return { status: 'not_applicable', invoiceId };
  return withFinancialScopeLock(`restaurant-invoice:${initial.restaurant_order_id}`, () => db.transaction(async tx => {
    await tx.execute(sql`SET LOCAL lock_timeout = '1s'`);
    await tx.execute(sql`SET LOCAL statement_timeout = '3s'`);
    const invoice = (await tx.execute(sql`SELECT si.* FROM sales_invoices si WHERE si.id=${invoiceId} AND ${activeSalesRecord('invoice', sql`si.id`)} FOR UPDATE`)).rows[0] as Row | undefined;
    if (!invoice || invoice.restaurant_order_id !== initial.restaurant_order_id) return { status: 'not_applicable', invoiceId };
    if (invoice.reconciliation_status === 'conciliada') return { status: 'already_completed', invoiceId };
    if (invoice.reconciliation_status !== 'pendiente') return { status: 'not_applicable', invoiceId };
    const order = (await tx.execute(sql`SELECT * FROM restaurant_orders WHERE id=${invoice.restaurant_order_id} FOR UPDATE`)).rows[0] as Row | undefined;
    if (!order) return { status: 'review', reason: 'order_missing', invoiceId };
    const operation = (await tx.execute(sql`SELECT * FROM billing_operations WHERE operation_id=${invoice.fiscal_identity?.operationId || ''} FOR SHARE`)).rows[0] as Row | undefined;
    const other = (await tx.execute(sql`SELECT id FROM sales_invoices WHERE id<>${invoiceId} AND (restaurant_order_id=${order.id} OR nota_credito_id=${invoiceId}) FOR SHARE`)).rows as Row[];
    const folios = (await tx.execute(sql`SELECT * FROM folios WHERE entity_type='restaurant_order' AND entity_id=${order.id} FOR UPDATE`)).rows as Row[];
    const movements = folios.length === 1 ? (await tx.execute(sql`SELECT * FROM folio_movements WHERE folio_id=${folios[0].id} FOR SHARE`)).rows as Row[] : [];
    // Include active refunds/adjustments in the input so they cannot be mistaken
    // for a full ordinary payment. Archived evidence cannot settle a document.
    const cash = (await tx.execute(sql`SELECT cm.* FROM cash_movements cm WHERE (cm.source_id=${order.id} OR (cm.source_type='comprobante' AND cm.source_id=${String(invoiceId)})) AND cm.anulado=false AND ${activeSalesRecord('cash_movement', sql`cm.id`)} FOR SHARE`)).rows as Row[];
    const proof = restaurantReconciliationProof(invoice, operation, order, folios, movements, cash, other);
    if (!proof.ok) return { status: 'review', reason: proof.reason, invoiceId };
    await tx.execute(sql`UPDATE sales_invoices SET reconciliation_status='conciliada', reconciliation_error=NULL, reconciliation_updated_at=now() WHERE id=${invoiceId}`);
    await tx.execute(sql`INSERT INTO audit_logs(id,user_name,action,module,entity_type,entity_id,description,details,timestamp)
      VALUES(${randomUUID()},'Sistema','update','billing','sales_invoice',${String(invoiceId)},'Conciliación automática de factura de Restaurant',${JSON.stringify({version:1,...proof.evidence})},now())`);
    return { status: 'completed', invoiceId };
  }));
}

const requests = new Set<number>();
let wakeWorker: (() => void) | undefined;
/** Scheduling is intentionally synchronous and cannot fail the already closed
 * ticket's response/PDF. The durable pending flag survives a process restart. */
export function requestRestaurantInvoiceReconciliation(invoiceId: number) {
  if (Number.isSafeInteger(invoiceId) && invoiceId > 0 && requests.size < 1000) requests.add(invoiceId);
  wakeWorker?.();
}
export async function reconcileRestaurantInvoiceBatch(afterId = 0, limit = 25) {
  const pageSize = Math.max(1, Math.min(100, Math.floor(limit)));
  const rows = (await db.execute(sql`SELECT si.id FROM sales_invoices si JOIN restaurant_orders ro ON ro.id=si.restaurant_order_id
    WHERE si.id>${afterId} AND si.reconciliation_status='pendiente' AND si.estado='emitida' AND si.reconciliation_error IS NULL
      AND ro.status='closed' AND ${activeSalesRecord('invoice', sql`si.id`)} ORDER BY si.id LIMIT ${pageSize}`)).rows as Row[];
  const results: RestaurantReconciliationResult[] = [];
  for (const row of rows) {
    try { results.push(await reconcileRestaurantInvoice(Number(row.id))); }
    catch { results.push({status:'review',reason:'verification_unavailable',invoiceId:Number(row.id)}); }
  }
  return { results, nextId: rows.length === pageSize ? Number(rows.at(-1)!.id) : 0 };
}
export function startRestaurantInvoiceReconciliation() {
  let stopped = false, running = false, cursor = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const reviewed = new Map<number, string>();
  const schedule = (delay: number) => { if (!stopped) { timer = setTimeout(() => void tick(), delay); timer.unref(); } };
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const immediate = [...requests].slice(0,25);
      for (const id of immediate) { requests.delete(id); try { await reconcileRestaurantInvoice(id); } catch { /* retry through durable pending scan */ } }
      const batch = await reconcileRestaurantInvoiceBatch(cursor); cursor = batch.nextId;
      for (const result of batch.results) {
        if (result.status === 'completed' || result.status === 'already_completed') reviewed.delete(result.invoiceId);
        if (result.status === 'review' && result.reason && reviewed.get(result.invoiceId) !== result.reason && reviewed.size < 1000) {
          reviewed.set(result.invoiceId, result.reason);
          console.warn(`[Restaurant] Revisión administrativa de factura ${result.invoiceId}: ${result.reason}. El cierre y sus cobros se conservan.`);
        }
      }
      const completed = batch.results.filter(result => result.status === 'completed').length;
      if (completed) console.info(`[Restaurant] Conciliación automática: ${completed} comprobante(s) verificado(s).`);
    } catch { console.warn('[Restaurant] Conciliación administrativa pendiente de verificación; las operaciones continúan disponibles.'); }
    finally { running = false; schedule(requests.size || cursor ? 1000 : 60_000); }
  };
  const wake = () => { if (!running && !stopped) { if (timer) clearTimeout(timer); schedule(0); } };
  wakeWorker = wake; schedule(0);
  return () => { stopped = true; if (timer) clearTimeout(timer); if (wakeWorker === wake) wakeWorker = undefined; };
}
