import type {Express} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {sql} from 'drizzle-orm';
import {db} from '../db';
import {ratePlans,roomTypes} from '@shared/schema';
import {eq,and} from 'drizzle-orm';
import {calendarDay} from '@shared/rate-calendar';
import {requireChannex} from './access';
const price=z.string().regex(/^\d{1,8}(\.\d{1,2})?$/).refine(v=>Number(v)>0);
const input=z.object({name:z.string().trim().min(1).max(200),roomTypeId:z.string().min(1).max(160),currency:z.literal('USD'),baseRate:price,
 rate1pax:price.nullable().optional(),rate2pax:price.nullable().optional(),rate3pax:price.nullable().optional(),rate4pax:price.nullable().optional(),
 refundable:z.enum(['true','false']).default('true'),cancellationPolicy:z.string().max(3000).nullable().optional(),
 validFrom:z.string().refine(calendarDay).nullable().optional(),validTo:z.string().refine(calendarDay).nullable().optional()
}).strict().refine(v=>!v.validFrom||!v.validTo||v.validFrom<=v.validTo,'La fecha final debe ser posterior a la inicial');
export function registerUsdRatePlans(app:Express){
 for(const edit of [false,true])app[edit?'patch':'post'](`/api/channex/usd-rate-plans${edit?'/:id':''}`,requireChannex('config'),async(req,res)=>{
  try{
   const values=input.parse(req.body);
   const result=await db.transaction(async tx=>{
    const [room]=await tx.select({id:roomTypes.id}).from(roomTypes).where(eq(roomTypes.id,values.roomTypeId));
    if(!room)throw Object.assign(Error('Categoría no encontrada'),{statusCode:404});
    const [before]=edit?await tx.select().from(ratePlans).where(eq(ratePlans.id,req.params.id)).for('update'):[];
    if(edit&&(!before||before.currency!=='USD'))throw Object.assign(Error('Esta acción solo edita planes USD de canales'),{statusCode:409});
    if(before&&before.roomTypeId!==values.roomTypeId)throw Object.assign(Error('La categoría del plan existente debe conservarse'),{statusCode:409});
    const [plan]=edit?await tx.update(ratePlans).set(values).where(and(eq(ratePlans.id,req.params.id),eq(ratePlans.currency,'USD'))).returning():await tx.insert(ratePlans).values(values).returning();
    await tx.execute(sql`INSERT INTO audit_logs(id,user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp)
      VALUES(${randomUUID()},${req.user!.id},${req.user!.username||req.user!.id},${edit?'update':'create'},'rate-plans','rate_plan',${plan.id},'Tarifa de canales cargada directamente en USD',${JSON.stringify({before:before??null,after:plan})},now())`);
    return plan;
   });res.status(edit?200:201).json(result);
  }catch(error:any){res.status(error instanceof z.ZodError?400:error.statusCode||500).json({error:error instanceof z.ZodError?'Revisá precios, categoría y fechas del plan USD':error.statusCode?error.message:'No se pudo guardar la tarifa USD'});}
 });
}
