import type { Express, Request, RequestHandler } from "express";
import type { Pool, PoolClient } from "pg";
import { FundingError, identifier, type Actor, type FiscalGateway } from "./contracts";
import { SqlFundingAdapter, type FirstSpaClose } from "./adapters";
import { PaymentFundingService } from "./service";
import { FundingStore } from "./store";
import { registerPaymentFundingRoutes, fundingErrorResponse } from "./routes";

/** Mount BEFORE legacy billing/SPA/payment routes. No default enable, DDL or
 * implicit production connection. Caller provides trusted auth, fiscal gateway
 * and transaction-bound inventory closure. This module is NOT mounted in main.
 */
export function mountPaymentFunding(app:Express,options:{
  enabled:boolean; pool:Pool; fiscal: FiscalGateway; firstSpaClose:FirstSpaClose;
  authenticate:RequestHandler; actor:(request:Request)=>Actor; operationalSchema?:string;
}) {
  if (!options.enabled) return null;
  const schema=options.operationalSchema??"public",s=identifier(schema);
  const service=new PaymentFundingService(new FundingStore(options.pool),{
    reservation:new SqlFundingAdapter("reservation",schema),
    spa:new SqlFundingAdapter("spa",schema,options.firstSpaClose),
  },options.fiscal);
  const fence:RequestHandler=async(req,res,next)=>{
    if (["GET","HEAD","OPTIONS"].includes(req.method) || req.path.startsWith("/payment-funding/")) return next();
    try {
      const scopes:Array<{kind:string;id:string}>=[];
      const spa=req.path.match(/^\/spa\/accounts\/([^/]+)/);
      const reservation=req.path.match(/^\/reservations\/([^/]+)/);
      if(spa) scopes.push({kind:"spa",id:decodeURIComponent(spa[1])});
      if(reservation) scopes.push({kind:"reservation",id:decodeURIComponent(reservation[1])});
      for(const [kind,id] of [["spa",req.body?.spaAccountId],["reservation",req.body?.reservaId??req.body?.reservationId]]) {
        if(typeof id==="string" && id) scopes.push({kind:kind as string,id});
      }
      // Payment, invoice and cash mutation routes also carry explicit identities.
      const tokens=[req.body?.paymentId,req.body?.cashMovementId,...req.path.split("/").filter(Boolean)].filter(v=>typeof v==="string");
      const linked=(await options.pool.query(`SELECT scope_kind AS kind,scope_id AS id FROM payment_funding.receipts
        WHERE source_payment_id=ANY($1::text[]) OR cash_movement_id=ANY($1::text[])
        UNION SELECT scope_kind,scope_id FROM payment_funding.documents WHERE invoice_id=ANY($1::text[])
        UNION SELECT scope_kind,scope_id FROM payment_funding.operations WHERE invoice->>'invoiceId'=ANY($1::text[])`,[tokens])).rows;
      scopes.push(...linked);
      if(req.path.startsWith("/spa/appointments/")) {
        const id=req.path.split("/")[3];
        if(id) scopes.push(...(await options.pool.query(`SELECT 'spa' AS kind,id FROM ${s}.spa_accounts WHERE appointment_id=$1`,[id])).rows);
      }
      let managed:any=null;
      for(const scope of scopes) {
        managed=(await options.pool.query("SELECT * FROM payment_funding.scopes WHERE kind=$1 AND id=$2",[scope.kind,scope.id])).rows[0];
        if(managed) break;
      }
      if(!managed) return next();
      // Existing SPA UI may link a known CAE, but it must use the same finalizer.
      if(spa && req.method==="POST" && /^\/spa\/accounts\/[^/]+\/link-invoice$/.test(req.path)) {
        return options.authenticate(req,res,async()=>{
          try {
            const o=(await options.pool.query(`SELECT id FROM payment_funding.operations WHERE scope_kind='spa' AND scope_id=$1
              AND invoice->>'invoiceId'=$2 AND kind='invoice'`,[managed.id,String(req.body?.invoiceId??"")])).rows[0];
            if(!o) throw new FundingError("MANAGED_SCOPE_USE_FUNDING","La factura debe pertenecer a la operación reclamada.");
            const data=await service.finalize(o.id,options.actor(req));res.json({ok:true,data});
          } catch(error) {fundingErrorResponse(res,error);}
        });
      }
      throw new FundingError("MANAGED_SCOPE_USE_FUNDING","Este folio usa financiación explícita. Utilice su operación; la vía legacy está bloqueada.");
    } catch(error) {fundingErrorResponse(res,error);}
  };
  app.use("/api",(req,res,next)=>{
    if(["GET","HEAD","OPTIONS"].includes(req.method) || req.path.startsWith("/payment-funding/")) return next();
    // Authenticate before querying ownership; login and nonfinancial routes remain untouched.
    if(!/^\/(billing|spa|payments|reservations|admin\/cash|cash)(\/|$)/.test(req.path)) return next();
    return options.authenticate(req,res,()=>{void fence(req,res,next);});
  });
  registerPaymentFundingRoutes(app,service,options);
  return service;
}

/** Bridge for inventory/storage code: caller must bind ALL statements to this
 * supplied PoolClient, never open a second transaction from a global pool.
 */
export type TransactionBoundInventoryClosure=(client:PoolClient,accountId:string,actor:Actor)=>Promise<void>;
