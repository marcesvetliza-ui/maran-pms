import type {Express} from 'express';
import type {Pool} from 'pg';
import {z} from 'zod';
import {requireChannex} from './access';
import {convertUsdPlans,UsdConversionError} from './usdConversion';
const input=z.object({ratePlanIds:z.array(z.string().min(1).max(160)).min(1).max(20).refine(ids=>new Set(ids).size===ids.length)}).strict();
export function registerUsdConversionRoutes(app:Express,pool:Pool){
 const root='/api/channex/connections/:id/usd';
 app.get(root,requireChannex('config'),async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  try{
   const exists=(await pool.query('SELECT id FROM channex_connections WHERE id=$1',[req.params.id])).rowCount;
   if(!exists)return res.status(404).json({error:'Conexión no encontrada'});
   const quote=(await pool.query('SELECT settlement_exchange_rate::text AS rate,exchange_rate_updated_at AS "updatedAt" FROM channex_inbound_settings WHERE connection_id=$1',[req.params.id])).rows[0]||{rate:null,updatedAt:null};
   const lastEdit=(await pool.query('SELECT actor,reason,created_at FROM channex_settlement_rate_edits WHERE connection_id=$1 ORDER BY id DESC LIMIT 1',[req.params.id])).rows[0]||null;
   res.json({quote,lastEdit});
  }catch{res.status(503).json({error:'No se pudo consultar la cotización'});}
 });
 for(const apply of [false,true])app.post(`${root}/${apply?'apply':'preview'}`,requireChannex('config'),async(req,res)=>{
  try{
   const parsed=(apply?input.extend({previewToken:z.string().regex(/^[a-f0-9]{64}$/)}):input).parse(req.body);
   const result=await convertUsdPlans(pool,req.params.id,parsed.ratePlanIds,req.user!.id,apply?(parsed as any).previewToken:undefined);
   res.json(result);
  }catch(e){
   if(e instanceof z.ZodError)return res.status(400).json({error:'Revisá los planes seleccionados y la revisión de conversión'});
   res.status(e instanceof UsdConversionError?e.status:503).json({error:e instanceof UsdConversionError?e.message:'No se pudo preparar o guardar la conversión. No se aplican cambios parciales.'});
  }
 });
}
