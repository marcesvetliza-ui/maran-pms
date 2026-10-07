import {reverseInventorySource} from "./inventorySourceReversal";
import type {Express} from 'express';
import {sql} from 'drizzle-orm';
import {db,withDatabaseTransaction} from './db';
import {requireAuth,requirePermission} from './auth';
import {processConsumptionJob,unitFactor} from './inventoryStockEngine';
import {storage} from './db-storage';
import {grossQuantityFor,planIngredientsWithActualQuantities} from './recipeStockDeduction';
import {convertInventoryQuantity} from './inventoryUnits';
import {cascadeRecipeCostsFromInventoryItem} from './recipeCostCascade';
import {inventoryUnitFactor,INVENTORY_UNITS} from './inventoryUnits';
export function registerInventoryStage2Routes(app:Express){
 app.post('/api/inventory/recipe-stock-preview',requireAuth,requirePermission('api:inventory:write'),async(req,res)=>{try{
  const multiplier=Number(req.body.multiplier);if(!Number.isFinite(multiplier)||multiplier<=0)throw Object.assign(new Error('Cantidad de porciones inválida'),{statusCode:400});
  const recipe=await storage.getRecipe(String(req.body.recipeId));if(!recipe)throw Object.assign(new Error('Receta no encontrada'),{statusCode:404});
  const planned=await planIngredientsWithActualQuantities(id=>storage.getRecipe(id),recipe.ingredients.map(ingredient=>({ingredient,actualGrossQuantity:grossQuantityFor(ingredient,multiplier)})));
  const totals=new Map<string,number>();for(const line of planned){if(!line.itemId)throw Object.assign(new Error('Hay un insumo sin vincular con Inventario'),{statusCode:409});const item=await storage.getInventoryItem(line.itemId);if(!item || item.isActive!=='true')throw Object.assign(new Error('Artículo inexistente o inactivo'),{statusCode:409});const factor=await unitFactor(db,item.id,line.unit || item.unit,item.unit);totals.set(item.id,(totals.get(item.id)||0)+convertInventoryQuantity(line.quantity,factor));}
  res.json([...totals].map(([itemId,quantity])=>({itemId,quantity:quantity.toFixed(3),notes:''})));
 }catch(e:any){res.status(e.statusCode||500).json({error:e.message});}});

 app.post('/api/inventory/source-stock-reversals',requireAuth,requirePermission('api:inventory:write'),async(req,res)=>{try{res.json(await reverseInventorySource(String(req.body.sourceType || ''),String(req.body.sourceId || ''),String(req.body.reason || ''),req.user!.id));}catch(e:any){res.status(e.statusCode||500).json({error:e.message});}});
 app.get('/api/inventory/items/:id/unit-conversions',requireAuth,async(req,res)=>{try{const r=await db.execute(sql`SELECT from_unit AS "fromUnit",factor::text FROM inventory_unit_conversions WHERE item_id=${req.params.id} ORDER BY from_unit`);res.json(r.rows);}catch{res.status(500).json({error:'No se pudieron consultar las equivalencias'});}});
 app.put('/api/inventory/items/:id/unit-conversions',requireAuth,requirePermission('api:inventory:write'),async(req,res)=>{try{
  const lines=req.body.conversions;if(!Array.isArray(lines)||lines.length>8||new Set(lines.map((l:any)=>l?.fromUnit)).size!==lines.length||lines.some((l:any)=>!l||!INVENTORY_UNITS.includes(l.fromUnit)||!Number.isFinite(Number(l.factor))||Number(l.factor)<=0||Number(l.factor)>9999999))return res.status(400).json({error:'Equivalencias inválidas; usá unidades distintas y factores positivos'});
  await withDatabaseTransaction(async()=>{const item=await db.execute(sql`SELECT unit FROM inventory_items WHERE id=${req.params.id} FOR UPDATE`);if(!item.rows.length)throw Object.assign(new Error('Artículo no encontrado'),{statusCode:404});
   if(lines.some((l:any)=>l.fromUnit===item.rows[0].unit&&Number(l.factor)!==1))throw Object.assign(new Error('La unidad de stock siempre equivale a 1'),{statusCode:400});
   for(const line of lines){let standard:number|undefined;try{standard=inventoryUnitFactor(line.fromUnit,String(item.rows[0].unit));}catch{}if(standard!==undefined && Math.abs(Number(line.factor)-standard)>1e-9)throw Object.assign(new Error('Las equivalencias estándar de masa, volumen y docena no se pueden modificar'),{statusCode:400});}
   const before=await db.execute(sql`SELECT from_unit,factor FROM inventory_unit_conversions WHERE item_id=${req.params.id}`);
   await db.execute(sql`DELETE FROM inventory_unit_conversions WHERE item_id=${req.params.id}`);
   for(const l of lines)await db.execute(sql`INSERT INTO inventory_unit_conversions(item_id,from_unit,factor) VALUES(${req.params.id},${l.fromUnit},${String(l.factor)})`);
   const current=await storage.getInventoryItem(req.params.id);await cascadeRecipeCostsFromInventoryItem(db,req.params.id,Number(current?.costPrice || 0));
   await db.execute(sql`INSERT INTO audit_logs(user_id,action,module,entity_type,entity_id,description,details,timestamp) VALUES(${req.user!.id},'update','inventory','unit_conversion',${req.params.id},'Equivalencias de unidades actualizadas',${JSON.stringify({before:before.rows,after:lines})},now())`);
  });res.json({ok:true});
 }catch(e:any){res.status(e.statusCode||500).json({error:e.message});}});
 app.get('/api/inventory/pending-consumptions',requireAuth,async(req,res)=>{try{const area=req.query.area;if(area && !['restaurant','spa'].includes(String(area)))return res.status(400).json({error:'Área inválida'});const filter=area==='restaurant'?sql`source_type='restaurant_order'`:area==='spa'?sql`source_type IN ('spa_account','spa_account_item')`:sql`true`;const r=await db.execute(sql`SELECT * FROM inventory_consumption_jobs WHERE status='pending' AND ${filter} ORDER BY created_at,id LIMIT 500`);res.json(r.rows);}catch{res.status(500).json({error:'No se pudieron consultar los consumos pendientes'});}});
 app.post('/api/inventory/pending-consumptions/:id/retry',requireAuth,requirePermission('api:inventory:write'),async(req,res)=>{try{
  const result=await withDatabaseTransaction(async()=>{const r=await db.execute(sql`SELECT * FROM inventory_consumption_jobs WHERE id=${req.params.id} FOR UPDATE`);if(!r.rows.length)throw Object.assign(new Error('Consumo no encontrado'),{statusCode:404});const job:any=r.rows[0];
    if(job.status==='pending' && req.body.refreshRecipe===true){
      if(job.source_type!=='restaurant_order')throw Object.assign(new Error('Esta actualización solo corresponde a recetas de Restaurant'),{statusCode:400});
      const lines=await storage.planStockFromOrder(await storage.getOrderItems(job.source_id));
      if(!lines.length)throw Object.assign(new Error('El pedido no conserva sus renglones; revisalo antes de consumir'),{statusCode:409});
      await db.execute(sql`UPDATE inventory_consumption_jobs SET lines=${JSON.stringify(lines)} WHERE id=${job.id}`);
      await db.execute(sql`INSERT INTO audit_logs(user_id,action,module,entity_type,entity_id,description,details,timestamp) VALUES(${req.user!.id},'update','inventory','pending_consumption',${job.id},'Consumo pendiente recalculado con la receta actual',${JSON.stringify({before:job.lines,after:lines})},now())`);
      job.lines=lines;
    }
    const result=await processConsumptionJob(db,job);
    await db.execute(sql`INSERT INTO audit_logs(user_id,action,module,entity_type,entity_id,description,details,timestamp) VALUES(${req.user!.id},'update','inventory','pending_consumption',${job.id},'Reintento de consumo',${JSON.stringify({status:result.status,warnings:result.warnings})},now())`);
    return result;});res.json(result);
 }catch(e:any){res.status(e.statusCode||500).json({error:e.message});}});
}
