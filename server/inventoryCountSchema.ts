import {sql} from 'drizzle-orm';
import {db} from './db';
export async function ensureInventoryCountWarehouseSchema() {
  await db.execute(sql`ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS warehouse_id varchar REFERENCES inventory_warehouses(id)`);
  await db.execute(sql`ALTER TABLE inventory_count_items ADD COLUMN IF NOT EXISTS snapshot_movement_count bigint`);
}
