import {stockUnits} from "./inventorySafety";
import {unitFactor} from "./inventoryStockEngine";
import {convertInventoryQuantity} from "./inventoryUnits";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { cascadeRecipeCostsFromInventoryItem } from "./recipeCostCascade";

type Executor = Omit<typeof db, "$client">;

export type PurchaseStockRow = {
  itemId: string;
  warehouseId: string | null;
  quantity: number;
  unitCost: number;
  unit?: string;
  vatRate: string | null;
};

export function parsePurchaseStockRows(value: unknown): PurchaseStockRow[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 500) throw Object.assign(new Error("La lista de artículos es inválida."), { statusCode: 400 });
  return value.map((row, index) => {
    const itemId = typeof row?.itemId === "string" ? row.itemId.trim() : "";
    const warehouseId = row?.warehouseId == null || row.warehouseId === "" ? null : row.warehouseId;
    const quantity = Number(row?.quantity);
    const unitCost = Number(row?.unitCost);
    const vatRate = row?.vatRate == null || row.vatRate === "" ? null : String(row.vatRate);
    if (!itemId || !warehouseId || typeof warehouseId !== "string" || !warehouseId.trim() || (row?.unit != null && typeof row.unit !== "string") ||
      !Number.isFinite(quantity) || quantity <= 0 || quantity > 9999999 ||
      !Number.isFinite(unitCost) || unitCost < 0 || unitCost > 99999999 ||
      (vatRate !== null && !["2.5", "5", "10.5", "21", "27"].includes(vatRate))) {
      throw Object.assign(new Error(`Artículo ${index + 1}: comprobá artículo, depósito, cantidad y costo.`), { statusCode: 400 });
    }
    stockUnits(quantity);
    return { itemId, warehouseId:warehouseId.trim(), quantity, unitCost, vatRate, unit: row.unit };
  });
}

/** All writes use the same executor as the invoice and its accounting entry. */
export async function enterPurchaseInvoiceStock(
  tx: Executor,
  invoiceId: number,
  supplierId: number,
  rows: PurchaseStockRow[],
  reference: string,
  actor?:string,
): Promise<void> {
  for (const id of [...new Set(rows.map(r=>r.itemId))].sort()) await tx.execute(sql`SELECT id FROM inventory_items WHERE id=${id} FOR UPDATE`);
  for (const id of [...new Set(rows.map(r=>r.warehouseId).filter((id):id is string=>!!id))].sort()) {
    const r=await tx.execute(sql`SELECT id FROM inventory_warehouses WHERE id=${id} AND is_active='true' FOR SHARE`);
    if(!r.rows.length)throw Object.assign(new Error('El depósito de compra no existe o está inactivo'),{statusCode:400});
  }
  for (const [index, row] of rows.entries()) {
    // Serialize updates to the same item, including repeated rows in this invoice.
    const itemResult = await tx.execute(sql`
      SELECT id, sku, name, unit, current_stock, cost_price FROM inventory_items
      WHERE id = ${row.itemId} AND is_active = 'true' FOR UPDATE
    `);
    if (!itemResult.rows.length) {
      throw Object.assign(new Error(`Artículo ${index + 1}: no existe o está inactivo.`), { statusCode: 400 });
    }
    const item = itemResult.rows[0] as any;
    const factor=await unitFactor(tx,row.itemId,row.unit || item.unit,item.unit);
    const stockQuantity=convertInventoryQuantity(row.quantity,factor),stockCost=row.unitCost/factor;
    if(!Number.isFinite(stockCost)||stockCost>99999999)throw Object.assign(new Error("El costo convertido está fuera de rango"),{statusCode:400});
    await tx.execute(sql`
      INSERT INTO purchase_invoice_lines
        (invoice_id, line_number, item_id, item_name, item_sku, quantity, unit_price, vat_rate, line_total, warehouse_id, input_unit, stock_quantity, stock_unit)
      VALUES (${invoiceId}, ${index + 1}, ${row.itemId}, ${item.name}, ${item.sku},
        ${row.quantity}, ${row.unitCost}, ${row.vatRate},
        ${Math.round((row.quantity * row.unitCost + Number.EPSILON) * 100) / 100}, ${row.warehouseId}, ${row.unit || item.unit}, ${stockQuantity}, ${item.unit})
    `);
    const previousGlobal = Number(item.current_stock ?? 0);
    let previousStock = previousGlobal;
    if (row.warehouseId) {
      const warehouse = await tx.execute(sql`
        SELECT id FROM inventory_warehouses WHERE id = ${row.warehouseId} AND is_active = 'true'
      `);
      if (!warehouse.rows.length) {
        throw Object.assign(new Error(`Artículo ${index + 1}: el depósito no existe o está inactivo.`), { statusCode: 400 });
      }
      const stock = await tx.execute(sql`
        SELECT current_stock FROM warehouse_stock
        WHERE warehouse_id = ${row.warehouseId} AND item_id = ${row.itemId}
      `);
      previousStock = Number((stock.rows[0] as any)?.current_stock ?? 0);
      await tx.execute(sql`
        INSERT INTO warehouse_stock (warehouse_id, item_id, current_stock, updated_at)
        VALUES (${row.warehouseId}, ${row.itemId}, ${stockQuantity}, now())
        ON CONFLICT (warehouse_id, item_id) DO UPDATE SET
          current_stock = warehouse_stock.current_stock + EXCLUDED.current_stock, updated_at = now()
      `);
    }
    // Increase the global stock by the entry itself. Summing warehouse stocks here
    // would discard stock previously entered without a warehouse.
    await tx.execute(sql`
      UPDATE inventory_items SET current_stock = COALESCE(current_stock, 0) + ${stockQuantity}
      WHERE id = ${row.itemId}
    `);
    await tx.execute(sql`
      INSERT INTO stock_movements
        (item_id, movement_type, quantity, previous_stock, new_stock, unit_cost,
         notes, source_type, source_id, created_at, warehouse_id,created_by)
      VALUES (${row.itemId}, 'entrada', ${stockQuantity}, ${previousStock},
        ${previousStock + stockQuantity}, ${stockCost || null}, ${reference},
        'purchase_invoice', ${String(invoiceId)}, now(), ${row.warehouseId},${actor || null})
    `);
    if (row.unitCost > 0 && stockCost !== Number(item.cost_price ?? 0)) {
      await tx.execute(sql`
        INSERT INTO item_price_history (item_id, price, source, notes)
        VALUES (${row.itemId}, ${stockCost}, 'entrada', ${reference})
      `);
      await tx.execute(sql`UPDATE inventory_items SET cost_price = ${stockCost} WHERE id = ${row.itemId}`);
      await cascadeRecipeCostsFromInventoryItem(tx, row.itemId, stockCost);
    }
    // Preserve an existing preferred supplier. Associate the invoice supplier
    // without replacing other supplier relationships or their preference.
    const existingPreferred = await tx.execute(sql`
      SELECT accounting_supplier_id FROM inventory_item_suppliers
      WHERE item_id = ${row.itemId} AND is_preferred = true LIMIT 1
    `);
    await tx.execute(sql`
      INSERT INTO inventory_item_suppliers (item_id, accounting_supplier_id, is_preferred)
      VALUES (${row.itemId}, ${supplierId}, ${existingPreferred.rows.length === 0})
      ON CONFLICT (item_id, accounting_supplier_id) DO NOTHING
    `);
  }
}
