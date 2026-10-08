import { sql } from 'drizzle-orm';
import { db } from './db';

type Executor = Pick<typeof db, 'execute'>;
function reject(dependencies: string[]) {
  if (dependencies.length) throw Object.assign(new Error(`No se puede dar de baja: ${dependencies.join('; ')}.`), { statusCode: 409, dependencies });
}

// Call inside the writer's transaction. Item/warehouse locks also serialize stock writers.
export async function requireActiveInventoryReferences(tx: Executor, itemId?: string | null, warehouseId?: string | null) {
  if (itemId) {
    const item = (await tx.execute(sql`SELECT is_active FROM inventory_items WHERE id=${itemId} FOR SHARE`)).rows[0];
    if (!item || item.is_active !== 'true') reject(['el artículo no existe o está inactivo']);
  }
  if (warehouseId) {
    const warehouse = (await tx.execute(sql`SELECT is_active FROM inventory_warehouses WHERE id=${warehouseId} FOR SHARE`)).rows[0];
    if (!warehouse || warehouse.is_active !== 'true') reject(['el depósito no existe o está inactivo']);
  }
}

export async function protectInventoryItemDeactivation(tx: Executor, id: string) {
  const rows = await tx.execute(sql`
    SELECT 'Tiene saldo de stock' AS dependency WHERE EXISTS (SELECT 1 FROM inventory_items WHERE id=${id} AND current_stock<>0)
      OR EXISTS (SELECT 1 FROM warehouse_stock WHERE item_id=${id} AND current_stock<>0)
    UNION SELECT 'Receta: ' || COALESCE(r.name,m.name,ri.ingredient_name,r.id) FROM recipe_ingredients ri
      JOIN recipes r ON r.id=ri.recipe_id LEFT JOIN menu_items m ON m.id=r.menu_item_id WHERE ri.inventory_item_id=${id}
    UNION SELECT 'Producción: ' || COALESCE(name,id) FROM recipes WHERE output_inventory_item_id=${id}
    UNION SELECT 'Tratamiento SPA: ' || COALESCE(t.name,t.id) FROM treatment_supplies s JOIN spa_treatments t ON t.id=s.treatment_id WHERE s.inventory_item_id=${id}
    UNION SELECT 'Toma de inventario abierta' WHERE EXISTS (SELECT 1 FROM inventory_count_items ci JOIN inventory_counts c ON c.id=ci.count_id WHERE ci.item_id=${id} AND c.status='borrador' AND c.warehouse_id IS NOT NULL)
    UNION SELECT 'Consumo pendiente' WHERE EXISTS (SELECT 1 FROM inventory_consumption_jobs WHERE status='pending' AND lines @> ${JSON.stringify([{itemId:id}])}::jsonb)
    UNION SELECT 'Producción pendiente' WHERE EXISTS (SELECT 1 FROM inventory_pending_productions p JOIN recipes r ON r.id=p.payload->>'recipeId'
      WHERE p.status='pending' AND (r.output_inventory_item_id=${id} OR EXISTS (SELECT 1 FROM recipe_ingredients ri WHERE ri.recipe_id=r.id AND ri.inventory_item_id=${id})))
  `);
  reject(rows.rows.map(row => String(row.dependency)));
}

export async function protectWarehouseDeactivation(tx: Executor, id: string) {
  await tx.execute(sql`SELECT id FROM inventory_warehouses WHERE id=${id} FOR UPDATE`);
  const rows = await tx.execute(sql`
    SELECT 'Tiene saldo de stock' AS dependency WHERE EXISTS (SELECT 1 FROM warehouse_stock WHERE warehouse_id=${id} AND current_stock<>0)
    UNION SELECT 'Receta: ' || COALESCE(r.name,m.name,ri.ingredient_name,r.id) FROM recipe_ingredients ri JOIN recipes r ON r.id=ri.recipe_id
      LEFT JOIN menu_items m ON m.id=r.menu_item_id WHERE ri.warehouse_id=${id}
    UNION SELECT 'Toma de inventario abierta' WHERE EXISTS (SELECT 1 FROM inventory_counts WHERE warehouse_id=${id} AND status='borrador')
    UNION SELECT 'Producción pendiente' WHERE EXISTS (SELECT 1 FROM inventory_pending_productions WHERE status='pending'
      AND (payload->>'outputWarehouseId'=${id} OR payload->'lines' @> ${JSON.stringify([{warehouseId:id}])}::jsonb))
    UNION SELECT 'Consumo pendiente' WHERE EXISTS (SELECT 1 FROM inventory_consumption_jobs j CROSS JOIN LATERAL jsonb_array_elements(j.lines) l
      WHERE j.status='pending' AND (l->>'warehouseId'=${id} OR (NULLIF(l->>'warehouseId','') IS NULL AND COALESCE(
        (SELECT to_warehouse_id FROM stock_movements WHERE item_id=l->>'itemId' AND movement_type='transferencia' AND to_warehouse_id IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 1),
        (SELECT warehouse_id FROM stock_movements WHERE item_id=l->>'itemId' AND source_type='production_run' AND movement_type='entrada' ORDER BY created_at DESC,id DESC LIMIT 1))=${id})))
  `);
  reject(rows.rows.map(row => String(row.dependency)));
}
