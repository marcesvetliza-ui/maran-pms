import {it,expect,afterAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {db,pool,withDatabaseTransaction} from '../db';
import {ensureAgreedInventoryTaxonomy} from '../inventoryTaxonomy';
import {INVENTORY_TAXONOMY} from '@shared/inventoryTaxonomy';
afterAll(async()=>pool.end());
it('completa tres niveles una vez, reutiliza acentos y no modifica saldos, artículos ni catálogos de venta',async()=>{
 expect(['localhost','127.0.0.1']).toContain(new URL(process.env.DATABASE_URL!).hostname);
 const rollback=new Error('fixture rollback');
 await expect(withDatabaseTransaction(async()=>{
  // Only the isolated transaction changes these fixtures; rollback restores the synthetic database.
  await db.execute(sql`CREATE TABLE IF NOT EXISTS inventory_catalog_setups (key text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`DELETE FROM inventory_catalog_setups WHERE key='physical-catalog-20261007'`);
  const before=(await db.execute(sql`SELECT (SELECT md5(coalesce(string_agg(row_to_json(i)::text,',' ORDER BY id),'')) FROM inventory_items i) items,(SELECT count(*) FROM menu_items) menu,(SELECT count(*) FROM recipes) recipes,(SELECT count(*) FROM spa_treatments) treatments,(SELECT md5(coalesce(string_agg(row_to_json(w)::text,',' ORDER BY warehouse_id,item_id),'')) FROM warehouse_stock w) balances,(SELECT count(*) FROM stock_movements) movements`)).rows[0];
  const existing=(await db.execute(sql`SELECT id,name FROM item_categories WHERE area='restaurant' AND is_group=true AND lower(name) IN ('justo cafetería','justo cafeteria') AND is_active='true' LIMIT 1`)).rows[0] as any;
  const group=existing?.id??randomUUID();
  if(!existing)await db.execute(sql`INSERT INTO item_categories(id,name,area,is_group,is_active) VALUES(${group},'Justo Cafeteria','restaurant',true,'true')`);
  const result=await ensureAgreedInventoryTaxonomy();expect(result.alreadyApplied).toBe(false);
  const categories=(await db.execute(sql`SELECT * FROM item_categories WHERE is_active='true'`)).rows as any[];
  const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  for(const branch of INVENTORY_TAXONOMY){const g=categories.find(c=>c.area===branch.area&&c.is_group&&normalize(c.name)===normalize(branch.group));expect(g).toBeDefined();for(const child of branch.children)expect(categories.some(c=>c.parent_id===g.id&&c.area===branch.area&&!c.is_group&&normalize(c.name)===normalize(child))).toBe(true);}
  expect(categories.find(c=>c.id===group)?.name).toBe(existing?.name??'Justo Cafeteria');
  expect(await ensureAgreedInventoryTaxonomy()).toEqual({created:0,alreadyApplied:true});
  const after=(await db.execute(sql`SELECT (SELECT md5(coalesce(string_agg(row_to_json(i)::text,',' ORDER BY id),'')) FROM inventory_items i) items,(SELECT count(*) FROM menu_items) menu,(SELECT count(*) FROM recipes) recipes,(SELECT count(*) FROM spa_treatments) treatments,(SELECT md5(coalesce(string_agg(row_to_json(w)::text,',' ORDER BY warehouse_id,item_id),'')) FROM warehouse_stock w) balances,(SELECT count(*) FROM stock_movements) movements`)).rows[0];
  expect(after).toEqual(before);
  throw rollback;
 })).rejects.toBe(rollback);
});
it('revierte la preparación completa si un agrupamiento activo es ambiguo',async()=>{
 const before=(await db.execute(sql`SELECT md5(coalesce(string_agg(row_to_json(c)::text,',' ORDER BY id),'')) AS hash FROM item_categories c`)).rows[0];
 await expect(withDatabaseTransaction(async()=>{
  await db.execute(sql`CREATE TABLE IF NOT EXISTS inventory_catalog_setups (key text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`DELETE FROM inventory_catalog_setups WHERE key='physical-catalog-20261007'`);
  await db.execute(sql`INSERT INTO item_categories(name,area,is_group,is_active) VALUES('Justo Cocina','restaurant',true,'true'),('JUSTO COCINA','restaurant',true,'true')`);
  await ensureAgreedInventoryTaxonomy();
 })).rejects.toThrow('Clasificación duplicada');
 expect((await db.execute(sql`SELECT md5(coalesce(string_agg(row_to_json(c)::text,',' ORDER BY id),'')) AS hash FROM item_categories c`)).rows[0]).toEqual(before);
});
