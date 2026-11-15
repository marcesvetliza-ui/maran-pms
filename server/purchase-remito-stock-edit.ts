import { sql } from "drizzle-orm";
import { db } from "./db";
import { parsePurchaseStockRows } from "./purchase-invoice-stock";
import { stockUnits } from "./inventorySafety";
import { stockAmount, unitFactor } from "./inventoryStockEngine";
import { convertInventoryQuantity } from "./inventoryUnits";

type Executor = Pick<typeof db, "execute">;
const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const key = (itemId: string, warehouseId: string) => JSON.stringify([itemId, warehouseId]);

/** Called inside the document transaction, with the remito already locked. */
export async function editPurchaseRemitoStock(tx: Executor, invoiceId: number, input: unknown, actor?: string) {
  const rows = parsePurchaseStockRows(input);
  if (!rows.length) throw fail("El remito debe conservar al menos un artículo. Para anularlo usá la anulación.", 400);
  const original = (await tx.execute(sql`
    SELECT * FROM purchase_invoice_lines WHERE invoice_id=${invoiceId} ORDER BY line_number FOR UPDATE
  `)).rows as any[];
  if (!original.length || original.some(line => !line.warehouse_id || line.stock_quantity == null || !line.stock_unit)) {
    throw fail("Este remito no tiene un detalle de stock completo. Necesita conciliación antes de editar sus artículos.");
  }
  const baseline = new Map<string, number>();
  for (const line of original) {
    const k = key(line.item_id, line.warehouse_id);
    baseline.set(k, (baseline.get(k) || 0) + stockUnits(line.stock_quantity));
  }
  // Never infer an old receipt from names, notes or the item's current stock.
  const ledger = (await tx.execute(sql`
    SELECT item_id,warehouse_id,SUM(new_stock-previous_stock) AS quantity
    FROM stock_movements WHERE source_type='purchase_invoice' AND source_id=${String(invoiceId)}
    GROUP BY item_id,warehouse_id
  `)).rows as any[];
  const recorded = new Map(ledger.map(line => [key(line.item_id, line.warehouse_id), stockUnits(line.quantity)]));
  for (const k of new Set([...baseline.keys(), ...recorded.keys()])) {
    if ((baseline.get(k) || 0) !== (recorded.get(k) || 0)) {
      throw fail("El detalle del remito no coincide con su ingreso de stock. Revisá la conciliación antes de editarlo.");
    }
  }
  const items = new Map<string, any>();
  for (const id of [...new Set([...original.map(line => line.item_id), ...rows.map(row => row.itemId)])].sort()) {
    const item = (await tx.execute(sql`SELECT * FROM inventory_items WHERE id=${id} FOR UPDATE`)).rows[0] as any;
    if (!item) throw fail("Un artículo del remito ya no existe.");
    items.set(id, item);
  }
  for (const line of original) {
    if (line.stock_unit !== items.get(line.item_id).unit) {
      throw fail("Cambió la unidad base de un artículo. Conciliá el remito antes de modificar sus cantidades.");
    }
  }
  const warehouses = new Map<string, any>();
  for (const id of [...new Set(rows.map(row => row.warehouseId!))].sort()) {
    const warehouse = (await tx.execute(sql`SELECT id,is_active FROM inventory_warehouses WHERE id=${id} FOR SHARE`)).rows[0] as any;
    if (!warehouse) throw fail("El depósito seleccionado no existe.", 400);
    warehouses.set(id, warehouse);
  }
  const originalIds = new Set<number>();
  const next: any[] = [];
  for (const [index, row] of rows.entries()) {
    const item = items.get(row.itemId);
    const lineId = (input as any[])[index]?.originalLineId;
    const previous = lineId == null ? undefined : original.find(line => Number(line.id) === Number(lineId));
    if (lineId != null && (!previous || originalIds.has(Number(lineId)))) {
      throw fail("El detalle original cambió o pertenece a otro remito. Volvé a abrirlo.");
    }
    if (lineId != null) originalIds.add(Number(lineId));
    if (item.is_active !== "true" || item.purchase_enabled === false || item.item_kind === "plato") {
      // A discontinued line can be removed, or kept exactly as originally received.
      if (!previous || previous.item_id !== row.itemId || Number(previous.quantity) !== row.quantity ||
          previous.warehouse_id !== row.warehouseId || previous.input_unit !== (row.unit || item.unit) ||
          Number(previous.unit_price) !== row.unitCost || row.stockUnitsPerInput !== undefined) {
        throw fail("No se puede agregar o cambiar un artículo inactivo o discontinuado.", 400);
      }
    }
    const inputUnit = row.unit || item.unit;
    let factor: number;
    if (row.stockUnitsPerInput !== undefined) {
      if (inputUnit === item.unit) throw fail("La presentación ya es la unidad de stock.", 400);
      factor = row.stockUnitsPerInput;
    } else if (previous?.item_id === row.itemId && previous.input_unit === inputUnit) {
      // Retain the received conversion even if the catalogue's package size changed.
      factor = Number(previous.stock_quantity) / Number(previous.quantity);
    } else {
      factor = await unitFactor(tx, row.itemId, inputUnit, item.unit);
    }
    const stockQuantity = convertInventoryQuantity(row.quantity, factor);
    next.push({ ...row, inputUnit, stockQuantity, itemName: item.name, itemSku: item.sku,
      stockUnit: item.unit, lineTotal: Math.round((row.quantity * row.unitCost + Number.EPSILON) * 100) / 100 });
  }
  const changes = new Map<string, { itemId: string; warehouseId: string; delta: number }>();
  for (const line of original) {
    const k = key(line.item_id, line.warehouse_id);
    const existing = changes.get(k);
    changes.set(k, { itemId: line.item_id, warehouseId: line.warehouse_id,
      delta: (existing?.delta || 0) - stockUnits(line.stock_quantity) });
  }
  for (const line of next) {
    const k = key(line.itemId, line.warehouseId);
    const existing = changes.get(k);
    changes.set(k, { itemId: line.itemId, warehouseId: line.warehouseId,
      delta: (existing?.delta || 0) + stockUnits(line.stockQuantity) });
  }
  const totals = new Map<string, number>();
  const movements: Array<{ itemId: string; warehouseId: string; delta: number; previous: number; next: number }> = [];
  for (const [_, change] of [...changes].sort(([a], [b]) => a.localeCompare(b))) {
    if (!change.delta) continue;
    if (change.delta > 0 && warehouses.get(change.warehouseId)?.is_active !== "true") {
      throw fail("No se puede aumentar stock en un depósito inactivo.", 400);
    }
    const stock = (await tx.execute(sql`
      SELECT current_stock FROM warehouse_stock WHERE item_id=${change.itemId} AND warehouse_id=${change.warehouseId} FOR UPDATE
    `)).rows[0] as any;
    const previous = stockUnits(stock?.current_stock || 0);
    if (previous + change.delta < 0) throw fail(`Stock insuficiente de ${items.get(change.itemId).name} en el depósito original. No se guardó ningún cambio.`);
    stockUnits(stockAmount(previous + change.delta));
    movements.push({ ...change, previous, next: previous + change.delta });
    totals.set(change.itemId, (totals.get(change.itemId) || 0) + change.delta);
  }
  for (const [id, delta] of totals) {
    if (stockUnits(items.get(id).current_stock || 0) + delta < 0) throw fail("La corrección dejaría el stock global negativo.");
    stockUnits(stockAmount(stockUnits(items.get(id).current_stock || 0) + delta));
  }
  for (const movement of movements) {
    await tx.execute(sql`
      INSERT INTO warehouse_stock(warehouse_id,item_id,current_stock,updated_at)
      VALUES(${movement.warehouseId},${movement.itemId},${stockAmount(movement.next)},now())
      ON CONFLICT(warehouse_id,item_id) DO UPDATE SET current_stock=EXCLUDED.current_stock,updated_at=now()
    `);
    await tx.execute(sql`
      INSERT INTO stock_movements(item_id,movement_type,quantity,previous_stock,new_stock,notes,source_type,source_id,warehouse_id,created_at,created_by)
      VALUES(${movement.itemId},${movement.delta > 0 ? "entrada" : "salida"},${stockAmount(Math.abs(movement.delta))},
        ${stockAmount(movement.previous)},${stockAmount(movement.next)},${"Corrección de remito #" + invoiceId},
        'purchase_invoice',${String(invoiceId)},${movement.warehouseId},now(),${actor || null})
    `);
  }
  for (const [id, delta] of totals) {
    await tx.execute(sql`UPDATE inventory_items SET current_stock=COALESCE(current_stock,0)+${stockAmount(delta)} WHERE id=${id}`);
  }
  await tx.execute(sql`DELETE FROM purchase_invoice_lines WHERE invoice_id=${invoiceId}`);
  for (const [index, line] of next.entries()) {
    await tx.execute(sql`
      INSERT INTO purchase_invoice_lines(invoice_id,line_number,item_id,item_name,item_sku,quantity,unit_price,vat_rate,line_total,warehouse_id,input_unit,stock_quantity,stock_unit)
      VALUES(${invoiceId},${index + 1},${line.itemId},${line.itemName},${line.itemSku},${line.quantity},${line.unitCost},${line.vatRate},
        ${line.lineTotal},${line.warehouseId},${line.inputUnit},${line.stockQuantity},${line.stockUnit})
    `);
  }
  return { previous: original, next, movements };
}
