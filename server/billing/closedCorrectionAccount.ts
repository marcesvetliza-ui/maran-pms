import { sql } from 'drizzle-orm';
import { db } from '../db';
import { getArgentinaToday } from '../db-storage';

export async function correctionAccountOwner(type:string,id:string) {
 const table=type==='company'?sql`companies`:type==='agency'?sql`agencies`:type==='guest'?sql`guests`:null;
 if(!table)throw Object.assign(new Error('Seleccioná una cuenta corriente válida.'),{statusCode:400});
 const row=(await db.execute(sql`SELECT to_jsonb(t) data FROM ${table} t WHERE t.id=${id} LIMIT 1`)).rows[0] as any;
 if(!row)throw Object.assign(new Error('La cuenta corriente seleccionada no existe.'),{statusCode:409});
 const data=row.data;
 return {entityType:type,entityId:id,name:data.razon_social||data.nombre_fantasia||[data.first_name,data.last_name].filter(Boolean).join(' ')||id,document:String(data.cuil_cuit||data.cuit||data.dni||'').replace(/\D/g,'')};
}

export async function loadCorrectionAccount(original:any) {
 const ref=`${original.tipo_comprobante}-${String(original.numero).padStart(8,'0')}`;
 const operation=original.credit_reapplication_intent?.operationId;
 const rows=(await db.execute(sql`SELECT id,entity_type,entity_id,amount,area FROM account_movements
 WHERE type='cargo' AND voided=false AND reservation_id IS NOT DISTINCT FROM ${original.reserva_id}
 AND (reference=${ref} OR (${operation||null}::text IS NOT NULL AND reference=${operation?'credit-operation:'+operation:null})
 OR (${original.payment_id||null}::varchar IS NOT NULL AND payment_id=${original.payment_id||null})) ORDER BY id`)).rows as any[];
 if(rows.length!==1)throw Object.assign(new Error('No se pudo identificar un único cargo de Cuenta Corriente de esta factura. Requiere revisión administrativa.'),{statusCode:409});
 const cargo=rows[0]; const amount=Number(cargo.amount);
 if(!Number.isFinite(amount)||amount<=0||Math.round(amount*100)>Math.round(Number(original.monto_total)*100))throw Object.assign(new Error('El cargo de Cuenta Corriente no coincide con la factura.'),{statusCode:409});
 return {...await correctionAccountOwner(cargo.entity_type,cargo.entity_id),cargoId:String(cargo.id),amount,area:cargo.area||'recepcion'};
}

// Called under the reservation financial lock, only after fiscal authorization.
// Correct the account ledger without manufacturing a second reservation payment.
export async function reconcileClosedCorrectionAccount(invoice:any,intent:any) {
 const settlement=intent.settlement;
 await db.transaction(async tx=>{
  await tx.execute(sql`SELECT id FROM sales_invoices WHERE id=${invoice.id} FOR UPDATE`);
  const reference=`credit-operation:${intent.operationId}`;
  const existing=(await tx.execute(sql`SELECT id,entity_type,entity_id,amount FROM account_movements WHERE reference=${reference} AND type='cargo' AND voided=false FOR UPDATE`)).rows as any[];
  if(existing.length){
   if(existing.length!==1||existing[0].entity_type!==settlement.ccEntityType||existing[0].entity_id!==settlement.ccEntityId||Math.round(Number(existing[0].amount)*100)!==Math.round(settlement.amount*100))throw new Error('El cargo de refacturación existente no coincide con el intento guardado.');
   return;
  }
  await tx.execute(sql`INSERT INTO account_movements(entity_type,entity_id,date,type,description,amount,reservation_id,reference,area)
  VALUES(${settlement.ccEntityType},${settlement.ccEntityId},${getArgentinaToday()},'cargo',${settlement.label},${String(settlement.amount)},${invoice.reserva_id},${reference},${settlement.accountArea||'recepcion'})`);
 });
}
