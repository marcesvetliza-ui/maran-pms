import type { Express, Request, RequestHandler } from "express";
import type { Pool } from "pg";
import { FundingError, fundingRequestSchema, identifier, requirePermission } from "../contracts";
import { mountPaymentFunding } from "../integration";
import { fundingErrorResponse } from "../routes";
import { PersistentFiscalGateway, type FiscalTransport } from "./fiscalGateway";
import { createFirstSpaClose } from "./spaClosure";
import { prepareSpaDocument } from "./preparation";
import { sessionFundingActor } from "./access";
import { checkSpaHomologation } from "./homologation";
import { SqlFundingAdapter } from "../adapters";
import { enrollAllSpaAccounts, enrollSpaAccount } from "./rollout";
import { getSpaRecipient, saveSpaRecipient } from "./recipient";

/** Call immediately after the application's auth gate, BEFORE every legacy
 * financial writer. Default disabled: no DDL, no reads, no routes, no transport.
 * Operational activation remains explicit and restricted to homologation.
 */
export function mountOperationalSpaFunding(app:Express,options:{
 enabled?:boolean;pool:Pool;authenticate:RequestHandler;
 hasPermission:(role:string,key:string)=>boolean;transport:FiscalTransport;schema?:string;
 reviewedExtensions?:boolean; fullRollout?:boolean;
}) {
 if(options.enabled!==true) return null;
 const schema=options.schema??"public",s=identifier(schema);
 const actor=(req:Request)=>sessionFundingActor(req,options.hasPermission);
 app.use("/api/payment-funding",options.authenticate,async(req,res,next)=>{
   try {
     const automaticScope=req.path.match(/^\/(?:scopes\/spa|spa)\/([^/]+)(?:\/|$)/);
     if(options.fullRollout && automaticScope) {
       requirePermission(actor(req),req.method==="GET"?"funding:read":"funding:write");
       await enrollSpaAccount(service,decodeURIComponent(automaticScope[1]),schema);
     }
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
   fiscal:new PersistentFiscalGateway(options.pool,options.transport,schema),firstSpaClose:createFirstSpaClose(schema),allSpaAccounts:options.fullRollout,
 })!;
 // Reviewed additive endpoints used by the connected SPA client remain independently gated.
 // The explicit homologation activation and isolated tests opt in; a UI flag cannot.
 if(options.reviewedExtensions!==true) return service;
 app.get("/api/payment-funding/recipients/:guestId",options.authenticate,async(req,res)=>{
   try {
     requirePermission(actor(req),"funding:read");
     const g=(await options.pool.query(`SELECT id AS "guestId",'guest' AS kind,first_name AS "firstName",last_name AS "lastName",
       document_type AS "documentType",document_number AS "documentNumber",vat_condition AS "vatCondition",
       cuil_cuit AS cuit,direccion AS address,true AS editable FROM ${s}.guests WHERE id=$1`,[req.params.guestId])).rows[0];
     if(!g) throw new FundingError("NOT_FOUND","Cliente inexistente.",404);
     res.json({ok:true,data:g});
   } catch(error) {fundingErrorResponse(res,error);}
 });
 app.get("/api/payment-funding/spa/:accountId/recipient",options.authenticate,async(req,res)=>{
   try {res.json({ok:true,data:await getSpaRecipient(service,req.params.accountId,actor(req),schema)});}
   catch(error) {fundingErrorResponse(res,error);}
 });
 app.post("/api/payment-funding/spa/:accountId/recipient",options.authenticate,async(req,res)=>{
   try {res.json({ok:true,data:await saveSpaRecipient(service,req.params.accountId,req.body,actor(req),schema)});}
   catch(error) {fundingErrorResponse(res,error);}
 });
 app.get("/api/payment-funding/spa/:accountId/enrollment",options.authenticate,async(req,res)=>{
   try {
     requirePermission(actor(req),"funding:read");
     const adopted=(await options.pool.query("SELECT 1 FROM payment_funding.scopes WHERE kind='spa' AND id=$1",[req.params.accountId])).rowCount!==0;
     res.json({ok:true,data:{adopted}});
   } catch(error) {fundingErrorResponse(res,error);}
 });
 app.post("/api/payment-funding/spa/:accountId/adopt-unbilled",options.authenticate,async(req,res)=>{
   try {
     const who=actor(req);requirePermission(who,"funding:historical");requirePermission(who);
     if(!req.body || Object.keys(req.body).length)
       throw new FundingError("INVALID_REQUEST","La vinculación sólo acepta el ID de cuenta y un body vacío.",422);
     const scope={kind:"spa" as const,id:req.params.accountId};
     await service.store.transaction(scope,null,async c=>{
       // Same scope lock as the legacy fence: no payment can race the import.
       await checkSpaHomologation(c,schema);
       if((await c.query("SELECT 1 FROM payment_funding.scopes WHERE kind='spa' AND id=$1",[scope.id])).rowCount) return;
       // No history callback: any prior invoice, NC or fiscal payment reference
       // fails closed. Existing payments must identify the exact Caja/folio IDs.
       const adapter=service.adapter(scope);
       if(!(adapter instanceof SqlFundingAdapter)) throw new Error("Missing SQL SPA adapter");
       await adapter.adoptScope(c,scope);
       await service.store.event(c,null,`adopted:spa:${scope.id}`,"unbilled_spa_adopted",{scopeKey:`spa:${scope.id}`},who.id);
     });
     res.json({ok:true,data:{accountId:scope.id}});
   } catch(error) {fundingErrorResponse(res,error);}
 });
 // Server-prepared documents and authorized shifts; no browser-supplied fiscal snapshots.
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
/** Explicit runtime opt-in, after session middleware and before legacy writers.
 * The UI build flag alone never enables the financial backend.
 */
export async function mountConfiguredOperationalSpaFunding(app:Express,enabled=false,reviewedExtensions=false) {
 if(!enabled) return null;
 const [{pool},{requireAuth},{hasPermission},{configuredArcaTransport}]=await Promise.all([
   import("../../../db"),import("../../../auth"),import("../../../permissions"),import("./arcaTransport"),
 ]);
 // Fail startup rather than expose a partly installed/fallback financial flow.
 const ready=(await pool.query(`SELECT to_regclass('payment_funding.fiscal_claims') IS NOT NULL
   AND to_regclass('payment_funding.scopes') IS NOT NULL AS ready`)).rows[0].ready;
 if(!ready) throw new Error("Funding schema requires explicit reviewed installation before opt-in.");
 const client=await pool.connect();
 try {await checkSpaHomologation(client);} finally {client.release();}
 const service=mountOperationalSpaFunding(app,{enabled:true,pool,authenticate:requireAuth,hasPermission,
   transport:configuredArcaTransport(),reviewedExtensions,fullRollout:true})!;
 const enrolled=await enrollAllSpaAccounts(service);
 console.info("[SPA funding] Motor general listo.",{cuentasIncorporadas:enrolled.accounts});
 return service;
}
