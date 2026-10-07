import { sql } from "drizzle-orm";
import { db, withDatabaseTransaction } from "./db";
const error = (message: string, statusCode = 409) => Object.assign(new Error(message), {statusCode});
export function stockUnits(value: unknown): number {
  if (value === null || value === undefined || value === "" || typeof value === 'boolean') throw error("Cantidad inválida",400);
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 9999999 || Math.abs(n*1000 - Math.round(n*1000)) > 0.00001) throw error("Cantidad inválida: usá hasta tres decimales y un valor no negativo",400);
  return Math.round(n*1000);
}
const amount = (units: number) => (units/1000).toFixed(3);
async function log(entityId: string, actor: string, description: string, details: unknown) {
  await db.execute(sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp)
    VALUES(${actor},${actor},'update','inventory','stock_movement',${entityId},${description},${JSON.stringify(details)},now())`);
}
export async function safeWarehouseMovement(warehouseId: string, data: {itemId:string; movementType:string; quantity:unknown; notes?:string; unitCost?:unknown}, actor:string) {
  const qty = stockUnits(data.quantity);
  if (!['entrada','salida','consumo','ajuste'].includes(data.movementType) || (data.movementType !== 'ajuste' && qty === 0)) throw error("Tipo o cantidad inválida",400);
  const cost = data.unitCost == null || data.unitCost === '' ? null : Number(data.unitCost);
  if (cost !== null && (!Number.isFinite(cost) || cost < 0 || cost > 99999999)) throw error("Costo inválido",400);
  return withDatabaseTransaction(async()=>{
    const items=await db.execute(sql`SELECT * FROM inventory_items WHERE id=${data.itemId} FOR UPDATE`);
    const item:any=items.rows[0];if(!item)throw error("Artículo no encontrado",404);if(item.is_active !== 'true')throw error("El artículo está inactivo");
    const wh=await db.execute(sql`SELECT id FROM inventory_warehouses WHERE id=${warehouseId} AND is_active='true' FOR SHARE`);
    if(!wh.rows.length)throw error("El depósito no existe o está inactivo");
    const stocks=await db.execute(sql`SELECT current_stock FROM warehouse_stock WHERE warehouse_id=${warehouseId} AND item_id=${data.itemId} FOR UPDATE`);
    const previous=stockUnits(stocks.rows[0]?.current_stock ?? 0);
    const next=data.movementType==='ajuste'?qty:previous+(data.movementType==='entrada'?qty:-qty);
    if(next<0)throw error("Stock insuficiente en este depósito");
    // Preserve legacy stock without a warehouse; never replace the global by SUM here.
    const global=stockUnits(item.current_stock ?? 0)+next-previous;
    if(global<0)throw error("El stock global no permite esta operación; revisá la conciliación");
    await db.execute(sql`INSERT INTO warehouse_stock(warehouse_id,item_id,current_stock,updated_at) VALUES(${warehouseId},${data.itemId},${amount(next)},now()) ON CONFLICT(warehouse_id,item_id) DO UPDATE SET current_stock=EXCLUDED.current_stock,updated_at=now()`);
    await db.execute(sql`UPDATE inventory_items SET current_stock=${amount(global)} WHERE id=${data.itemId}`);
    const movement=await db.execute(sql`INSERT INTO stock_movements(item_id,movement_type,quantity,previous_stock,new_stock,unit_cost,notes,source_type,created_at,created_by,warehouse_id) VALUES(${data.itemId},${data.movementType},${amount(qty)},${amount(previous)},${amount(next)},${cost},${data.notes || null},'manual',now(),${actor},${warehouseId}) RETURNING id`);
    if(data.movementType==='entrada' && cost !== null && cost>0 && cost !== Number(item.cost_price ?? 0)){
      await db.execute(sql`INSERT INTO item_price_history(item_id,price,source,notes) VALUES(${data.itemId},${cost},'entrada',${data.notes || null})`);
      await db.execute(sql`UPDATE inventory_items SET cost_price=${cost} WHERE id=${data.itemId}`);
      await (await import("./recipeCostCascade")).cascadeRecipeCostsFromInventoryItem(db,data.itemId,cost);
    }
    await log(String(movement.rows[0].id),actor,'Movimiento de depósito',{warehouseId,itemId:data.itemId,previousStock:amount(previous),newStock:amount(next),previousGlobal:item.current_stock,newGlobal:amount(global)});
    return {success:true,newWarehouseStock:next/1000,newGlobalStock:global/1000};
  });
}
export async function safeInventoryTransfer(from:string,to:string,items:{itemId:string;quantity:unknown}[],notes:string|undefined,actor:string){
  if(!from || !to || from===to || !items.length || items.length>500)throw error("Revisá depósitos y artículos de la transferencia",400);
  if(items.some(i=>!i || typeof i.itemId !== "string" || !i.itemId.trim()))throw error("Artículo inválido",400);
  const lines=items.map(i=>({itemId:i.itemId,quantity:stockUnits(i.quantity)})).sort((a,b)=>a.itemId.localeCompare(b.itemId));
  if(lines.some(i=>!i.itemId || !i.quantity) || new Set(lines.map(i=>i.itemId)).size !== lines.length)throw error("Artículos repetidos o cantidades inválidas",400);
  return withDatabaseTransaction(async()=>{
    // Serialize every item before warehouse rows, always in the same order.
    for(const line of lines){const r=await db.execute(sql`SELECT id,is_active FROM inventory_items WHERE id=${line.itemId} FOR UPDATE`);if(!r.rows[0] || r.rows[0].is_active !== 'true')throw error("El artículo no existe o está inactivo");}
    for(const id of [from,to].sort()){const r=await db.execute(sql`SELECT id FROM inventory_warehouses WHERE id=${id} AND is_active='true' FOR SHARE`);if(!r.rows.length)throw error("El depósito no existe o está inactivo");}
    const result: {itemId:string;fromStock:number;toStock:number}[]=[];
    for(const line of lines){
      const r=await db.execute(sql`SELECT warehouse_id,current_stock FROM warehouse_stock WHERE item_id=${line.itemId} AND warehouse_id IN (${from},${to}) ORDER BY warehouse_id FOR UPDATE`);
      const previousFrom=stockUnits(r.rows.find(w=>w.warehouse_id===from)?.current_stock ?? 0),previousTo=stockUnits(r.rows.find(w=>w.warehouse_id===to)?.current_stock ?? 0);
      if(previousFrom<line.quantity)throw error(`Stock insuficiente en depósito origen. Disponible: ${previousFrom/1000}`,400);
      const nextFrom=previousFrom-line.quantity,nextTo=previousTo+line.quantity;
      for(const [id,next] of [[from,nextFrom],[to,nextTo]] as const)await db.execute(sql`INSERT INTO warehouse_stock(warehouse_id,item_id,current_stock,updated_at) VALUES(${id},${line.itemId},${amount(next)},now()) ON CONFLICT(warehouse_id,item_id) DO UPDATE SET current_stock=EXCLUDED.current_stock,updated_at=now()`);
      const m=await db.execute(sql`INSERT INTO stock_movements(item_id,movement_type,quantity,previous_stock,new_stock,notes,source_type,created_at,created_by,warehouse_id,to_warehouse_id) VALUES(${line.itemId},'transferencia',${amount(line.quantity)},${amount(previousFrom)},${amount(nextFrom)},${notes || null},'manual',now(),${actor},${from},${to}) RETURNING id`);
      await log(String(m.rows[0].id),actor,'Transferencia entre depósitos',{from,to,itemId:line.itemId,quantity:amount(line.quantity),fromStock:amount(nextFrom),toStock:amount(nextTo)});
      result.push({itemId:line.itemId,fromStock:nextFrom/1000,toStock:nextTo/1000});
    }
    return result;
  });
}
