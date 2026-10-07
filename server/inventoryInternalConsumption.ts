import { sql } from "drizzle-orm";
import { db, withDatabaseTransaction } from "./db";
import { stockUnits } from "./inventorySafety";
const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const amount = (n: number) => (n / 1000).toFixed(3);
export async function internalConsumptionOrigins() {
  const r = await db.execute(sql`SELECT i.id AS "itemId", t.to_warehouse_id AS "warehouseId", h.name AS "warehouseName", h.is_active AS active,
    COALESCE(w.current_stock,0)::text AS stock FROM inventory_items i
    LEFT JOIN LATERAL (SELECT to_warehouse_id FROM stock_movements WHERE item_id=i.id AND movement_type='transferencia' AND to_warehouse_id IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 1) t ON true
    LEFT JOIN inventory_warehouses h ON h.id=t.to_warehouse_id
    LEFT JOIN warehouse_stock w ON w.item_id=i.id AND w.warehouse_id=t.to_warehouse_id`);
  return r.rows;
}
export async function consumeInventoryInternally(data: any, actor: string) {
  if (!data || typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) || Number.isNaN(Date.parse(data.date)) || new Date(data.date).toISOString().slice(0,10)!==data.date || !['desayuno','evento','desperdicio','otro'].includes(data.motivo)) throw fail('Fecha o motivo inválido',400);
  if (!Array.isArray(data.items) || !data.items.length || data.items.length>500) throw fail('Agregá entre 1 y 500 artículos',400);
  for (const key of ['descripcion','notes']) if (data[key]!=null && (typeof data[key]!=='string' || data[key].length>4000)) throw fail('Descripción o notas inválidas',400);
  const lines=data.items.map((i:any)=>{
    if (!i || typeof i.itemId!=='string' || !i.itemId.trim() || (i.warehouseId!=null && (typeof i.warehouseId!=='string'||!i.warehouseId.trim())) || (i.notes!=null && (typeof i.notes!=='string'||i.notes.length>4000))) throw fail('Artículo, depósito o notas inválidos',400);
    const quantity=stockUnits(i.quantity);if(!quantity) throw fail('La cantidad debe ser mayor que cero',400);
    return {...i,quantity};
  }).sort((a:any,b:any)=>a.itemId.localeCompare(b.itemId));
  if (new Set(lines.map((i:any)=>i.itemId)).size!==lines.length) throw fail('No repitas el mismo artículo; reuní su cantidad en un renglón',400);
  return withDatabaseTransaction(async()=>{
    const resolved:any[]=[];
    for (const line of lines) {
      const r=await db.execute(sql`SELECT * FROM inventory_items WHERE id=${line.itemId} FOR UPDATE`);const item:any=r.rows[0];
      if(!item || item.is_active!=='true')throw fail('El artículo no existe o está inactivo');
      const transfer=await db.execute(sql`SELECT to_warehouse_id FROM stock_movements WHERE item_id=${line.itemId} AND movement_type='transferencia' AND to_warehouse_id IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 1`);
      const latest=transfer.rows[0]?.to_warehouse_id;const warehouseId=line.warehouseId ?? latest;
      if(!warehouseId)throw fail(`Elegí un depósito para ${item.name}: no tiene transferencias previas`);
      resolved.push({...line,item,warehouseId,latest});
    }
    for(const id of [...new Set<string>(resolved.map(i=>i.warehouseId))].sort()) {
      const r=await db.execute(sql`SELECT id,name FROM inventory_warehouses WHERE id=${id} AND is_active='true' FOR SHARE`);
      if(!r.rows.length)throw fail('El depósito de origen no existe o está inactivo; elegí otro explícitamente');
      for(const line of resolved.filter(i=>i.warehouseId===id))line.warehouseName=r.rows[0].name;
    }
    const header=await db.execute(sql`INSERT INTO internal_movements(date,motivo,descripcion,notes,created_by) VALUES(${data.date},${data.motivo},${data.descripcion || null},${data.notes || null},${actor}) RETURNING *`);
    const movement:any=header.rows[0],items:any[]=[];
    for(const line of resolved) {
      const r=await db.execute(sql`SELECT current_stock FROM warehouse_stock WHERE item_id=${line.itemId} AND warehouse_id=${line.warehouseId} FOR UPDATE`);
      const previous=stockUnits(r.rows[0]?.current_stock ?? 0),global=stockUnits(line.item.current_stock ?? 0);
      if(previous<line.quantity)throw fail(`Stock insuficiente de ${line.item.name} en ${line.warehouseName}. Disponible: ${amount(previous)}. Elegí otro depósito explícitamente.`);
      if(global<line.quantity)throw fail(`Stock global insuficiente de ${line.item.name}; revisá la conciliación`);
      await db.execute(sql`UPDATE warehouse_stock SET current_stock=${amount(previous-line.quantity)},updated_at=now() WHERE item_id=${line.itemId} AND warehouse_id=${line.warehouseId}`);
      await db.execute(sql`UPDATE inventory_items SET current_stock=${amount(global-line.quantity)} WHERE id=${line.itemId}`);
      await db.execute(sql`INSERT INTO stock_movements(item_id,movement_type,quantity,previous_stock,new_stock,unit_cost,notes,source_type,source_id,created_at,created_by,warehouse_id) VALUES(${line.itemId},'consumo',${amount(line.quantity)},${amount(previous)},${amount(previous-line.quantity)},${line.item.cost_price ?? '0'},${line.notes || data.descripcion || data.motivo},'internal_movement',${movement.id},now(),${actor},${line.warehouseId})`);
      const row=await db.execute(sql`INSERT INTO internal_movement_items(movement_id,item_id,item_name,unit,quantity,cost_price,notes) VALUES(${movement.id},${line.itemId},${line.item.name},${line.item.unit},${amount(line.quantity)},${line.item.cost_price ?? '0'},${line.notes || null}) RETURNING *`);
      items.push({...row.rows[0],warehouse_id:line.warehouseId,warehouse_name:line.warehouseName});
      await db.execute(sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp) VALUES(${actor},${actor},'create','inventory','internal_movement',${movement.id},'Consumo interno por depósito',${JSON.stringify({itemId:line.itemId,warehouseId:line.warehouseId,lastTransferWarehouseId:line.latest ?? null,explicitOverride:!!line.warehouseId && line.warehouseId!==line.latest,quantity:amount(line.quantity),previousWarehouse:amount(previous),newWarehouse:amount(previous-line.quantity),previousGlobal:amount(global),newGlobal:amount(global-line.quantity)})},now())`);
    }
    return {...movement,items};
  });
}
