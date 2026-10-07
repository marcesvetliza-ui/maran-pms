import {sql} from 'drizzle-orm';
import {db,withDatabaseTransaction} from './db';
import {stockUnits} from './inventorySafety';
import {inventoryUnitFactor,convertInventoryQuantity} from './inventoryUnits';
export type ConsumptionLine={itemId:string|null;quantity:number;unit?:string;warehouseId?:string|null;name?:string};
const fail=(message:string,statusCode=409)=>Object.assign(new Error(message),{statusCode});
export const stockAmount=(n:number)=>(n/1000).toFixed(3);
export async function unitFactor(tx:any,itemId:string,from:string,to:string){
 const r=await tx.execute(sql`SELECT factor FROM inventory_unit_conversions WHERE item_id=${itemId} AND from_unit=${from}`);
 return inventoryUnitFactor(from,to,r.rows[0]?Number(r.rows[0].factor):undefined);
}
/** Caller owns transaction; locks all items in stable order before any warehouse. */
export async function consumeStockLines(tx:any,lines:ConsumptionLine[],source:{type:string;id:string;actor?:string;notes:string;strictWarehouse?:boolean}){
 const aggregate=new Map<string,{item:any;warehouseId:string;qty:number}>();
 const ids=[...new Set(lines.map(l=>l.itemId).filter((v):v is string=>!!v))].sort();
 const items=new Map<string,any>();
 for(const id of ids){const r=await tx.execute(sql`SELECT * FROM inventory_items WHERE id=${id} FOR UPDATE`);if(!r.rows[0]||r.rows[0].is_active!=='true')throw fail('Artículo inexistente o inactivo');items.set(id,r.rows[0]);}
 for(const line of lines){
  if(!line.itemId)throw fail(`Falta vincular ${line.name || 'un insumo'} con Inventario`);
  if(!Number.isFinite(line.quantity)||line.quantity<0)throw fail('Cantidad inválida');if(line.quantity===0)continue;
  const item=items.get(line.itemId);const factor=await unitFactor(tx,line.itemId,line.unit || item.unit,item.unit);
  const qty=stockUnits(convertInventoryQuantity(line.quantity,factor));
  let warehouseId=line.warehouseId;
  if(!warehouseId&&!source.strictWarehouse){const r=await tx.execute(sql`SELECT to_warehouse_id FROM stock_movements WHERE item_id=${line.itemId} AND movement_type='transferencia' AND to_warehouse_id IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 1`);warehouseId=r.rows[0]?.to_warehouse_id;}
  if(!warehouseId)throw fail(`Elegí el depósito de ${item.name}; no hay último destino de transferencia`);
  const key=line.itemId+'|'+warehouseId;const ex=aggregate.get(key);if(ex)ex.qty+=qty;else aggregate.set(key,{item,warehouseId,qty});
 }
 for(const id of [...new Set([...aggregate.values()].map(l=>l.warehouseId))].sort()){const r=await tx.execute(sql`SELECT id FROM inventory_warehouses WHERE id=${id} AND is_active='true' FOR SHARE`);if(!r.rows.length)throw fail('Depósito inexistente o inactivo');}
 // Validate the whole document before making any movement. Multiple origins still share one global balance.
 const totals=new Map<string,number>(),resolved:any[]=[];
 for(const line of [...aggregate.values()].sort((a,b)=>(a.item.id+'|'+a.warehouseId).localeCompare(b.item.id+'|'+b.warehouseId))){
  const r=await tx.execute(sql`SELECT current_stock FROM warehouse_stock WHERE item_id=${line.item.id} AND warehouse_id=${line.warehouseId} FOR UPDATE`);const prev=stockUnits(r.rows[0]?.current_stock ?? 0);
  if(prev<line.qty)throw fail(`Stock insuficiente de ${line.item.name} en depósito origen. Disponible: ${stockAmount(prev)}`);
  totals.set(line.item.id,(totals.get(line.item.id)||0)+line.qty);resolved.push({...line,prev});
 }
 for(const [id,qty] of totals)if(stockUnits(items.get(id).current_stock ?? 0)<qty)throw fail(`Stock global insuficiente de ${items.get(id).name}`);
 const deducted=[];
 for(const line of resolved){await tx.execute(sql`UPDATE warehouse_stock SET current_stock=${stockAmount(line.prev-line.qty)},updated_at=now() WHERE item_id=${line.item.id} AND warehouse_id=${line.warehouseId}`);
  await tx.execute(sql`INSERT INTO stock_movements(item_id,movement_type,quantity,previous_stock,new_stock,notes,source_type,source_id,created_at,created_by,warehouse_id) VALUES(${line.item.id},'consumo',${stockAmount(line.qty)},${stockAmount(line.prev)},${stockAmount(line.prev-line.qty)},${source.notes},${source.type},${source.id},now(),${source.actor || null},${line.warehouseId})`);
  deducted.push({itemName:line.item.name,quantity:line.qty/1000,unit:line.item.unit,unitCost:Number(line.item.cost_price || 0),warehouseId:line.warehouseId});
 }
 for(const [id,qty] of totals)await tx.execute(sql`UPDATE inventory_items SET current_stock=${stockAmount(stockUnits(items.get(id).current_stock ?? 0)-qty)} WHERE id=${id}`);
 if(source.actor && deducted.length)await tx.execute(sql`INSERT INTO audit_logs(user_id,action,module,entity_type,entity_id,description,details,timestamp) VALUES(${source.actor},'create','inventory',${source.type},${source.id},'Consumo de stock registrado',${JSON.stringify({deducted})},now())`);
 return deducted;
}
export async function processConsumptionJob(tx:any,job:any){
 if(job.status!=='pending')return {deducted:[],warnings:[],skipped:[],status:job.status};
 try{
  const deducted=await tx.transaction(async(inner:any)=>consumeStockLines(inner,job.lines,{type:job.source_type,id:job.source_id,actor:job.actor,notes:'Consumo automático — '+job.source_type}));
  await tx.execute(sql`UPDATE inventory_consumption_jobs SET status='completed',error=NULL,completed_at=now() WHERE id=${job.id}`);
  return {deducted,warnings:[],skipped:[],status:'completed'};
 }catch(e:any){
  // Only operational stock/configuration failures become pending. SQL/technical failures are not silently swallowed.
  if(!e.statusCode)throw e;
  await tx.execute(sql`UPDATE inventory_consumption_jobs SET error=${e.message} WHERE id=${job.id}`);
  return {deducted:[],warnings:[{itemName:e.message,required:0,available:0}],skipped:[],status:'pending'};
 }
}
export async function queueAutomaticConsumption(sourceType:string,sourceId:string,lines:ConsumptionLine[],actor?:string){
 return withDatabaseTransaction(async()=>{
  const legacy=await db.execute(sql`SELECT id FROM stock_movements WHERE source_type=${sourceType} AND source_id=${sourceId} LIMIT 1`);
  const prior=await db.execute(sql`SELECT id FROM inventory_consumption_jobs WHERE source_type=${sourceType} AND source_id=${sourceId}`);
  // Already consumed before this migration: preserve history and do not consume again.
  if(legacy.rows.length&&!prior.rows.length)return {deducted:[],warnings:[],skipped:[],status:'legacy_completed'};
  await db.execute(sql`INSERT INTO inventory_consumption_jobs(source_type,source_id,lines,actor) VALUES(${sourceType},${sourceId},${JSON.stringify(lines)},${actor || null}) ON CONFLICT(source_type,source_id) DO NOTHING`);
  const r=await db.execute(sql`SELECT * FROM inventory_consumption_jobs WHERE source_type=${sourceType} AND source_id=${sourceId} FOR UPDATE`);
  return processConsumptionJob(db,r.rows[0]);
 });
}
