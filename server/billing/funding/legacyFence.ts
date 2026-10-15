import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import { FundingError, identifier, type Scope } from "./contracts";

/** Resolve persisted owners, never a browser-supplied assertion of ownership. */
export async function legacyFundingScopes(c:PoolClient,req:Request,schema:string):Promise<Scope[]> {
  const s=identifier(schema),scopes:Scope[]=[];
  const account=req.path.match(/^\/spa\/accounts\/([^/]+)(?:\/|$)/);
  const reservation=req.path.match(/^\/(?:billing\/)?reservations\/([^/]+)(?:\/|$)/);
  if(account) scopes.push({kind:"spa",id:decodeURIComponent(account[1])});
  if(reservation) scopes.push({kind:"reservation",id:decodeURIComponent(reservation[1])});
  for(const [kind,id] of [
    ["spa",req.body?.spaAccountId],["reservation",req.body?.reservaId],["reservation",req.body?.reservationId],
    ...(req.path.startsWith("/spa/")?[["spa",req.body?.accountId]]:[]),
  ]) if(typeof id==="string"&&id) scopes.push({kind:kind as Scope["kind"],id});
  if(typeof req.body?.sourceId==="string") {
    if(req.body.sourceType==="spa_account") scopes.push({kind:"spa",id:req.body.sourceId});
    if(req.body.sourceType==="reservation") scopes.push({kind:"reservation",id:req.body.sourceId});
  }
  const tokens=[req.body?.paymentId,req.body?.cashMovementId,req.body?.invoiceId,req.body?.folioId,
    ...req.path.split("/").filter(Boolean).map(decodeURIComponent)]
    .filter(v=>(typeof v==="string"&&v.length>0)||typeof v==="number").map(String);
  scopes.push(...(await c.query(`SELECT scope_kind AS kind,scope_id AS id FROM payment_funding.receipts
    WHERE source_payment_id=ANY($1::text[]) OR cash_movement_id=ANY($1::text[])
    UNION SELECT scope_kind,scope_id FROM payment_funding.documents WHERE invoice_id=ANY($1::text[])
    UNION SELECT scope_kind,scope_id FROM payment_funding.operations WHERE invoice->>'invoiceId'=ANY($1::text[])
    UNION SELECT 'spa',account_id FROM ${s}.spa_account_items WHERE id=ANY($1::text[])
    UNION SELECT 'spa',account_id FROM ${s}.spa_payments WHERE id=ANY($1::text[])
    UNION SELECT 'reservation',reservation_id FROM ${s}.payments WHERE id=ANY($1::text[])
    UNION SELECT 'spa',spa_account_id FROM ${s}.sales_invoices WHERE id::text=ANY($1::text[]) AND spa_account_id IS NOT NULL
    UNION SELECT 'reservation',reserva_id FROM ${s}.sales_invoices WHERE id::text=ANY($1::text[]) AND reserva_id IS NOT NULL
    UNION SELECT CASE entity_type WHEN 'spa_account' THEN 'spa' ELSE 'reservation' END,entity_id
      FROM ${s}.folios WHERE id=ANY($1::text[]) AND entity_type IN ('spa_account','reservation')`,[tokens])).rows);
  const appointment=req.path.match(/^\/spa\/appointments\/([^/]+)(?:\/|$)/);
  const appointments=[appointment?decodeURIComponent(appointment[1]):null,
    req.path.startsWith("/spa/")?req.body?.appointmentId:null].filter(v=>typeof v==="string");
  if(appointments.length) scopes.push(...(await c.query(`SELECT 'spa' AS kind,id FROM ${s}.spa_accounts WHERE appointment_id=ANY($1::text[])`,[appointments])).rows);
  const entity=req.path.match(/^\/folios\/(spa_account|reservation)\/([^/]+)\/ensure$/);
  if(entity) scopes.push({kind:entity[1]==="spa_account"?"spa":"reservation",id:decodeURIComponent(entity[2])});
  // This bulk writer has no per-document identity. Fail closed rather than
  // allow a date-selected legacy delete to remove evidence of adopted scopes.
  if(req.method==="DELETE"&&req.path==="/billing/invoices/non-fiscal")
    throw new FundingError("MANAGED_SCOPE_USE_FUNDING","La eliminación masiva legacy no permite verificar y bloquear cada folio. No está disponible con financiación explícita habilitada.");
  return [...new Map(scopes.filter(s=>s.id).map(s=>[`${s.kind}:${s.id}`,s])).values()]
    .sort((a,b)=>`${a.kind}:${a.id}`<`${b.kind}:${b.id}`?-1:1);
}

/** Same key as FundingStore.transaction: adoption cannot race a legacy write.
 * The caller keeps this transaction open until the downstream handler responds.
 */
export async function lockLegacyFundingScopes(c:PoolClient,scopes:Scope[]) {
  for(const scope of scopes)
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`funding-scope:${scope.kind}:${scope.id}`]);
}

/** Finish/end, NOT socket close: a disconnected client can leave an awaited
 * legacy transaction running. Unlock only when that handler actually responds.
 * No timeout may release an ownership guard while its writer still runs.
 */
export function releaseAfterLegacyResponse(res:Response,release:()=>Promise<void>) {
  let released=false;
  const done=()=>{if(!released){released=true;void release();}};
  const end=res.end;
  res.end=function(this:Response,...args:any[]) {
    try {return (end as any).apply(this,args);}
    finally {done();}
  } as typeof res.end;
  res.once("finish",done);
}
