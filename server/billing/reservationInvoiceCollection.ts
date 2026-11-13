import {sql} from 'drizzle-orm';
import type {db} from '../db';
import {groupAdvanceReceipt} from './groupAdvanceReceipt';

type Executor = Pick<typeof db, 'execute'>;
const fail = (message:string) => Object.assign(new Error(message), {statusCode:409, notApplied:true});
export function isUncollectedRoomInvoice(invoice:any):boolean {
  const intent=invoice.credit_reapplication_intent;
  return ['FA','FB','FC','FM','FMB'].includes(invoice.tipo_comprobante)
    && invoice.estado==='emitida' && (!invoice.reconciliation_status || invoice.reconciliation_status==='conciliada')
    && Number(invoice.monto_total)>0 && Number(invoice.monto_acreditado||0)===0
    && !invoice.group_id && !invoice.group_payment_id && !invoice.payment_id
    && !invoice.cash_forma_pago && !invoice.cash_forma_pago_detalle
    && intent?.groupDocumentationOnly===true && intent?.settlement?.destination==='none'
    && intent?.settlement?.status==='completed' && !intent.payments?.length
    && !intent.ordinaryAdvances?.length && !intent.individualGroupSettlement;
}

/** Runs inside the payment/Caja/folio transaction. A concurrent room collection,
 * group allocation or invoice correction must finish before these facts are read. */
export async function lockRoomInvoiceCollection(tx:Executor, reservationId:string, invoiceId:number, amount:string, acknowledgeUnassignedAdvance:boolean) {
  const links=(await tx.execute(sql`SELECT group_id FROM group_reservation_links WHERE reservation_id=${reservationId}`)).rows as any[];
  if(links.length!==1)throw fail('La habitación debe pertenecer a un único grupo.');
  const groupId=String(links[0].group_id);
  await tx.execute(sql`SELECT id FROM groups WHERE id=${groupId} FOR UPDATE`);
  const room=(await tx.execute(sql`SELECT r.status,
    coalesce(r.total_room_amount,0)::numeric+coalesce((SELECT sum(c.amount::numeric) FROM charges c WHERE c.reservation_id=r.id AND coalesce(c.status,'active')<>'anulado'),0)
    -coalesce((SELECT sum(p.amount::numeric) FROM payments p WHERE p.reservation_id=r.id AND coalesce(p.status,'active')<>'anulado'),0) balance
    FROM reservations r JOIN group_reservation_links gl ON gl.reservation_id=r.id AND gl.group_id=${groupId} WHERE r.id=${reservationId} FOR UPDATE OF r`)).rows[0] as any;
  if(!room||!['confirmed','checked_in','checked_out'].includes(room.status)||Math.round(Number(amount)*100)>Math.round(Number(room.balance)*100))throw fail('El cobro supera el saldo pendiente de esta habitación. Actualizá la cuenta.');
  const invoice=(await tx.execute(sql`SELECT * FROM sales_invoices WHERE id=${invoiceId} AND reserva_id=${reservationId} FOR UPDATE`)).rows[0] as any;
  if(!invoice||!isUncollectedRoomInvoice(invoice)||Math.round(Number(amount)*100)!==Math.round(Number(invoice.monto_total)*100))throw fail('Esta factura ya tiene cobros o ajustes, o el importe no coincide. Actualizá antes de cobrar.');
  if((await tx.execute(sql`SELECT id FROM sales_invoices WHERE nota_credito_id=${invoiceId} LIMIT 1`)).rows.length)throw fail('La factura tiene una corrección fiscal. Revisala antes de cobrar.');
  const existing=(await tx.execute(sql`SELECT invoice_ref FROM payments WHERE reservation_id=${reservationId} AND coalesce(status,'active')<>'anulado' AND invoice_ref IS NOT NULL`)).rows as any[];
  for(const payment of existing){
    let ref:any;try{ref=typeof payment.invoice_ref==='string'?JSON.parse(payment.invoice_ref):payment.invoice_ref;}catch{throw fail('Un cobro conserva un vínculo fiscal que requiere revisión.');}
    if(Number(ref?.id)===invoiceId)throw fail('La factura ya tiene un pago vinculado. No se repitió el ingreso.');
  }
  const receipts=(await tx.execute(sql`SELECT gp.*,coalesce((SELECT jsonb_agg(jsonb_build_object('reservation_id',p.reservation_id,'amount',p.amount,'method',p.method)) FROM payments p WHERE p.group_payment_id=gp.id AND coalesce(p.status,'active')<>'anulado'),'[]'::jsonb) children FROM group_payments gp WHERE group_id=${groupId}`)).rows as any[];
  if(!acknowledgeUnassignedAdvance&&receipts.some(receipt=>{const facts=groupAdvanceReceipt(receipt,receipt.children);return facts.requiresReview||facts.available>0.009;}))throw fail('Hay anticipos grupales sin asignar. Aplicá el anticipo o confirmá que este es dinero nuevo.');
  return invoice;
}

export async function finishRoomInvoiceCollection(tx:Executor, invoice:any, paymentId:string, cashMovementId:string, method:string, registeredBy?:string, userId?:string) {
  const details=JSON.stringify([{method,amount:Number(invoice.monto_total)}]);
  await tx.execute(sql`UPDATE sales_invoices SET payment_id=${paymentId},cash_forma_pago=${method},cash_forma_pago_detalle=${details}::jsonb,
    credit_reapplication_intent=jsonb_set(credit_reapplication_intent,'{postIssueCashCollection}',${JSON.stringify({paymentId,cashMovementId,method,amount:Number(invoice.monto_total),registeredBy})}::jsonb) WHERE id=${invoice.id}`);
  await tx.execute(sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp)
    VALUES(${userId||null},${registeredBy||null},'create','billing','sales_invoice',${String(invoice.id)},'Cobro de factura emitida; sin nueva emisión fiscal',${JSON.stringify({invoiceId:invoice.id,paymentId,cashMovementId,method,amount:Number(invoice.monto_total),invoiceBefore:invoice,fiscalFieldsChanged:false})},now())`);
}
