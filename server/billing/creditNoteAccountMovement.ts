import {sql} from 'drizzle-orm';
import {getArgentinaToday} from '../db-storage';

// Call inside a transaction. Never emits a fiscal document or changes payments.
export async function creditNoteAccountMovement(tx:any, original:any, nc:any) {
 const value=(row:any,snake:string,camel:string)=>row[snake]??row[camel];
 const invoiceId=Number(original.id), ncId=Number(nc.id);
 const reservationId=value(original,'reserva_id','reservaId');
 const invoiceRef=`${value(original,'tipo_comprobante','tipoComprobante')}-${String(original.numero).padStart(8,'0')}`;
 const intent=value(original,'credit_reapplication_intent','creditReapplicationIntent');
 const operationId=intent?.operationId;
 const operationRef=operationId?`credit-operation:${operationId}`:null;
 const paymentId=value(original,'payment_id','paymentId')??null;
 const rows=(await tx.execute(sql`SELECT id,entity_type,entity_id,amount,area FROM account_movements
   WHERE type='cargo' AND voided=false AND reservation_id IS NOT DISTINCT FROM ${reservationId??null}
     AND (reference=${invoiceRef} OR (${operationRef}::text IS NOT NULL AND reference=${operationRef})
       OR (${paymentId}::varchar IS NOT NULL AND payment_id=${paymentId}))
   ORDER BY id FOR UPDATE`)).rows as any[];
 if(rows.length>1)throw new Error('La factura tiene varios cargos de cuenta corriente posibles; requiere revisión para evitar un descuento incorrecto');
 if(!rows.length)return {status:'no_matching_charge',amount:0};
 const cargo=rows[0];
 const marker=`[nc:${ncId}]`;
 const existing=(await tx.execute(sql`SELECT id FROM account_movements WHERE entity_type=${cargo.entity_type}
  AND entity_id=${cargo.entity_id} AND reservation_id IS NOT DISTINCT FROM ${reservationId??null}
  AND type='pago' AND voided=false AND position(${marker} in description)>0`)).rows;
 if(existing.length)return {status:'already_applied',amount:0};
 // Fiscal IDs distinguish identical numbers from different points of sale.
 const reversed=(await tx.execute(sql`SELECT coalesce(sum(abs(m.amount::numeric)),0) total
  FROM account_movements m WHERE m.entity_type=${cargo.entity_type} AND m.entity_id=${cargo.entity_id}
   AND m.reservation_id IS NOT DISTINCT FROM ${reservationId??null} AND m.type='pago' AND m.voided=false
   AND EXISTS(SELECT 1 FROM sales_invoices n WHERE n.nota_credito_id=${invoiceId}
     AND n.tipo_comprobante IN ('NCA','NCB','NCC','NCT','NCM','NCMB')
     AND position('[nc:' || n.id::text || ']' in m.description)>0)`)).rows[0] as any;
 const total=Number(value(nc,'monto_total','montoTotal'));
 if(!Number.isFinite(total)||total<=0)throw new Error('Importe de nota de crédito inválido');
 const amount=Number(Math.min(total,Math.max(0,Number(cargo.amount)-Number(reversed.total))).toFixed(2));
 if(amount<=0)return {status:'fully_reversed',amount:0};
 const kind=value(nc,'tipo_comprobante','tipoComprobante');
 const label=`Nota de crédito ${kind} ${String(value(nc,'punto_venta','puntoVenta')).padStart(4,'0')}-${String(nc.numero).padStart(8,'0')} s/ factura ${invoiceRef} ${marker} [cargo:${cargo.id}]`;
 await tx.execute(sql`INSERT INTO account_movements(entity_type,entity_id,date,type,description,amount,reservation_id,reference,area)
  VALUES(${cargo.entity_type},${cargo.entity_id},${getArgentinaToday()},'pago',${label},${String(-amount)},${reservationId??null},${`${kind}-${String(nc.numero).padStart(8,'0')}`},${cargo.area??'recepcion'})`);
 return {status:'applied',amount};
}
