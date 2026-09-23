import { sql } from "drizzle-orm";
import { db } from "./db";

type Executor = Pick<typeof db, "execute">;

export type PurchaseStockRow = {
  itemId: string;
  warehouseId: string | null;
  quantity: number;
  unitCost: number;
};

export function parsePurchaseStockRows(value: unknown): PurchaseStockRow[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 500) throw Object.assign(new Error("La lista de artículos es inválida."), { statusCode: 400 });
  return value.map((row, index) => {
    const itemId = typeof row?.itemId === "string" ? row.itemId.trim() : "";
    const warehouseId = row?.warehouseId == null || row.warehouseId === "" ? null : row.warehouseId;
    const quantity = Number(row?.quantity);
    const unitCost = Number(row?.unitCost);
    if (!itemId || (warehouseId !== null && typeof warehouseId !== "string") ||
      !Number.isFinite(quantity) || quantity <= 0 || quantity > 9999999 ||
      !Number.isFinite(unitCost) || unitCost < 0 || unitCost > 99999999) {
      throw Object.assign(new Error(`Artículo ${index + 1}: comprobá artículo, depósito, cantidad y costo.`), { statusCode: 400 });
    }
    return { itemId, warehouseId, quantity, unitCost };
  });
}

/** All writes use the same executor as the invoice and its accounting entry. */
export async function enterPurchaseInvoiceStock(
  tx: Executor,
  invoiceId: number,
  supplierId: number,
  rows: PurchaseStockRow[],
  reference: string,
): Promise<void> {
  for (const [index, row] of rows.entries()) {
    // Serialize updates to the same item, including repeated rows in this invoice.
    const itemResult = await tx.execute(sql`
      SELECT id, current_stock, cost_price FROM inventory_items
      WHERE id = ${row.itemId} AND is_active = 'true' FOR UPDATE
    `);
    if (!itemResult.rows.length) {
      throw Object.assign(new Error(`Artículo ${index + 1}: no existe o está inactivo.`), { statusCode: 400 });
    }
    const item = itemResult.rows[0] as any;
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
        VALUES (${row.warehouseId}, ${row.itemId}, ${row.quantity}, now())
        ON CONFLICT (warehouse_id, item_id) DO UPDATE SET
          current_stock = warehouse_stock.current_stock + EXCLUDED.current_stock, updated_at = now()
      `);
    }
    // Increase the global stock by the entry itself. Summing warehouse stocks here
    // would discard stock previously entered without a warehouse.
    await tx.execute(sql`
      UPDATE inventory_items SET current_stock = COALESCE(current_stock, 0) + ${row.quantity}
      WHERE id = ${row.itemId}
    `);
    await tx.execute(sql`
      INSERT INTO stock_movements
        (item_id, movement_type, quantity, previous_stock, new_stock, unit_cost,
         notes, source_type, source_id, created_at, warehouse_id)
      VALUES (${row.itemId}, 'entrada', ${row.quantity}, ${previousStock},
        ${previousStock + row.quantity}, ${row.unitCost || null}, ${reference},
        'purchase_invoice', ${String(invoiceId)}, now(), ${row.warehouseId})
    `);
    if (row.unitCost > 0 && row.unitCost !== Number(item.cost_price ?? 0)) {
      await tx.execute(sql`
        INSERT INTO item_price_history (item_id, price, source, notes)
        VALUES (${row.itemId}, ${row.unitCost}, 'entrada', ${reference})
      `);
      await tx.execute(sql`UPDATE inventory_items SET cost_price = ${row.unitCost} WHERE id = ${row.itemId}`);
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
