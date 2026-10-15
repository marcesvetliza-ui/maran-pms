import type { Express, Request, RequestHandler } from "express";
import type { Pool } from "pg";
import { FundingError, fundingRequestSchema, identifier, requirePermission } from "../contracts";
import { mountPaymentFunding } from "../integration";
import { fundingErrorResponse } from "../routes";
import { PersistentFiscalGateway, type FiscalTransport } from "./fiscalGateway";
import { createFirstSpaClose } from "./spaClosure";
import { prepareSpaDocument } from "./preparation";
import { sessionFundingActor } from "./access";

/** Call immediately after the application's auth gate, BEFORE every legacy
 * financial writer. Default disabled: no DDL, no reads, no routes, no transport.
 * This is intentionally NOT called from server/routes.ts before joint review.
 */
export function mountOperationalSpaFunding(app:Express,options:{
 enabled?:boolean;pool:Pool;authenticate:RequestHandler;
 hasPermission:(role:string,key:string)=>boolean;transport:FiscalTransport;schema?:string;
 reviewedExtensions?:boolean;
}) {
 if(options.enabled!==true) return null;
 const schema=options.schema??"public",s=identifier(schema);
 const actor=(req:Request)=>sessionFundingActor(req,options.hasPermission);
 app.use("/api/payment-funding",options.authenticate,async(req,res,next)=>{
   try {
     if(req.method!=="POST" || !["/previews","/operations"].includes(req.path)) return next();
     const who=actor(req);requirePermission(who);
     const request=fundingRequestSchema.parse(req.path==="/previews"?req.body:req.body?.request);
     if(req.path==="/operations" && typeof req.body?.operationId==="string") {
       // Existing UUID still goes through the engine's fingerprint check;
       // a closed shift must not break replay of an already persisted plan.
       if((await options.pool.query("SELECT id FROM payment_funding.operations WHERE id::text=$1",[req.body.operationId])).rowCount)
         return next();
     }
     if(request.scope.kind==="spa") {
       for(const row of request.newCollections) {
         if(!(await options.pool.query(`SELECT id FROM ${s}.cash_shifts
           WHERE id=$1 AND area='spa' AND status='open' AND opened_by=$2`,[row.shiftId,who.id])).rowCount)
           throw new FundingError("SHIFT_CLOSED","El turno no está abierto y autorizado para este cajero.");
       }
     }
     next();
   } catch(error) {fundingErrorResponse(res,error);}
 });
 const service=mountPaymentFunding(app,{
   enabled:true,pool:options.pool,authenticate:options.authenticate,actor,operationalSchema:schema,
   fiscal:new PersistentFiscalGateway(options.pool,options.transport,schema),firstSpaClose:createFirstSpaClose(schema),
 })!;
 // Proposed additive endpoints are independently gated until Codex agrees.
 // Tests opt in explicitly; neither this gate nor the main mount is a UI flag.
 if(options.reviewedExtensions!==true) return service;
 // Proposed additive endpoints; not consumed by Codex's client yet.
 app.get("/api/payment-funding/spa/:accountId/collection-shifts",options.authenticate,async(req,res)=>{
   try {
     const who=actor(req);requirePermission(who,"funding:read");
     const data=await service.store.transaction({kind:"spa",id:req.params.accountId},null,async c=>{
       await service.store.assertAdopted(c,{kind:"spa",id:req.params.accountId});
       // Only the current cashier's genuinely open SPA shifts can receive money.
       const rows=(await c.query(`SELECT id,opened_at FROM ${s}.cash_shifts
         WHERE area='spa' AND status='open' AND opened_by=$1 ORDER BY opened_at,id`,[who.id])).rows;
       return rows.map(r=>({id:r.id,label:`Caja SPA — ${r.id}`}));
     });
     res.json({ok:true,data});
   } catch(error) {fundingErrorResponse(res,error);}
 });
 app.post("/api/payment-funding/spa/:accountId/prepare-document",options.authenticate,async(req,res)=>{
   try {
     if(!req.body || Object.keys(req.body).length) throw new FundingError("INVALID_REQUEST","Esta preparación sólo acepta el ID de cuenta y un body vacío.",422);
     res.json({ok:true,data:await prepareSpaDocument(service,req.params.accountId,actor(req),schema)});
   } catch(error) {fundingErrorResponse(res,error);}
 });
 return service;
}

/** The real server calls this with its default false, after session middleware
 * and before legacy writers. Changing it requires a later explicit review;
 * no environment variable or VITE flag can turn it on accidentally.
 */
export async function mountConfiguredOperationalSpaFunding(app:Express,enabled=false) {
 if(!enabled) return null;
 const [{pool},{requireAuth},{hasPermission},{configuredArcaTransport}]=await Promise.all([
   import("../../../db"),import("../../../auth"),import("../../../permissions"),import("./arcaTransport"),
 ]);
 // Fail startup rather than expose a partly installed/fallback financial flow.
 const ready=(await pool.query(`SELECT to_regclass('payment_funding.fiscal_claims') IS NOT NULL
   AND to_regclass('payment_funding.scopes') IS NOT NULL AS ready`)).rows[0].ready;
 if(!ready) throw new Error("Funding schema requires explicit reviewed installation before opt-in.");
 return mountOperationalSpaFunding(app,{enabled:true,pool,authenticate:requireAuth,hasPermission,
   transport:configuredArcaTransport()});
}
