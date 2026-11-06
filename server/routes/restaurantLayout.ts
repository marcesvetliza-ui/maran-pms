import type { Express } from 'express';
import { sql } from 'drizzle-orm';
import { db,withDatabaseTransaction } from '../db';
import { requirePermission } from '../auth';
import { restaurantLayoutSchema,type RestaurantLayoutRequest } from '@shared/restaurant-layout';
const conflict=(message:string)=>Object.assign(new Error(message),{statusCode:409});
export async function saveRestaurantLayout(input:RestaurantLayoutRequest){
 return withDatabaseTransaction(async()=>{
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('restaurant-layout'))`);
  const ids=input.tables.map(t=>sql`${t.id}`);
  const rows=(await db.execute(sql`SELECT id,area_id,position_x,position_y,is_active FROM restaurant_tables WHERE id IN (${sql.join(ids,sql`,`)}) ORDER BY id FOR UPDATE`)).rows as any[];
  if(rows.length!==input.tables.length||rows.some(row=>row.is_active!=='true'))throw conflict('Una mesa ya no está disponible. Actualizá el plano antes de guardar.');
  const alreadyApplied=input.tables.every(p=>{const current=rows.find(row=>row.id===p.id);return current.area_id===p.areaId&&current.position_x===p.positionX&&current.position_y===p.positionY;});
  for(const patch of input.tables){
   const current=rows.find(row=>row.id===patch.id);
   if(current.area_id!==patch.areaId||(!alreadyApplied&&(current.position_x!==patch.expectedPositionX||current.position_y!==patch.expectedPositionY)))throw conflict('Otra persona cambió el layout. Actualizá el plano antes de volver a guardar; tus movimientos no se sobrescribieron.');
  }
  const areaIds=[...new Set(input.tables.map(p=>p.areaId))].sort().map(id=>sql`${id}`);
  const areas=(await db.execute(sql`SELECT id,area_type FROM restaurant_areas WHERE id IN (${sql.join(areaIds,sql`,`)}) AND is_active='true' AND has_tables='true'`)).rows as any[];
  if(areas.length!==areaIds.length)throw conflict('El sector cambió o ya no admite mesas. Actualizá el plano.');
  const occupied=(await db.execute(sql`SELECT id,area_id,position_x,position_y FROM restaurant_tables WHERE area_id IN (${sql.join(areaIds,sql`,`)}) AND is_active='true' ORDER BY id FOR UPDATE`)).rows as any[];
  for(const patch of input.tables){
   const area=areas.find(a=>a.id===patch.areaId);
   if(patch.positionX>=(area.area_type==='event'?5:8)||patch.positionY>=(area.area_type==='event'?3:6))throw conflict('La posición está fuera del plano del sector.');
   const collision=occupied.some(row=>{const moved=input.tables.find(p=>p.id===row.id);return row.id!==patch.id&&row.area_id===patch.areaId&&(moved?.positionX??row.position_x)===patch.positionX&&(moved?.positionY??row.position_y)===patch.positionY;});
   if(collision)throw conflict('Otra mesa ocupa esa posición. Revisá el plano antes de guardar.');
  }
  if(!alreadyApplied)for(const patch of input.tables)await db.execute(sql`UPDATE restaurant_tables SET position_x=${patch.positionX},position_y=${patch.positionY} WHERE id=${patch.id}`);
  return {saved:true,updated:alreadyApplied?0:input.tables.length};
 });
}
export function registerRestaurantLayoutRoutes(app:Express){
 app.patch('/api/restaurant/layout',requirePermission('api:restaurant:edit-layout'),async(req,res)=>{
  const parsed=restaurantLayoutSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Revisá las mesas y las posiciones del layout.'});
  try{res.json(await saveRestaurantLayout(parsed.data));}catch(error:any){res.status(error?.statusCode||500).json({error:error?.statusCode?error.message:'No se pudo guardar el layout. Conservamos tu edición para que puedas reintentar.'});}
 });
}
