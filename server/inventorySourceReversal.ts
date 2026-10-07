import {cascadeRecipeCostsFromInventoryItem} from "./recipeCostCascade";
import {sql} from 'drizzle-orm';
import {db,withDatabaseTransaction} from './db';
import {stockUnits} from './inventorySafety';
import {stockAmount} from './inventoryStockEngine';
const fail=(message:string)=>Object.assign(new Error(message),{statusCode:409});
export async function reverseInventorySource(type:string,id:string,reason:string,actor:string){
 if(!['purchase_invoice','internal_movement','production_run','spa_account_item','restaurant_order','spa_account'].includes(type)||!id||!reason?.trim())throw fail('Indicá un origen válido y el motivo de la devolución o anulación de stock');
 return withDatabaseTransaction(async()=>{
  await db.execute(sql`INSERT INTO inventory_source_reversals(source_type,source_id,reason,actor) VALUES(${type},${id},${reason.trim()},${actor}) ON CONFLICT(source_type,source_id) DO NOTHING`);
  const guard=await db.execute(sql`SELECT * FROM inventory_source_reversals WHERE source_type=${type} AND source_id=${id} FOR UPDATE`);
  if(guard.rows[0].completed_at)return {alreadyReversed:true};
  const jobs=await db.execute(sql`SELECT id,status FROM inventory_consumption_jobs WHERE source_type=${type} AND source_id=${id} FOR UPDATE`);
  const movements=await db.execute(sql`SELECT * FROM stock_movements WHERE source_type=${type} AND source_id=${id} ORDER BY item_id,warehouse_id,id`);
  if(!movements.rows.length && !jobs.rows.length)throw fail('No hay movimientos de stock o un consumo pendiente para este origen');
  const aggregate=new Map<string,{itemId:string;warehouseId:string;delta:number}>();
  for(const movement of movements.rows){
   if(!movement.warehouse_id)throw fail('El movimiento antiguo no identifica depósito; necesita conciliación explícita antes de revertirlo');
   const key=movement.item_id+'|'+movement.warehouse_id;const delta=Math.round((Number(movement.new_stock)-Number(movement.previous_stock))*1000);
   const old=aggregate.get(key);if(old)old.delta+=delta;else aggregate.set(key,{itemId:String(movement.item_id),warehouseId:String(movement.warehouse_id),delta});
  }
  const items=new Map<string,any>(),totals=new Map<string,number>();
  for(const id of [...new Set([...aggregate.values()].map(l=>l.itemId))].sort()){const r=await db.execute(sql`SELECT * FROM inventory_items WHERE id=${id} FOR UPDATE`);if(!r.rows[0])throw fail('Artículo de origen inexistente');items.set(id,r.rows[0]);}
  for(const id of [...new Set([...aggregate.values()].map(l=>l.warehouseId))].sort()){const r=await db.execute(sql`SELECT id FROM inventory_warehouses WHERE id=${id} AND is_active='true' FOR SHARE`);if(!r.rows.length)throw fail('Depósito de origen inexistente o inactivo');}
  const changes=[];
  for(const line of aggregate.values()){
   const r=await db.execute(sql`SELECT current_stock FROM warehouse_stock WHERE item_id=${line.itemId} AND warehouse_id=${line.warehouseId} FOR UPDATE`);if(!r.rows[0])throw fail('No se encontró el saldo del depósito');
   const previous=stockUnits(r.rows[0].current_stock),next=previous-line.delta;if(next<0)throw fail('No se puede revertir: el stock del depósito ya se consumió');
   totals.set(line.itemId,(totals.get(line.itemId)||0)+line.delta);changes.push({...line,previous,next});
  }
  for(const [id,delta] of totals)if(stockUnits(items.get(id).current_stock ?? 0)-delta<0)throw fail('La reversión dejaría el stock global negativo');
  let productionCost:{itemId:string;cost:number}|null=null;
  if(type==='production_run'){
   const run=(await db.execute(sql`SELECT output_inventory_item_id,output_quantity,output_unit_cost FROM production_runs WHERE id=${id}`)).rows[0] as any;
   if(run){const item=items.get(run.output_inventory_item_id);const remaining=(stockUnits(item.current_stock)-Number(totals.get(item.id)||0))/1000;const value=Number(item.current_stock)*Number(item.cost_price||0)-Number(run.output_quantity)*Number(run.output_unit_cost);if(remaining>0&&value<-.01)throw fail('La reversión necesita revisar la valuación del stock ya consumido');productionCost={itemId:item.id,cost:remaining>0?Math.max(0,value)/remaining:0};}
  }
  for(const line of changes){
   await db.execute(sql`UPDATE warehouse_stock SET current_stock=${stockAmount(line.next)},updated_at=now() WHERE item_id=${line.itemId} AND warehouse_id=${line.warehouseId}`);
   await db.execute(sql`INSERT INTO stock_movements(item_id,movement_type,quantity,previous_stock,new_stock,source_type,source_id,notes,warehouse_id,created_at,created_by) VALUES(${line.itemId},'ajuste',${stockAmount(Math.abs(line.delta))},${stockAmount(line.previous)},${stockAmount(line.next)},'source_stock_reversal',${guard.rows[0].id},${reason.trim()},${line.warehouseId},now(),${actor})`);
  }
  for(const [id,delta] of totals)await db.execute(sql`UPDATE inventory_items SET current_stock=${stockAmount(stockUnits(items.get(id).current_stock ?? 0)-delta)} WHERE id=${id}`);
  if(productionCost){await db.execute(sql`UPDATE inventory_items SET cost_price=${productionCost.cost.toFixed(4)} WHERE id=${productionCost.itemId}`);await cascadeRecipeCostsFromInventoryItem(db,productionCost.itemId,productionCost.cost);}
  await db.execute(sql`UPDATE inventory_consumption_jobs SET status='cancelled',error=${reason.trim()} WHERE source_type=${type} AND source_id=${id}`);
  await db.execute(sql`UPDATE inventory_source_reversals SET completed_at=now() WHERE id=${guard.rows[0].id}`);
  await db.execute(sql`INSERT INTO audit_logs(user_id,action,module,entity_type,entity_id,description,details,timestamp) VALUES(${actor},'update','inventory','source_stock_reversal',${guard.rows[0].id},${reason.trim()},${JSON.stringify({type,id,changes})},now())`);
  return {alreadyReversed:false,movements:changes.length};
 });
}
