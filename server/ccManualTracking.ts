import {z} from 'zod';
import {sql} from 'drizzle-orm';
import {db,withDatabaseTransaction} from './db';
export const manualTrackingInput=z.object({
 requestId:z.string().uuid(),salesInvoiceId:z.number().int().positive().nullable().optional(),
 entityName:z.string().trim().min(1).max(250),reference:z.string().trim().max(150).default(''),
 fecha:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),motivo:z.string().trim().min(1).max(1000),
 monto:z.number().finite().min(0).max(999999999).nullable().default(null),
 estado:z.enum(['pendiente','enviada','reclamada','pagada','cargada_extranet']).default('pendiente'),
 observaciones:z.string().max(5000).nullable().default(null),
});
export async function ensureCcManualTrackingSchema(){await db.execute(sql`CREATE TABLE IF NOT EXISTS cc_manual_tracking(
 id serial PRIMARY KEY,request_id uuid UNIQUE NOT NULL,sales_invoice_id integer UNIQUE REFERENCES sales_invoices(id),
 entity_name text NOT NULL,reference text NOT NULL DEFAULT '',fecha date NOT NULL,motivo text NOT NULL,
 monto numeric(14,2),estado text NOT NULL DEFAULT 'pendiente',observaciones text,updated_by text,
 updated_at timestamptz NOT NULL DEFAULT now())`);}
export async function addCcManualTracking(input:unknown,user:string|null){
 const data=manualTrackingInput.parse(input);
 return withDatabaseTransaction(async()=>{
  const retry=(await db.execute(sql`SELECT id FROM cc_manual_tracking WHERE request_id=${data.requestId}`)).rows[0];if(retry)return retry;
  let name=data.entityName,reference=data.reference,fecha=data.fecha,monto=data.monto,estado=data.estado,observaciones=data.observaciones;
  if(data.salesInvoiceId){
   const inv=(await db.execute(sql`SELECT * FROM sales_invoices WHERE id=${data.salesInvoiceId} AND estado='emitida' AND tipo_comprobante LIKE 'F%' AND cash_forma_pago='cuenta_corriente' FOR SHARE`)).rows[0] as any;
   if(!inv)throw new Error('Elegí una factura vigente en cuenta corriente');
   const existing=(await db.execute(sql`SELECT estado,observaciones FROM cc_invoice_tracking WHERE sales_invoice_id=${data.salesInvoiceId}`)).rows[0] as any;
   if(existing){estado=existing.estado;if(!observaciones)observaciones=existing.observaciones;}
   name=inv.cliente_razon_social;reference=`${inv.tipo_comprobante} ${String(inv.punto_venta).padStart(4,'0')}-${String(inv.numero).padStart(8,'0')}`;fecha=String(inv.fecha_emision);monto=Number(inv.monto_total);
  }
  const row=(await db.execute(sql`INSERT INTO cc_manual_tracking(request_id,sales_invoice_id,entity_name,reference,fecha,motivo,monto,estado,observaciones,updated_by)
   VALUES(${data.requestId},${data.salesInvoiceId??null},${name},${reference},${fecha},${data.motivo},${monto},${estado},${observaciones},${user}) RETURNING id`)).rows[0];
  await db.execute(sql`INSERT INTO audit_logs(action,module,entity_type,entity_id,description,details,user_name,timestamp) VALUES('create','admin','cc_manual_tracking',${String(row.id)},'Seguimiento manual agregado',${JSON.stringify(data)}::jsonb,${user},now())`);
  return row;
 });
}
export async function getCcManualTrackingRows(){const result=await db.execute(sql`SELECT m.*,si.estado invoice_estado,si.recipient_entity_type,si.recipient_entity_id FROM cc_manual_tracking m LEFT JOIN sales_invoices si ON si.id=m.sales_invoice_id WHERE m.sales_invoice_id IS NULL OR si.estado='emitida' ORDER BY m.fecha DESC,m.id DESC`);
 return result.rows.map((r:any)=>({manualId:r.id,salesInvoiceId:r.sales_invoice_id??-r.id,numeroFactura:r.reference||'Sin referencia',tipoComprobante:'Seguimiento',fecha:String(r.fecha),entityType:r.recipient_entity_type??'company',entityId:r.recipient_entity_id??'',entityName:r.entity_name,motivo:r.motivo,monto:r.monto===null?0:Number(r.monto),amountPending:r.monto===null || (r.sales_invoice_id!==null&&Number(r.monto)===0),estado:r.estado,observaciones:r.observaciones,updatedAt:String(r.updated_at)}));
}
