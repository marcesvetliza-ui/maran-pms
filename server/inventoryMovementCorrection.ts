import { sql } from "drizzle-orm";
import { db, withDatabaseTransaction } from "./db";
const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), {statusCode});
const units = (value: unknown) => { const number = Number(value); if (!Number.isFinite(number)) throw fail("Cantidad inválida",400); return Math.round(number * 1000); };
export async function correctInventoryMovement(id: string, reason: string, actor: string, replacement?: {quantity: string; notes?: string}) {
  if (!reason?.trim()) throw fail("Indicá el motivo de la corrección",400);
  return withDatabaseTransaction(async () => {
    const initial = await db.execute(sql`SELECT item_id FROM stock_movements WHERE id=${id}`);
    if (!initial.rows[0]) throw fail("Movimiento no encontrado",404);
    const itemId = String(initial.rows[0].item_id);
    const itemResult = await db.execute(sql`SELECT * FROM inventory_items WHERE id=${itemId} FOR UPDATE`);
    const item:any = itemResult.rows[0]; if (!item) throw fail("Artículo no encontrado",404);
    const result = await db.execute(sql`SELECT * FROM stock_movements WHERE id=${id} FOR UPDATE`);
    const movement:any = result.rows[0];
    if (!(movement.source_type === "manual" && !movement.source_id || movement.source_type === "movement_correction") || movement.movement_type === "transferencia" || movement.notes === "Stock inicial") throw fail("Este movimiento debe corregirse desde su comprobante, consumo o proceso de origen");
    const previous = await db.execute(sql`SELECT id FROM stock_movements WHERE source_type='movement_reversal' AND source_id=${id}`);
    if (previous.rows.length) throw fail("El movimiento ya fue anulado o corregido");
    const delta = units(movement.new_stock) - units(movement.previous_stock);
    const current = units(item.current_stock); const reversed = current - delta;
    if (reversed < 0) throw fail("No se puede anular: el stock ya fue consumido y quedaría negativo");
    let final = reversed;
    let quantity = 0;
    if (replacement) {
      quantity = units(replacement.quantity);
      if (quantity < 0 || (movement.movement_type !== 'ajuste' && quantity === 0)) throw fail("La cantidad debe ser positiva",400);
      if (!['entrada','salida','consumo','ajuste'].includes(movement.movement_type)) throw fail("Tipo de movimiento no corregible");
      final = movement.movement_type === 'ajuste' ? quantity : reversed + (movement.movement_type === 'entrada' ? quantity : -quantity);
      if (final < 0) throw fail("La corrección dejaría stock negativo");
    }
    if (movement.warehouse_id) {
      const wh = await db.execute(sql`SELECT current_stock FROM warehouse_stock WHERE warehouse_id=${movement.warehouse_id} AND item_id=${itemId} FOR UPDATE`);
      if (!wh.rows[0]) throw fail("No se encontró el stock del depósito de origen");
      const warehouseFinal = units(wh.rows[0].current_stock) + final - current;
      if (warehouseFinal < 0) throw fail("La corrección dejaría stock negativo en el depósito");
      await db.execute(sql`UPDATE warehouse_stock SET current_stock=${(warehouseFinal/1000).toFixed(3)}, updated_at=now() WHERE warehouse_id=${movement.warehouse_id} AND item_id=${itemId}`);
    }
    await db.execute(sql`UPDATE inventory_items SET current_stock=${(final/1000).toFixed(3)} WHERE id=${itemId}`);
    await db.execute(sql`INSERT INTO stock_movements(item_id,movement_type,quantity,previous_stock,new_stock,notes,source_type,source_id,created_at,created_by,warehouse_id)
      VALUES(${itemId},'ajuste',${Math.abs(delta)/1000},${current/1000},${reversed/1000},${'Anulación: '+reason.trim()},'movement_reversal',${id},now(),${actor},${movement.warehouse_id})`);
    if (replacement) await db.execute(sql`INSERT INTO stock_movements(item_id,movement_type,quantity,previous_stock,new_stock,notes,source_type,source_id,created_at,created_by,warehouse_id)
      VALUES(${itemId},${movement.movement_type},${quantity/1000},${reversed/1000},${final/1000},${replacement.notes || 'Corrección: '+reason.trim()},'movement_correction',${id},now(),${actor},${movement.warehouse_id})`);
    await db.execute(sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp)
      VALUES(${actor},${actor},'update','inventory','stock_movement',${id},${reason.trim()},${JSON.stringify({before:movement,afterStock:final/1000,replacement:replacement||null})},now())`);
    return {newStock:(final/1000).toFixed(3)};
  });
}
