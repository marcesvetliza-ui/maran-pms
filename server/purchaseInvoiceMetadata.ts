import {z} from 'zod';
import {sql,type SQL} from 'drizzle-orm';
import {validCalendarDate} from './stayEligibility';
import {assertPurchaseInvoiceNotDuplicate} from './purchase-invoice-duplicates';
import {normalizePurchaseCreditNotePayment} from '@shared/purchase-credit-note-payment';
import {canCorrectPurchaseInvoiceMetadata} from '@shared/purchase-invoice-edit';
export const purchaseInvoiceMetadataInput=z.object({
 puntoVenta:z.string().trim().regex(/^\d{1,5}$/),
 numeroComprobante:z.string().trim().regex(/^\d{1,8}$/).refine(value=>Number(value)>0),
 fechaEmision:z.string().refine(validCalendarDate),
 observaciones:z.string().max(5000),
 motivo:z.string().trim().min(3).max(500),
 expectedVersion:z.string().min(1).max(100).nullable(),
 formaPagoInformativa:z.string().nullable().optional(),
}).strict();
const fail=(message:string,statusCode=409)=>Object.assign(new Error(message),{statusCode});
type Executor={execute:(query:SQL)=>Promise<any>};
export async function correctPurchaseInvoiceMetadata(tx:Executor,id:number,input:z.infer<typeof purchaseInvoiceMetadataInput>,actor:{id?:string;name?:string}){
 const before=(await tx.execute(sql`SELECT *,updated_at::text AS metadata_version FROM purchase_invoices WHERE id=${id} FOR UPDATE`)).rows[0];
 if(!before)throw fail('Comprobante no encontrado',404);
 if(!canCorrectPurchaseInvoiceMetadata(before.tipo_comprobante,before.estado))throw fail('Esta corrección corresponde a facturas y notas de compras pagadas o parcialmente pagadas.');
 const paymentInfo=normalizePurchaseCreditNotePayment(before.tipo_comprobante,input.formaPagoInformativa);
 if(before.metadata_version!==input.expectedVersion)throw fail('El comprobante cambió desde que abriste la pantalla. Actualizá y volvé a intentar.');
 await assertPurchaseInvoiceNotDuplicate(tx,{excludeInvoiceId:id,supplierId:before.supplier_id,proveedorCuit:before.proveedor_cuit,tipoComprobante:before.tipo_comprobante,puntoVenta:input.puntoVenta,numeroComprobante:input.numeroComprobante});
 const external=input.puntoVenta.padStart(5,'0')+'-'+input.numeroComprobante.padStart(8,'0');
 const after=(await tx.execute(sql`UPDATE purchase_invoices SET punto_venta=${input.puntoVenta},numero_comprobante=${input.numeroComprobante},numero_comprobante_ext=${external},fecha_emision=${input.fechaEmision},observaciones=${input.observaciones||null},forma_pago_informativa=CASE WHEN ${input.formaPagoInformativa!==undefined} THEN ${paymentInfo} ELSE forma_pago_informativa END,updated_at=now() WHERE id=${id} RETURNING *,updated_at::text AS metadata_version`)).rows[0];
 // Refresh documentary references in the same entry; never recreate its lines,
 // change the accounting date/period, or touch amounts, payments or stock.
 if(before.asiento_id)await tx.execute(sql`UPDATE accounting_entry_lines SET comprobante_numero=${external} WHERE entry_id=${before.asiento_id} AND EXISTS(SELECT 1 FROM accounting_entries WHERE id=${before.asiento_id} AND origen_id=${id} AND origen_tipo='purchase_invoice')`);
 await tx.execute(sql`UPDATE iibb_retentions SET nro_comprobante=${Number(input.numeroComprobante)},fecha_comprobante=${input.fechaEmision} WHERE invoice_id=${id}`);
 const documentary=(row:any)=>({puntoVenta:row.punto_venta,numeroComprobante:row.numero_comprobante,numeroComprobanteExt:row.numero_comprobante_ext,fechaEmision:row.fecha_emision,observaciones:row.observaciones,formaPagoInformativa:row.forma_pago_informativa});
 await tx.execute(sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp) VALUES(${actor.id||null},${actor.name||'Sistema'},'update','purchase_invoices','purchase_invoice_metadata',${String(id)},'Corrección de datos de comprobante de compra cancelado',${JSON.stringify({reason:input.motivo,before:documentary(before),after:documentary(after)})},now())`);
 return after;
}
