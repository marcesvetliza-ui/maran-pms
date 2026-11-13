import {randomUUID} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {db} from '../db';
import {storage} from '../db-storage';
import {normalizeToSpanishPaymentMethod} from '../payment-method';

const field=(row:any,snake:string,camel:string)=>row?.[snake]??row?.[camel];
const fail=(message:string)=>Object.assign(new Error(message),{statusCode:409});
const money=(value:any)=>Math.round(Number(value)*100);
/** Only standalone cash receipts: account/room/CC and fiscal flows keep their own settlement. */
export function isStandaloneSpaCashReceipt(invoice:any,area:string):boolean {
  return area==='spa' && ['ticket','cierre_spa','cierre_spa_agustin','cierre_spa_cortesia'].includes(field(invoice,'tipo_comprobante','tipoComprobante'))
    && invoice.estado==='emitida' && normalizeToSpanishPaymentMethod(field(invoice,'cash_forma_pago','cashFormaPago'))==='efectivo'
    && money(field(invoice,'monto_total','montoTotal'))>0
    && ['reserva_id','payment_id','group_id','group_payment_id','group_payment_intent','credit_reapplication_intent','spa_account_id','restaurant_order_id','folio_id','nota_credito_id','center_settlement_area','center_settlement_status','source_charge_ids','source_charge_amounts']
      .every(key=>field(invoice,key,key.replace(/_([a-z])/g,(_,letter)=>letter.toUpperCase()))==null);
}

/** Cash and reconciliation commit together. Replays reuse the verified receipt,
 * including historical receipts, rather than generating another income. */
export async function settleStandaloneSpaCashReceipt(invoiceId:number,operator?:string,userId?:string,label?:string) {
  return db.transaction(async tx=>{
    const invoice=(await tx.execute(sql`SELECT * FROM sales_invoices WHERE id=${invoiceId} FOR UPDATE`)).rows[0] as any;
    if(!invoice||!isStandaloneSpaCashReceipt(invoice,'spa')||invoice.cae||Number(invoice.monto_acreditado||0)!==0
      || ![null,undefined,'pendiente','conciliada'].includes(invoice.reconciliation_status)||invoice.reconciliation_error)
      throw fail('El comprobante SPA requiere revisión antes de cerrar su cobro.');
    const detail=invoice.cash_forma_pago_detalle;
    if(detail!=null&&(!Array.isArray(detail)||detail.length!==1||normalizeToSpanishPaymentMethod(detail[0].method)!=='efectivo'||money(detail[0].amount)!==money(invoice.monto_total)))
      throw fail('El desglose de efectivo no coincide con el comprobante SPA.');
    if((await tx.execute(sql`SELECT id FROM sales_invoices WHERE nota_credito_id=${invoiceId} LIMIT 1`)).rows.length)
      throw fail('El comprobante SPA tiene una corrección que requiere revisión.');
    const cash=(await tx.execute(sql`SELECT * FROM cash_movements WHERE source_type='comprobante' AND source_id=${String(invoiceId)} AND anulado=false FOR UPDATE`)).rows as any[];
    let cashId:string;
    if(cash.length){
      if(cash.length!==1||cash[0].area!=='spa'||cash[0].movement_type!=='income'||normalizeToSpanishPaymentMethod(cash[0].payment_method)!=='efectivo'||money(cash[0].amount)!==money(invoice.monto_total)||cash[0].payment_id)
        throw fail('Los movimientos de Caja no coinciden con este comprobante SPA. No se registró otro ingreso.');
      cashId=String(cash[0].id);
    }else{
      if(invoice.reconciliation_status==='conciliada')throw fail('El comprobante SPA figura conciliado pero su ingreso no está disponible. Requiere revisión.');
      if((await tx.execute(sql`SELECT id FROM cash_movements WHERE source_type='comprobante' AND source_id=${String(invoiceId)} LIMIT 1`)).rows.length)
        throw fail('El ingreso anterior de este comprobante fue anulado. Requiere revisión antes de registrar otro.');
      const shift=await storage.getOrCreateActiveTurno('spa');
      if(!(await tx.execute(sql`SELECT id FROM cash_shifts WHERE id=${shift.id} AND area='spa' AND status='open' FOR UPDATE`)).rows.length)
        throw fail('El turno de SPA se cerró durante la operación. Reintentá el mismo cobro.');
      cashId=randomUUID();
      await tx.execute(sql`INSERT INTO cash_movements(id,shift_id,area,source_type,source_id,source_label,payment_method,amount,movement_type,registered_by,receipt_type,receipt_number)
        VALUES(${cashId},${shift.id},'spa','comprobante',${String(invoiceId)},${label||`${invoice.tipo_comprobante}-${String(invoice.numero).padStart(8,'0')}`},'efectivo',${invoice.monto_total},'income',${operator||null},${invoice.tipo_comprobante},nextval('cash_movements_receipt_number_seq'::regclass)::text)`);
    }
    if(invoice.reconciliation_status!=='conciliada'){
      await tx.execute(sql`UPDATE sales_invoices SET reconciliation_status='conciliada',reconciliation_error=NULL,reconciliation_updated_at=now() WHERE id=${invoiceId}`);
      await tx.execute(sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp)
        VALUES(${userId||null},${operator||null},'update','billing','sales_invoice',${String(invoiceId)},'Comprobante SPA conciliado con ingreso de Caja verificado',${JSON.stringify({cashMovementId:cashId,amount:Number(invoice.monto_total),previousStatus:invoice.reconciliation_status,newCash:cash.length===0})},now())`);
    }
    return {reconciliationStatus:'conciliada',reconciliationError:null};
  });
}
