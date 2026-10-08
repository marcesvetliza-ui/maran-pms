import {it,expect,afterAll} from 'vitest';
import {sql} from 'drizzle-orm';
import {db,pool,withDatabaseTransaction} from '../db';
import {importStockWorkbook,validateStockWorkbook} from '../inventoryWorkbookImport';
import data from '../assets/initial-stock-20261008.json';
afterAll(async()=>pool.end());
it('reemplaza atómicamente el catálogo completo, conserva documentos y no duplica al reintentar',async()=>{
 expect(['localhost','127.0.0.1']).toContain(new URL(process.env.DATABASE_URL!).hostname);
 expect(validateStockWorkbook(data)).toEqual({articles:1010,locations:1068});
 const rollback=new Error('fixture rollback');
 await expect(withDatabaseTransaction(async()=>{
  const before=(await db.execute(sql`SELECT (SELECT count(*) FROM menu_items) menu,(SELECT count(*) FROM recipes) recipes,(SELECT count(*) FROM spa_treatments) treatments,(SELECT count(*) FROM purchase_invoices) purchases`)).rows[0];
  const result=await importStockWorkbook(data);expect(result.alreadyApplied).toBe(false);
  expect((await db.execute(sql`SELECT count(*)::int n FROM inventory_items WHERE is_active='true' AND item_kind<>'plato'`)).rows[0]).toEqual({n:1010});
  expect((await db.execute(sql`SELECT count(*)::int n FROM inventory_items i WHERE is_active='true' AND item_kind<>'plato' AND current_stock<>(SELECT sum(current_stock) FROM warehouse_stock WHERE item_id=i.id)`)).rows[0]).toEqual({n:0});
  expect((await db.execute(sql`SELECT (SELECT count(*) FROM menu_items) menu,(SELECT count(*) FROM recipes) recipes,(SELECT count(*) FROM spa_treatments) treatments,(SELECT count(*) FROM purchase_invoices) purchases`)).rows[0]).toEqual(before);
  expect((await importStockWorkbook(data)).alreadyApplied).toBe(true);
  await expect(importStockWorkbook({...data,source:'changed'})).rejects.toThrow('otro contenido');
  throw rollback;
 })).rejects.toBe(rollback);
},120000);
it('rechaza duplicados y cantidades incompatibles antes de escribir',()=>{
 expect(()=>validateStockWorkbook({...data,articles:[data.articles[0],data.articles[0]]})).toThrow('duplicado');
 expect(()=>validateStockWorkbook({...data,articles:[{...data.articles[0],locations:[{...data.articles[0].locations[0],quantity:-1}]}]})).toThrow('Cantidad inválida');
});

it('una falla durante la carga revierte también el retiro de saldos y el archivo del catálogo',async()=>{
 const before=(await db.execute(sql`SELECT md5(coalesce(string_agg(row_to_json(i)::text,',' ORDER BY id),'')) hash FROM inventory_items i`)).rows[0];
 await expect(withDatabaseTransaction(async()=>{
  await db.execute(sql`CREATE FUNCTION pg_temp.reject_workbook() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN IF NEW.sku LIKE ''STK26-%'' THEN RAISE EXCEPTION ''fixture import failure''; END IF; RETURN NEW; END'`);
  await db.execute(sql`CREATE TRIGGER test_reject_workbook BEFORE INSERT ON inventory_items FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_workbook()`);
  await importStockWorkbook(data);
 })).rejects.toThrow('fixture import failure');
 expect((await db.execute(sql`SELECT md5(coalesce(string_agg(row_to_json(i)::text,',' ORDER BY id),'')) hash FROM inventory_items i`)).rows[0]).toEqual(before);
});
