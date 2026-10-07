import {INVENTORY_AREAS} from "@shared/inventoryAreas";
import { db } from './db';
import { sql } from 'drizzle-orm';
import { insertItemCategorySchema } from '@shared/schema';
const fail = (message: string): never => { throw Object.assign(new Error(message), { statusCode: 409 }); };
export async function catalogLock() { await db.execute(sql`SELECT pg_advisory_xact_lock(173410, 3)`); }
export async function validateCategory(input: any, id?: string) {
  const old = id ? (await db.execute(sql`SELECT * FROM item_categories WHERE id=${id}`)).rows[0] as any : undefined;
  if (id && !old) throw Object.assign(new Error('Subagrupamiento inexistente'), {statusCode:404});
  const parsed = (id ? insertItemCategorySchema.partial() : insertItemCategorySchema).safeParse(input);
  if (!parsed.success) throw Object.assign(new Error('Datos de clasificación inválidos'), {statusCode:400});
  const data = parsed.data;
  const area = data.area ?? old?.area ?? 'general';
  if (!INVENTORY_AREAS.some(option=>option.key===area)) fail('Área inválida');
  if (data.name !== undefined && !data.name.trim()) fail('Indicá el nombre');
  const parent = data.parentId !== undefined ? data.parentId : old?.parent_id;
  const group = data.isGroup ?? old?.is_group ?? false;
  if (group && parent) fail('Un agrupamiento no puede depender de otro agrupamiento');
  if (parent && (parent !== old?.parent_id || area !== old?.area || !id)) {
    const row = (await db.execute(sql`SELECT * FROM item_categories WHERE id=${parent}`)).rows[0] as any;
    if (!row || !row.is_group || row.is_active === 'false' || row.area !== area || parent === id) fail('Elegí un agrupamiento activo de la misma área');
  }
  if (id && (area !== old.area || group !== old.is_group)) {
    const used = (await db.execute(sql`SELECT EXISTS(SELECT 1 FROM inventory_items WHERE category_id=${id}) OR EXISTS(SELECT 1 FROM item_categories WHERE parent_id=${id}) AS used`)).rows[0] as any;
    if (used.used) fail('La clasificación está en uso; no se puede cambiar su área o nivel');
  }
  return data as any;
}
export async function protectCategoryDeletion(id: string) {
  const row = (await db.execute(sql`SELECT EXISTS(SELECT 1 FROM inventory_items WHERE category_id=${id}) OR EXISTS(SELECT 1 FROM item_categories WHERE parent_id=${id}) AS used`)).rows[0] as any;
  if (row.used) fail('No se puede eliminar: tiene artículos o subagrupamientos asociados');
}
export async function validateItemClassification(input: any, id?: string) {
  const old = id ? (await db.execute(sql`SELECT category_id,brand_id FROM inventory_items WHERE id=${id}`)).rows[0] as any : undefined;
  if (input.categoryId && input.categoryId !== old?.category_id) {
    const cat = (await db.execute(sql`SELECT c.*, p.is_active AS parent_active FROM item_categories c LEFT JOIN item_categories p ON p.id=c.parent_id WHERE c.id=${input.categoryId} FOR SHARE OF c`)).rows[0] as any;
    if (!cat || cat.is_group || cat.is_active === 'false' || cat.parent_active === 'false') fail('Elegí un subagrupamiento activo, no un agrupamiento');
  }
  if (input.brandId && input.brandId !== old?.brand_id) {
    const brand = (await db.execute(sql`SELECT is_active FROM brands WHERE id=${input.brandId} FOR SHARE`)).rows[0] as any;
    if (!brand || brand.is_active === 'false') fail('Elegí una marca activa');
  }
}
