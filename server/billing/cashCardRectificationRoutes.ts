import type { Express } from 'express';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { requireAuth } from '../auth';
import { db } from '../db';
import { editLinkedReservationInvoicePayment } from './linkedReservationInvoicePaymentEdit';
const request=z.object({method:z.enum(['tarjeta_credito','tarjeta_debito']),reason:z.string().trim().min(10).max(1000),evidenceRef:z.string().trim().min(3).max(500)}).strict();
export function registerCashCardRectificationRoutes(app:Express){
 for(const mode of ['preview','apply'] as const)app.post(`/api/billing/invoices/:id/card-rectification${mode==='preview'?'/preview':''}`,requireAuth,async(req,res)=>{
   if(req.user?.role!=='admin')return res.status(403).json({error:'Sólo Administración puede rectificar un cierre de Caja.'});
   try{
     const invoiceId=z.coerce.number().int().positive().parse(req.params.id);
     const input=mode==='preview'?request.parse(req.body):request.extend({operationId:z.string().uuid(),previewHash:z.string().regex(/^[a-f0-9]{64}$/)}).parse(req.body);
     const action:any={mode,actorId:req.user.id,reason:input.reason,evidenceRef:input.evidenceRef};
     if(mode==='apply')Object.assign(action,{operationId:(input as any).operationId,previewHash:(input as any).previewHash});
     const result=await editLinkedReservationInvoicePayment(invoiceId,input.method,req.user.fullName||req.user.username||req.user.id,action);
     res.json(result);
   }catch(e:any){res.status(e instanceof z.ZodError?400:e.statusCode||500).json({error:e instanceof z.ZodError?'Revisá el motivo, la referencia y la operación de rectificación.':e.message,...(e.code?{code:e.code}:{})});}
 });
 app.get('/api/cash/shifts/:id/card-rectifications',requireAuth,async(req,res)=>{
   try{res.json((await db.execute(sql`SELECT operation_id,revision,old_method,new_method,amount,card_before,card_after,reason,evidence_ref,operator,created_at
     FROM cash_card_rectifications WHERE shift_id=${req.params.id} ORDER BY revision`)).rows);}
   catch{res.status(503).json({error:'No se pudieron consultar las rectificaciones del cierre.'});}
 });
}
