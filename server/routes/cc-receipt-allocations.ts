import type { Express } from 'express';
import { requireAuth, requirePermission } from '../auth';
import { pool } from '../db';
import { assertFinancialSchemaReady } from '../migrate';
import { CC_REALLOCATE_PERMISSION, ccReallocationInput } from '@shared/ccReceiptAllocations';
import { getCcAllocationPreview, correctCcAllocations } from '../billing/ccReceiptAllocations';
export function registerCcReceiptAllocationRoutes(app:Express){
 const guards=[requireAuth,requirePermission(CC_REALLOCATE_PERMISSION)];
 const error=(res:any,e:any)=>res.status(e.code==='55P03'?409:e.statusCode||500).json({error:e.code==='55P03'?'El recibo está siendo actualizado. Volvé a intentar.':e.statusCode?e.message:'No se pudo procesar la corrección de facturas aplicadas'});
 app.get('/api/account-movements/:id/allocation-correction',...guards,async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  try{assertFinancialSchemaReady();res.json(await getCcAllocationPreview(pool,req.params.id));}catch(e){error(res,e);}
 });
 app.post('/api/account-movements/:id/allocation-correction',...guards,async(req,res)=>{
  const data=ccReallocationInput.safeParse(req.body);
  if(!data.success)return res.status(400).json({error:'Revisá el motivo y los importes de la corrección'});
  try{assertFinancialSchemaReady();res.json(await correctCcAllocations(pool,req.params.id,data.data,{id:req.user?.id,name:req.user?.username||req.user?.fullName||req.user?.id||'Sistema',ip:req.ip}));}catch(e){error(res,e);}
 });
}
