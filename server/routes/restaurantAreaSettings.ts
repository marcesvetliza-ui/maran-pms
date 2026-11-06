import type { Express } from 'express';
import { sql } from 'drizzle-orm';
import { db, withDatabaseTransaction } from '../db';
import { requirePermission } from '../auth';
import { restaurantAreaSettingsSchema, type RestaurantAreaSettings } from '@shared/restaurantAreaSettings';
const conflict=()=>Object.assign(new Error('Los sectores cambiaron mientras editabas. Actualizá el listado antes de volver a guardar.'),{statusCode:409});
export async function saveRestaurantAreaSettings(input:RestaurantAreaSettings){
 return withDatabaseTransaction(async()=>{
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('restaurant-area-settings'))`);
  const rows=(await db.execute(sql`SELECT id,name,display_order FROM restaurant_areas WHERE is_active='true' ORDER BY id FOR UPDATE`)).rows as any[];
  if(rows.length!==input.areas.length || rows.some(row=>!input.areas.some(area=>area.id===row.id)))throw conflict();
  const alreadyApplied=input.areas.every((area,index)=>{const row=rows.find(row=>row.id===area.id);return row.name===area.name&&row.display_order===index;});
  if(!alreadyApplied){
   for(const area of input.areas){const row=rows.find(row=>row.id===area.id);if(row.name!==area.expectedName || row.display_order!==area.expectedOrder)throw conflict();}
   for(const [index,area] of input.areas.entries())await db.execute(sql`UPDATE restaurant_areas SET name=${area.name},display_order=${index} WHERE id=${area.id}`);
  }
  return {saved:true};
 });
}
export function registerRestaurantAreaSettingsRoutes(app:Express){
 app.patch('/api/restaurant/area-settings',requirePermission('api:restaurant:edit-layout'),async(req,res)=>{
  const input=restaurantAreaSettingsSchema.safeParse(req.body);
  if(!input.success)return res.status(400).json({error:'Revisá los nombres y el listado de sectores.'});
  try{res.json(await saveRestaurantAreaSettings(input.data));}catch(error:any){res.status(error?.statusCode||500).json({error:error?.statusCode?error.message:'No se pudieron guardar los sectores. Tu edición permanece abierta para reintentar.'});}
 });
}
