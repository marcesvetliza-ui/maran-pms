import { cancelTransferredSpaCharge } from "./operational/roomChargeCancellation";
import type { Express, Request, RequestHandler } from "express";
import type { Pool, PoolClient } from "pg";
import { FundingError, type Actor, type FiscalGateway } from "./contracts";
import { SqlFundingAdapter, type FirstSpaClose } from "./adapters";
import { PaymentFundingService } from "./service";
import { FundingStore } from "./store";
import { registerPaymentFundingRoutes, fundingErrorResponse } from "./routes";
import { legacyFundingScopes, lockLegacyFundingScopes, releaseAfterLegacyResponse } from "./legacyFence";

/** Mount BEFORE legacy billing/SPA/payment routes. No default enable, DDL or
 * implicit production connection. Caller provides trusted auth, fiscal gateway
 * and transaction-bound inventory closure; runtime activation is homologation-only.
 */
export function mountPaymentFunding(app:Express,options:{
  enabled:boolean; pool:Pool; fiscal: FiscalGateway; firstSpaClose:FirstSpaClose;
  authenticate:RequestHandler; actor:(request:Request)=>Actor; operationalSchema?:string; allSpaAccounts?:boolean;
}) {
  if (!options.enabled) return null;
  const schema=options.operationalSchema??"public";
  const service=new PaymentFundingService(new FundingStore(options.pool),{
    reservation:new SqlFundingAdapter("reservation",schema),
    spa:new SqlFundingAdapter("spa",schema,options.firstSpaClose),
  },options.fiscal);
  const fence:RequestHandler=async(req,res,next)=>{
    if (["GET","HEAD","OPTIONS"].includes(req.method) || req.path.startsWith("/payment-funding/")) return next();
    const c=await options.pool.connect();
    let released=false;
    const release=async()=>{
      if(released) return;
      released=true;
      try {await c.query("ROLLBACK");c.release();}
      catch(error) {c.release(error as Error);}
    };
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL lock_timeout='3s'");
      const scopes=await legacyFundingScopes(c,req,schema);
      await lockLegacyFundingScopes(c,scopes);
      let managed:any=null;
      for(const scope of scopes) {
        if(options.allSpaAccounts && scope.kind==="spa") { managed=scope; break; }
        managed=(await c.query("SELECT * FROM payment_funding.scopes WHERE kind=$1 AND id=$2",[scope.kind,scope.id])).rows[0];
        if(managed) break;
      }
      if(!managed) {
        // Charges are inspected to protect transferred SPA provenance. Ordinary
        // Reception charges keep their existing connection lifecycle; retaining
        // an extra loan across their legacy handler can exhaust a small pool.
        if(scopes.length && !req.path.startsWith("/charges")) releaseAfterLegacyResponse(res,release);
        else await release();
        return next();
      }
      await release();
      const cancel=req.path.match(/^\/charges\/([^/]+)\/anular$/);
      if(managed.kind==="spa" && req.method==="PATCH" && cancel) {
        if(!["admin","manager","reception"].includes(req.user?.role??""))
          throw new FundingError("FORBIDDEN","No tenés permiso para anular cargos de habitación.",403);
        const data=await cancelTransferredSpaCharge(service,decodeURIComponent(cancel[1]),req.body?.motivoAnulacion,options.actor(req),schema);
        return res.json(data);
      }
      // Existing SPA UI may link a known CAE, but it must use the same finalizer.
      const link=req.path.match(/^\/spa\/accounts\/([^/]+)\/link-invoice$/);
      if(managed.kind==="spa" && req.method==="POST" && link && decodeURIComponent(link[1])===managed.id) {
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
    } catch(error:any) {
      await release();
      if(["55P03","40P01","40001"].includes(error.code))
        error=new FundingError("CONCURRENT_CHANGE","Hay otra operación financiera en curso. Reintente la misma operación.",409,true);
      fundingErrorResponse(res,error);
    }
  };
  app.use("/api",(req,res,next)=>{
    if(["GET","HEAD","OPTIONS"].includes(req.method) || req.path.startsWith("/payment-funding/")) return next();
    // Authenticate before querying ownership; login and nonfinancial routes remain untouched.
    if(!/^\/(billing|spa|payments|reservations|charges|folios|admin\/spa|admin\/cash|cash)(\/|$)/.test(req.path)) return next();
    return options.authenticate(req,res,()=>{Promise.resolve(fence(req,res,next)).catch(error=>fundingErrorResponse(res,error));});
  });
  registerPaymentFundingRoutes(app,service,options);
  return service;
}

/** Bridge for inventory/storage code: caller must bind ALL statements to this
 * supplied PoolClient, never open a second transaction from a global pool.
 */
export type TransactionBoundInventoryClosure=(client:PoolClient,accountId:string,actor:Actor)=>Promise<void>;
