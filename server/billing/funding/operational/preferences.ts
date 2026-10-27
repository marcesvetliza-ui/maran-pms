import type { PoolClient } from "pg";
import { calculateCheckoutDiscount } from "@shared/checkoutDiscount";
import { spaPrefacturaInputSchema } from "@shared/spaPrefactura";
import { FundingError,hash,identifier,requirePermission,stableId,type Actor } from "../contracts";
import type { PaymentFundingService } from "../service";
import { editable,invalidateDrafts,spaChargeRows } from "./account";
import { SqlFundingAdapter } from "../adapters";

export async function spaPreferences(c:PoolClient,id:string) {
 return (await c.query("SELECT payload->'settings' AS settings FROM payment_funding.events WHERE kind='spa_prefactura_saved' AND payload->>'scopeKey'=$1 ORDER BY seq DESC LIMIT 1",[`spa:${id}`])).rows[0]?.settings;
}
/** Caller owns the scope transaction; preparation runs on this same connection. */
export async function applySpaPreferences(service:PaymentFundingService,c:PoolClient,id:string,input:unknown,actor:Actor,schema="public") {
 requirePermission(actor);const parsed=spaPrefacturaInputSchema.parse(input),s=identifier(schema),scope={kind:"spa" as const,id};
 const key=`spa-prefactura:${id}:${parsed.requestId}`,fingerprint=hash({request:parsed,actor:actor.id});
 const prior=(await c.query("SELECT payload FROM payment_funding.events WHERE event_key=$1",[key])).rows[0]?.payload;
 if(prior) {
  if(prior.fingerprint!==fingerprint)throw new FundingError("IDEMPOTENCY_CONFLICT","Esta revisión ya se usó con otros datos.");
  if(hash(await spaPreferences(c,id))!==hash(parsed.settings)||hash(await spaChargeRows(c,id,s))!==prior.chargeVersion)
   throw new FundingError("PREVIEW_STALE","La cuenta o el destinatario cambiaron después de esta revisión. Volvé a revisar la prefactura.");
  return {key,fingerprint,settings:parsed.settings,replay:true};
 }
 const account=await editable(service,c,id,s,true);
 const rows=await spaChargeRows(c,id,s);
 if(hash(rows)!==parsed.expectedVersion)throw new FundingError("PREVIEW_STALE","Los cargos cambiaron. Volvé a cargar la cuenta antes de revisar la factura.");
 const {settings}=parsed;
 if(settings.recipientKind!=="client") {
  const table=settings.recipientKind==="company"?"companies":"guests";
  if(!(await c.query(`SELECT id FROM ${s}.${table} WHERE id=$1 FOR SHARE`,[settings.recipientId])).rowCount)
   throw new FundingError("NOT_FOUND","No se encontró el destinatario elegido.",404);
 }
 const ordinary=rows.filter(r=>r.itemType!=="discount");
 let discountCents=0;
 try {if(settings.discount)discountCents=Math.round(calculateCheckoutDiscount(Object.fromEntries(ordinary.map(r=>[r.id,Number(r.subtotal)])),settings.discount).amount*100);}
 catch(e){throw new FundingError("INVALID_DISCOUNT",(e as Error).message,422);}
 const gross=ordinary.reduce((n,r)=>n+Math.round(Number(r.subtotal)*100),0);
 const previousDiscount=rows.filter(r=>r.itemType==="discount").reduce((n,r)=>n-Math.round(Number(r.subtotal)*100),0);
 if(account.status==="closed"&&discountCents!==previousDiscount)throw new FundingError("ACCOUNT_CLOSED","La cuenta ya tiene un cierre no fiscal; sus importes se conservan para facturar.");
 const paid=(await service.adapter(scope).totals(c,scope)).paidCents;
 if(gross-discountCents<paid)throw new FundingError("DISCOUNT_EXCEEDS_BALANCE","El descuento supera el saldo después de los pagos registrados.",422);
 await invalidateDrafts(service,c,id,parsed.requestId,actor);
 const adapter=service.adapter(scope) as SqlFundingAdapter,folio=await adapter.folio(c,scope);
 const discounts=rows.filter(r=>r.itemType==="discount"),label=`Descuento · ${settings.discount?.reason??""}`;
 const keepDiscount=discounts.length===1&&Math.round(-Number(discounts[0].subtotal)*100)===discountCents&&discounts[0].description===label;
 for(const row of keepDiscount?[]:discounts) {
  await c.query(`INSERT INTO ${s}.folio_movements(id,folio_id,type,amount,description,source_type,source_id,registered_by)
   VALUES($1,$2,'charge',$3,'Reversión del descuento anterior','spa_discount_revision',$4,$5)`,[stableId(`${parsed.requestId}:reverse:${row.id}`),folio.id,-Number(row.subtotal),row.id,actor.id]);
  await c.query(`DELETE FROM ${s}.spa_account_items WHERE id=$1`,[row.id]);
 }
 if(discountCents&&!keepDiscount) {
  const discountId=stableId(`spa-discount:${id}`);
  await c.query(`INSERT INTO ${s}.spa_account_items(id,account_id,description,quantity,unit_price,subtotal,item_type,created_at)
   VALUES($1,$2,$3,1,$4,$4,'discount',now())`,[discountId,id,label,-discountCents/100]);
  await c.query(`INSERT INTO ${s}.folio_movements(id,folio_id,type,amount,description,source_type,source_id,registered_by)
   VALUES($1,$2,'discount',$3,$4,'spa_discount',$5,$6)`,[stableId(`${parsed.requestId}:discount`),folio.id,discountCents/100,label,discountId,actor.id]);
 }
 await c.query(`UPDATE ${s}.spa_accounts SET subtotal=$2,total=$3 WHERE id=$1`,[id,gross/100,(gross-discountCents)/100]);
 await c.query(`UPDATE ${s}.folios SET total_charges=$2,total_payments=$3,balance=$2::numeric-$3::numeric WHERE id=$1`,[folio.id,(gross-discountCents)/100,paid/100]);
 await service.store.event(c,null,key,"spa_prefactura_saved",{scopeKey:`spa:${id}`,fingerprint,settings,discountCents,grossCents:gross,chargeVersion:hash(await spaChargeRows(c,id,s))},actor.id);
 return {key,fingerprint,settings,replay:false};
}
