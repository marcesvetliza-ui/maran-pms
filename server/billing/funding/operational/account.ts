import { z } from "zod";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { resolveSpaCatalogCharge } from "./catalog";
import { consumeStockLines, type ConsumptionLine } from "../../../inventoryStockEngine";
import { FundingError, hash, identifier, moneyMethods, number, requirePermission, stableId, type Actor } from "../contracts";
import { SqlFundingAdapter } from "../adapters";
import type { PaymentFundingService } from "../service";

const cents=z.number().int().positive().max(9999999999);
export const spaAccountCommand=z.discriminatedUnion("action",[
 z.object({action:z.literal("add-charge"),description:z.string().trim().min(1).max(300),quantity:z.number().int().positive().max(9999),unitCents:cents,inventoryItemId:z.string().min(1).optional(),catalogItem:z.object({source:z.enum(["restaurant","spa","inventory"]),id:z.string().min(1)}).strict().optional()}).strict(),
 z.object({action:z.literal("void-charge"),itemId:z.string().min(1),reason:z.string().trim().min(3).max(500)}).strict(),
 z.object({action:z.literal("payment"),amountCents:cents,method:z.enum(moneyMethods),shiftId:z.string().min(1),notes:z.string().trim().max(500).default("")}).strict(),
 z.object({action:z.literal("room-transfer"),reservationId:z.string().min(1),expectedCents:cents,reason:z.string().trim().min(3).max(500)}).strict(),
]);
const envelope=z.object({commandId:z.string().uuid(),request:spaAccountCommand}).strict();

async function sourceAccount(service:PaymentFundingService,c:PoolClient,id:string,s:string) {
 const scope={kind:"spa" as const,id};
 await service.store.assertAdopted(c,scope);
 const a=(await c.query(`SELECT * FROM ${s}.spa_accounts WHERE id=$1 FOR UPDATE`,[id])).rows[0];
 if(!a) throw new FundingError("NOT_FOUND","Cuenta SPA inexistente.",404);
 return a;
}
export async function editable(service:PaymentFundingService,c:PoolClient,id:string,s:string,allowClosed=false) {
 const a=await sourceAccount(service,c,id,s);
 await service.adapter({kind:"spa",id}).assertScope(c,{kind:"spa",id});
 if(a.status!=="open"&&!(allowClosed&&a.status==="closed")) throw new FundingError("ACCOUNT_CLOSED","La cuenta está cerrada; sus cargos se conservan para consulta.");
 if((await c.query("SELECT id FROM payment_funding.operations WHERE scope_kind='spa' AND scope_id=$1 LIMIT 1",[id])).rowCount)
  throw new FundingError("FISCAL_OPERATION_PENDING","La cuenta ya tiene una operación de facturación. Completala antes de modificarla.");
 return a;
}
export async function invalidateDrafts(service:PaymentFundingService,c:PoolClient,id:string,commandId:string,actor:Actor) {
 const docs=(await c.query("SELECT * FROM payment_funding.documents WHERE scope_kind='spa' AND scope_id=$1 FOR UPDATE",[id])).rows;
 if(docs.some(d=>d.status!=="draft"||d.invoice_id)) throw new FundingError("DOCUMENT_ALREADY_ISSUED","La cuenta tiene un comprobante fiscal; no se modifican sus cargos.");
 if(docs.length) {
  await service.store.event(c,null,`spa-drafts:${commandId}`,"spa_drafts_invalidated",{scopeKey:`spa:${id}`,documents:docs},actor.id);
  await c.query("DELETE FROM payment_funding.documents WHERE scope_kind='spa' AND scope_id=$1",[id]);
 }
}
async function syncAccount(service:PaymentFundingService,c:PoolClient,id:string,s:string) {
 const total=(await c.query(`SELECT COALESCE(sum(subtotal),0) AS total FROM ${s}.spa_account_items WHERE account_id=$1`,[id])).rows[0].total;
 await c.query(`UPDATE ${s}.spa_accounts SET subtotal=$2,total=$2 WHERE id=$1`,[id,total]);
 const adapter=service.adapter({kind:"spa",id}) as SqlFundingAdapter;
 const folio=await adapter.folio(c,{kind:"spa",id});
 await c.query(`UPDATE ${s}.folios SET total_charges=$2 WHERE id=$1`,[folio.id,total]);
 await adapter.refreshFolio(c,{kind:"spa",id});
}
async function productConsumption(c:PoolClient,s:string,itemId:string,lines:ConsumptionLine[],actor:Actor) {
 const old=(await c.query("SHOW search_path")).rows[0].search_path;
 await c.query("SELECT set_config('search_path',$1,true)",[`${s},public`]);
 try {
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`inventory-consumption:spa_account_item:${itemId}`]);
  await c.query(`INSERT INTO ${s}.inventory_consumption_jobs(source_type,source_id,lines,actor) VALUES('spa_account_item',$1,$2,$3)`,[itemId,JSON.stringify(lines),actor.id]);
  await c.query("SAVEPOINT spa_product_stock");
  try {
   await consumeStockLines(drizzle(c),lines,{type:"spa_account_item",id:itemId,actor:actor.id,notes:"Venta de producto en folio SPA"});
   await c.query("RELEASE SAVEPOINT spa_product_stock");
   await c.query(`UPDATE ${s}.inventory_consumption_jobs SET status='completed',completed_at=now() WHERE source_type='spa_account_item' AND source_id=$1`,[itemId]);
  } catch(error:any) {
   await c.query("ROLLBACK TO SAVEPOINT spa_product_stock");
   if(!error.statusCode) throw error;
   await c.query(`UPDATE ${s}.inventory_consumption_jobs SET error=$2 WHERE source_type='spa_account_item' AND source_id=$1`,[itemId,error.message]);
  }
 } finally {await c.query("SELECT set_config('search_path',$1,true)",[old]).catch(()=>{});}
}

/** One scope lock, one connection, one immutable command identity for every
 * account action. No legacy writer or additional financial finalizer. */
export async function executeSpaAccountCommand(service:PaymentFundingService,id:string,input:unknown,actor:Actor,schema="public") {
 requirePermission(actor);
 const {commandId,request}=envelope.parse(input),s=identifier(schema),scope={kind:"spa" as const,id};
 return service.store.transaction(scope,null,async c=>{
  const key=`spa-account:${id}:${commandId}`,fingerprint=hash({request,actor:actor.id});
  const prior=(await c.query("SELECT payload FROM payment_funding.events WHERE event_key=$1",[key])).rows[0]?.payload;
  if(prior) {
   if(prior.fingerprint!==fingerprint) throw new FundingError("IDEMPOTENCY_CONFLICT","Este intento ya se usó con otros datos.");
   return prior.result;
  }
  const a=await editable(service,c,id,s),adapter=service.adapter(scope) as SqlFundingAdapter;
  const folio=await adapter.folio(c,scope),totals=await adapter.totals(c,scope);
  let result:any={action:request.action};
  if(request.action==="add-charge") {
   const subtotal=request.quantity*request.unitCents;
   if(!Number.isSafeInteger(subtotal)||subtotal>9999999999) throw new FundingError("INVALID_AMOUNT","El importe del cargo supera el límite.",422);
   if(request.inventoryItemId&&request.catalogItem)throw new FundingError("INVALID_PRODUCT","Elegí un único origen de catálogo.",422);
   const catalog=request.catalogItem??(request.inventoryItemId?{source:"inventory" as const,id:request.inventoryItemId}:null);
   const selected=catalog?await resolveSpaCatalogCharge(c,catalog.source,catalog.id,request.quantity,request.unitCents,schema):null;
   await invalidateDrafts(service,c,id,commandId,actor);
   const itemId=stableId(`spa-item:${id}:${commandId}`);
   await c.query(`INSERT INTO ${s}.spa_account_items(id,account_id,description,quantity,unit_price,subtotal,item_type,inventory_item_id,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())`,[itemId,id,selected?.description??request.description,request.quantity,request.unitCents/100,subtotal/100,selected?"product":"extra",selected?.inventoryItemId??null]);
   await c.query(`INSERT INTO ${s}.folio_movements(id,folio_id,type,amount,description,source_type,source_id,registered_by)
    VALUES($1,$2,'charge',$3,$4,'spa_item',$5,$6)`,[stableId(`${commandId}:charge`),folio.id,subtotal/100,selected?.description??request.description,itemId,actor.id]);
   if(selected) await productConsumption(c,s,itemId,selected.lines,actor);
   await syncAccount(service,c,id,s);
   result={...result,itemId};
  } else if(request.action==="void-charge") {
   const item=(await c.query(`SELECT * FROM ${s}.spa_account_items WHERE id=$1 AND account_id=$2 FOR UPDATE`,[request.itemId,id])).rows[0];
   if(!item) throw new FundingError("NOT_FOUND","El cargo no pertenece a esta cuenta.",404);
   if(item.item_type==="treatment") throw new FundingError("TREATMENT_CHARGE","El tratamiento se modifica o cancela desde su turno.");
   if(item.item_type==="discount") throw new FundingError("DISCOUNT_REVIEW_REQUIRED","El descuento se cambia desde la prefactura.");
   const stock=(await c.query(`SELECT 1 FROM ${s}.stock_movements WHERE source_type='spa_account_item' AND source_id=$1 LIMIT 1`,[item.id])).rowCount;
   const job=(await c.query(`SELECT status FROM ${s}.inventory_consumption_jobs WHERE source_type='spa_account_item' AND source_id=$1 FOR UPDATE`,[item.id])).rows[0];
   const reversed=(await c.query(`SELECT 1 FROM ${s}.inventory_source_reversals WHERE source_type='spa_account_item' AND source_id=$1 AND completed_at IS NOT NULL`,[item.id])).rowCount;
   if((stock&&!reversed)||(job&&job.status!=="cancelled")) throw new FundingError("STOCK_REVIEW_REQUIRED","Revertí o cancelá el consumo desde Inventario antes de anular este producto.");
   const value=number(Math.round(Number(item.subtotal)*100));
   if(totals.totalCents-value<totals.paidCents) throw new FundingError("PAYMENTS_EXCEED_CHARGES","El cargo dejaría pagos por encima del total. Primero revisá los cobros.");
   await invalidateDrafts(service,c,id,commandId,actor);
   await c.query(`INSERT INTO ${s}.folio_movements(id,folio_id,type,amount,description,source_type,source_id,registered_by,void_reason)
    VALUES($1,$2,'void',$3,$4,'spa_item_void',$5,$6,$7)`,[stableId(`${commandId}:void`),folio.id,value/100,`Anulación: ${item.description}`,item.id,actor.id,request.reason]);
   await c.query(`DELETE FROM ${s}.spa_account_items WHERE id=$1`,[item.id]);
   await syncAccount(service,c,id,s);
   result={...result,item};
  } else if(request.action==="payment") {
   if(request.amountCents>totals.totalCents-totals.paidCents) throw new FundingError("COLLECTION_EXCEEDS_DEBT","El pago supera el saldo pendiente.");
   const shift=(await c.query(`SELECT id FROM ${s}.cash_shifts WHERE id=$1 AND opened_by=$2 AND area='spa' AND status='open' FOR UPDATE`,[request.shiftId,actor.id])).rowCount;
   if(!shift) throw new FundingError("SHIFT_CLOSED","Abrí tu caja SPA para registrar este pago.");
   const row={rowId:"account-payment",method:request.method,amountCents:request.amountCents,shiftId:request.shiftId};
   const collection=await adapter.collect(c,scope,row,commandId,actor);
   await c.query(`INSERT INTO payment_funding.receipts(id,scope_kind,scope_id,source_payment_id,original_cents,effective_cents,method,cash_movement_id,folio_movement_id)
    VALUES($1,'spa',$2,$3,$4,$4,$5,$6,$7)`,[collection.id,id,collection.sourcePaymentId,request.amountCents,request.method,collection.cashMovementId,collection.folioMovementId]);
   await c.query(`UPDATE ${s}.spa_payments SET notes=$2,is_advance='true' WHERE id=$1`,[collection.sourcePaymentId,request.notes]);
   await c.query(`UPDATE ${s}.spa_accounts SET total_paid=$2 WHERE id=$1`,[id,(totals.paidCents+request.amountCents)/100]);
   result={...result,paymentId:collection.sourcePaymentId};
  } else {
   if(totals.paidCents!==0) throw new FundingError("PAYMENTS_REQUIRE_REVIEW","La cuenta ya tiene pagos. Revisalos antes de trasladar la cuenta completa a una habitación.");
   if(totals.totalCents!==request.expectedCents) throw new FundingError("PREVIEW_STALE","Cambió el total de la cuenta. Revisá el importe antes de transferir.");
   await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`funding-scope:reservation:${request.reservationId}`]);
   if((await c.query("SELECT 1 FROM payment_funding.scopes WHERE kind='reservation' AND id=$1",[request.reservationId])).rowCount)
    throw new FundingError("MANAGED_DESTINATION","La reserva destino requiere una transferencia desde su propio circuito.");
   const target=(await c.query(`SELECT r.id,r.status,rm.room_number FROM ${s}.reservations r JOIN ${s}.rooms rm ON rm.id=r.room_id WHERE r.id=$1 FOR UPDATE OF r`,[request.reservationId])).rows[0];
   if(target?.status!=="checked_in") throw new FundingError("ROOM_NOT_AVAILABLE","La habitación debe tener una estadía con check-in vigente.");
   if((await c.query(`SELECT id FROM ${s}.sales_invoices WHERE reserva_id=$1 AND estado='autorizacion_pendiente' LIMIT 1`,[target.id])).rowCount)
    throw new FundingError("FISCAL_OPERATION_PENDING","La reserva destino tiene una factura pendiente. Completala antes de transferir.");
   await invalidateDrafts(service,c,id,commandId,actor);
   try { await adapter.onFirstSpaClose!(c,id,actor); }
   catch(error:any) {
    if([400,409,422].includes(error.statusCode)) throw new FundingError("STOCK_REVIEW_REQUIRED",error.message,409);
    throw error;
   }
   const targetFolios=(await c.query(`SELECT * FROM ${s}.folios WHERE entity_type='reservation' AND entity_id=$1 FOR UPDATE`,[target.id])).rows;
   if(targetFolios.length!==1||targetFolios[0].status!=="open") throw new FundingError("FOLIO_LINK_AMBIGUOUS","La reserva debe tener un folio abierto y único. Abrilo en Recepción antes de transferir.");
   const chargeId=stableId(`spa-room:${id}:${commandId}`),label=`SPA · ${a.guest_name}`;
   await c.query(`INSERT INTO ${s}.charges(id,reservation_id,description,amount,date,category,created_by,status)
    VALUES($1,$2,$3,$4,(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,'spa',$5,'active')`,[chargeId,target.id,label,totals.totalCents/100,actor.id]);
   for(const [fid,type,description] of [[folio.id,"transfer_out",`Transferencia SPA → Hab.${target.room_number}`],[targetFolios[0].id,"transfer_in",label]])
    await c.query(`INSERT INTO ${s}.folio_movements(id,folio_id,type,amount,description,source_type,source_id,related_folio_id,registered_by)
     VALUES($1,$2,$3,$4,$5,'spa_room_transfer',$6,$7,$8)`,[stableId(`${commandId}:${type}`),fid,type,totals.totalCents/100,description,chargeId,fid===folio.id?targetFolios[0].id:folio.id,actor.id]);
   await c.query(`UPDATE ${s}.folios SET total_charges=total_charges+$2,balance=balance+$2 WHERE id=$1`,[targetFolios[0].id,totals.totalCents/100]);
   await c.query(`UPDATE ${s}.folios SET status='closed',total_payments=total_charges,balance=0,closed_at=now(),closed_by=$2 WHERE id=$1`,[folio.id,actor.id]);
   await c.query(`UPDATE ${s}.spa_accounts SET status='closed',charged_to='room',reservation_id=$2,closed_at=now(),closed_by=$3 WHERE id=$1`,[id,target.id,actor.id]);
   result={...result,reservationId:target.id,roomNumber:target.room_number,chargeId,amountCents:totals.totalCents};
  }
  await service.store.event(c,null,key,"spa_account_command",{scopeKey:`spa:${id}`,fingerprint,request,result},actor.id);
  return result;
 });
}

export async function spaChargeRows(c:PoolClient,id:string,s:string) {
 return (await c.query(`SELECT id,description,quantity,unit_price AS "unitPrice",subtotal,item_type AS "itemType",inventory_item_id AS "inventoryItemId" FROM ${s}.spa_account_items WHERE account_id=$1 ORDER BY id`,[id])).rows;
}
export async function spaAccountView(service:PaymentFundingService,id:string,actor:Actor,schema="public") {
 requirePermission(actor,"funding:read");const s=identifier(schema);
 return service.store.transaction({kind:"spa",id},null,async c=>{
  const a=await sourceAccount(service,c,id,s);
  const items=await spaChargeRows(c,id,s);
  const payments=(await c.query(`SELECT id,amount,method,status,notes,created_at AS "createdAt" FROM ${s}.spa_payments WHERE account_id=$1 ORDER BY created_at,id`,[id])).rows;
  const folio=(await c.query(`SELECT * FROM ${s}.folios WHERE entity_type='spa_account' AND entity_id=$1`,[id])).rows[0];
  const movements=folio?(await c.query(`SELECT id,type,amount,description,created_at AS "createdAt" FROM ${s}.folio_movements WHERE folio_id=$1 ORDER BY created_at,id`,[folio.id])).rows:[];
  const events=(await c.query("SELECT kind,payload,created_at AS \"createdAt\" FROM payment_funding.events WHERE payload->>'scopeKey'=$1 ORDER BY seq",[`spa:${id}`])).rows;
  const history=events.some(e=>e.kind==="spa_rollout_history");
  const operations=(await c.query("SELECT id,status,invoice FROM payment_funding.operations WHERE scope_kind='spa' AND scope_id=$1 ORDER BY created_at",[id])).rows;
  const invoices=(await c.query(`SELECT id::text AS id,tipo_comprobante AS type,punto_venta AS point,numero AS number,estado AS status,
    round(COALESCE(monto_total,0)*100)::bigint AS cents FROM ${s}.sales_invoices
    WHERE spa_account_id=$1 OR id::text=ANY($2::text[]) ORDER BY id`,[id,[a.invoice_id,a.nc_id].filter(v=>v!==null&&v!==undefined).map(String)])).rows.map(i=>({...i,amountCents:number(i.cents)}));
  const totalCents=items.reduce((sum,i)=>sum+Math.round(Number(i.subtotal)*100),0);
  const paidCents=payments.filter(p=>p.status==="active").reduce((sum,p)=>sum+Math.round(Number(p.amount)*100),0);
  const transferred=events.find(e=>e.kind==="spa_account_command"&&e.payload.result?.action==="room-transfer")?.payload.result;
  const cancelled=events.find(e=>e.kind==="spa_room_charge_voided");
  if(transferred&&cancelled)transferred.cancelled={reason:cancelled.payload.reason,createdAt:cancelled.createdAt};
  const preferences=events.filter(e=>e.kind==="spa_prefactura_saved").at(-1)?.payload.settings??null;
  return {id,chargeVersion:hash(items),preferences,guestName:a.guest_name,status:a.status,totalCents,paidCents,balanceCents:transferred?0:Math.max(0,totalCents-paidCents),items,payments,movements,
   readOnly:history||a.status!=="open"||operations.length>0,canInvoice:!history&&!transferred&&!a.invoice_id,transferred:transferred??null,operations,
   invoices,events:events.filter(e=>["spa_account_command","spa_room_charge_voided"].includes(e.kind)).map(e=>({action:e.kind==="spa_room_charge_voided"?"room-charge-void":e.payload.request.action,reason:e.payload.reason??e.payload.request?.reason??e.payload.request?.notes??"",createdAt:e.createdAt}))};
 });
}
