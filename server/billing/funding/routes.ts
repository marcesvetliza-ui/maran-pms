import type { Express, Request, RequestHandler, Response } from "express";
import { z, ZodError } from "zod";
import { FundingError, scopeSchema, type Actor } from "./contracts";
import { PaymentFundingService } from "./service";
import { PaymentCorrectionService } from "./corrections";

const confirmation=z.object({operationId:z.string().uuid(),previewHash:z.string().regex(/^[a-f0-9]{64}$/),request:z.unknown()}).strict();
const operationId=z.string().uuid();
export function registerPaymentFundingRoutes(app:Express,funding:PaymentFundingService,policy:{
  authenticate:RequestHandler; actor:(req:Request)=>Actor;
}) {
  const corrections=new PaymentCorrectionService(funding);
  function wrap(run:(req:Request,actor:Actor)=>Promise<any>):RequestHandler {
    return async(req,res)=>{
      try {
        const data=await run(req,policy.actor(req));
        const pending=data?.status && ["authorizing","fiscal_unknown","authorized_pending_link"].includes(data.status);
        res.status(pending?202:200).json({ok:true,data});
      } catch(error:any) { fundingErrorResponse(res,error,req.params.id); }
    };
  }
  const prefix="/api/payment-funding";
  app.get(`${prefix}/scopes/:kind/:scopeId`,policy.authenticate,wrap((req,a)=>funding.scope(scopeSchema.parse({kind:req.params.kind,id:req.params.scopeId}),a)));
  app.post(`${prefix}/previews`,policy.authenticate,wrap((req,a)=>funding.preview(req.body,a)));
  app.post(`${prefix}/operations`,policy.authenticate,wrap((req,a)=>{
    const b=confirmation.parse(req.body); return funding.reserve(b.operationId,b.previewHash,b.request,a);
  }));
  app.get(`${prefix}/operations/:id`,policy.authenticate,wrap((req,a)=>funding.get(operationId.parse(req.params.id),a)));
  for (const action of ["authorize","finalize","resume","abort"] as const) {
    app.post(`${prefix}/operations/:id/${action}`,policy.authenticate,wrap((req,a)=>funding[action](operationId.parse(req.params.id),a)));
  }
  app.post(`${prefix}/corrections/preview`,policy.authenticate,wrap((req,a)=>corrections.preview(req.body,a)));
  app.post(`${prefix}/corrections`,policy.authenticate,wrap((req,a)=>{
    const b=confirmation.parse(req.body);return corrections.confirm(b.operationId,b.previewHash,b.request,a);
  }));
}
export function fundingErrorResponse(res:Response,error:any,operationId?:string) {
  if (error instanceof ZodError) return res.status(422).json({ok:false,error:{code:"INVALID_REQUEST",message:"Solicitud inválida.",retryable:false,details:error.issues}});
  const known=error instanceof FundingError;
  return res.status(known?error.status:500).json({ok:false,error:{
    code:known?error.code:"INTERNAL_ERROR",
    message:known?error.message:"Falló la vinculación. Consulte/recupere la misma operación; no vuelva a emitir ni cobrar.",
    retryable:known?error.retryable:false,operationId,details:known?error.details:undefined,
  }});
}
