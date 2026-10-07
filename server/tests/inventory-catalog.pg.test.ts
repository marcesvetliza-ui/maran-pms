import { describe,it,expect,afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db,pool,withDatabaseTransaction } from '../db';
import { sql } from 'drizzle-orm';
import { catalogLock,validateCategory,validateItemClassification,protectCategoryDeletion } from '../inventoryCatalog';
const run=process.env.DATABASE_URL ? describe : describe.skip;
run('Catálogo: relaciones y conservación del historial',()=>{
 afterAll(async()=>{await pool.end();});
 it('bloquea área cruzada, ciclos, categorías en uso y nuevas asignaciones inactivas sin impedir conservar vínculos',async()=>{
  expect(['localhost','127.0.0.1']).toContain(new URL(process.env.DATABASE_URL!).hostname);
  const group=randomUUID(),leaf=randomUUID(),item=randomUUID(),brand=randomUUID();
  const rollback=new Error('rollback fixture');
  await expect(withDatabaseTransaction(async()=>{
   await catalogLock();
   await db.execute(sql`INSERT INTO item_categories(id,name,area,is_group) VALUES(${group},'Grupo','spa',true)`);
   await db.execute(sql`INSERT INTO item_categories(id,name,area,parent_id) VALUES(${leaf},'Categoría','spa',${group})`);
   await db.execute(sql`INSERT INTO brands(id,name,is_active) VALUES(${brand},'Marca','false')`);
   await db.execute(sql`INSERT INTO inventory_items(id,name,category_id,brand_id) VALUES(${item},'Artículo',${leaf},${brand})`);
   await expect(validateCategory({name:'Nueva',area:'restaurant',parentId:group})).rejects.toThrow(/misma área/);
   await expect(validateCategory({name:'Nueva',area:'spa',parentId:group})).resolves.toMatchObject({parentId:group});
   await expect(validateCategory({parentId:group},group)).rejects.toThrow(/depender/);
   await expect(validateCategory({area:'hotel'},group)).rejects.toThrow(/en uso/);
   await expect(protectCategoryDeletion(group)).rejects.toThrow(/asociados/);
   await expect(protectCategoryDeletion(leaf)).rejects.toThrow(/asociados/);
   await expect(validateItemClassification({categoryId:group})).rejects.toThrow(/no un agrupamiento/);
   await expect(validateItemClassification({brandId:brand})).rejects.toThrow(/marca activa/);
   await db.execute(sql`UPDATE item_categories SET is_active='false' WHERE id=${leaf}`);
   await expect(validateItemClassification({categoryId:leaf})).rejects.toThrow(/activa/);
   await expect(validateItemClassification({categoryId:leaf,brandId:brand},item)).resolves.toBeUndefined();
   await expect(validateCategory({name:'Renombrada'},leaf)).resolves.toMatchObject({name:'Renombrada'});
   throw rollback;
  })).rejects.toBe(rollback);
  expect((await db.execute(sql`SELECT id FROM inventory_items WHERE id=${item}`)).rows).toHaveLength(0);
 });
});
