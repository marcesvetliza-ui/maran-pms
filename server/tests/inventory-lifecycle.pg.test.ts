import express from 'express';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { beforeAll, beforeEach, afterEach, afterAll, describe, it, expect } from 'vitest';
const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({connectionString:process.env.DATABASE_URL}) : null;
let storage: typeof import('../db-storage').storage;
let base:string, server:http.Server, id:string, item:string, warehouse:string, recipe:string, role='admin';
async function request(method:string,path:string,body?:object) {return fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
suite('Bajas seguras y edición del catálogo',()=>{
 beforeAll(async()=>{
  if(!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname)||process.env.NODE_ENV==='production') throw new Error('Solo base local de prueba');
  ({storage}=await import('../db-storage'));
  await (await import('../productionPending')).ensureProductionPendingSchema();
  await (await import('../inventoryCountSchema')).ensureInventoryCountWarehouseSchema();
  await (await import('../permissions')).loadRolePermissionsCache();
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:'lifecycle-test',username:'Prueba',role} as any;req.isAuthenticated=()=>true;next();});
  (await import('../routes/inventory')).registerInventoryRoutes(app);server=http.createServer(app);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${(server.address() as any).port}`;
 });
 beforeEach(async()=>{id='life-'+randomUUID();item=id+'-i';warehouse=id+'-w';recipe=id+'-r';role='admin';
  await pool!.query("INSERT INTO inventory_items(id,name,unit,current_stock) VALUES($1,'Materia prima','kg',0)",[item]);
  await pool!.query("INSERT INTO inventory_warehouses(id,name) VALUES($1,'Cocina')",[warehouse]);
  await pool!.query("INSERT INTO recipes(id,name,is_base) VALUES($1,'Sorrentinos',true)",[recipe]);
 });
 afterEach(async()=>{
  await pool!.query('DELETE FROM audit_logs WHERE entity_id IN ($1,$2)',[item,warehouse]);
  await pool!.query('DELETE FROM inventory_consumption_jobs WHERE source_id=$1',[id]);
  await pool!.query('DELETE FROM inventory_pending_productions WHERE request_id=$1',[id]);
  await pool!.query('DELETE FROM recipe_ingredients WHERE recipe_id=$1',[recipe]);
  await pool!.query('DELETE FROM recipes WHERE id=$1',[recipe]);
  await pool!.query('DELETE FROM stock_movements WHERE item_id=$1',[item]);
  await pool!.query('DELETE FROM warehouse_stock WHERE item_id=$1',[item]);
  await pool!.query('DELETE FROM inventory_items WHERE id=$1',[item]);
  await pool!.query('DELETE FROM inventory_warehouses WHERE id=$1',[warehouse]);
 });
 afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await pool!.end();await (await import('../db')).pool.end();});
 it('discontinuar conserva el stock y permite consumir y volver a comprar',async()=>{
  await pool!.query('UPDATE inventory_items SET current_stock=2 WHERE id=$1',[item]);
  await pool!.query('INSERT INTO warehouse_stock(warehouse_id,item_id,current_stock) VALUES($1,$2,2)',[warehouse,item]);
  expect((await request('PATCH',`/api/inventory/items/${item}/purchasing`,{purchaseEnabled:false})).status).toBe(200);
  expect((await pool!.query('SELECT current_stock,is_active,purchase_enabled FROM inventory_items WHERE id=$1',[item])).rows[0]).toMatchObject({current_stock:'2.000',is_active:'true',purchase_enabled:false});
  const {db,withDatabaseTransaction}=await import('../db');
  await withDatabaseTransaction(async()=>{await (await import('../inventoryStockEngine')).consumeStockLines(db,[{itemId:item,quantity:1,warehouseId:warehouse}],{type:'manual',id,actor:'lifecycle-test',notes:'Consumo de remanente'});});
  expect((await pool!.query('SELECT current_stock FROM inventory_items WHERE id=$1',[item])).rows[0].current_stock).toBe('1.000');
  expect((await request('PATCH',`/api/inventory/items/${item}/purchasing`,{purchaseEnabled:true})).status).toBe(200);
  expect((await pool!.query('SELECT purchase_enabled FROM inventory_items WHERE id=$1',[item])).rows[0].purchase_enabled).toBe(true);
 });
 it('la elaboración se archiva conservando ingredientes y bloquea dependencias activas',async()=>{
  const parent=id+'-parent';
  try {
   await storage.createRecipeIngredient({recipeId:recipe,inventoryItemId:item,ingredientName:'Harina',quantity:'1',unit:'kg'});
   await pool!.query("INSERT INTO recipes(id,name,is_base) VALUES($1,'Plato con base',true)",[parent]);
   await storage.createRecipeIngredient({recipeId:parent,subRecipeId:recipe,ingredientName:'Base',quantity:'1',unit:'kg'});
   await expect(storage.deleteRecipe(recipe)).rejects.toThrow('receta activa');
   await storage.deleteRecipe(parent);
   await storage.deleteRecipe(recipe);
   expect((await storage.getRecipe(recipe))?.ingredients).toHaveLength(1);
   expect((await storage.getRecipe(recipe))?.isActive).toBe('false');
   await expect(storage.updateRecipe(parent,{isActive:'true'})).rejects.toThrow('reactivá');
   await storage.updateRecipe(recipe,{isActive:'true'});
   await storage.updateRecipe(parent,{isActive:'true'});
  } finally {await pool!.query('DELETE FROM recipe_ingredients WHERE recipe_id=$1',[parent]);await pool!.query('DELETE FROM recipes WHERE id=$1',[parent]);}
 });
 it('plato y categoría conservan sus filas y se recuperan en el orden correcto',async()=>{
  const category=id+'-cat',plate=id+'-plate';
  try {
   await pool!.query("INSERT INTO menu_categories(id,name) VALUES($1,'Categoría prueba')",[category]);
   await pool!.query("INSERT INTO menu_items(id,category_id,name,price,inventory_item_id) VALUES($1,$2,'Plato prueba',100,$3)",[plate,category,item]);
   await expect(storage.deleteMenuCategory(category)).rejects.toThrow('platos activos');
   expect(await storage.deleteMenuItem(plate)).toEqual({deleted:false,deactivated:true});
   expect(await storage.deleteMenuCategory(category)).toBe(true);
   expect((await pool!.query('SELECT is_active FROM menu_items WHERE id=$1',[plate])).rows[0].is_active).toBe('false');
   await expect(storage.updateMenuItem(plate,{isActive:'true',isAvailable:'true'})).rejects.toThrow('categoría');
   await storage.updateMenuCategory(category,{isActive:'true'});
   await storage.updateMenuItem(plate,{isActive:'true',isAvailable:'true'});
   expect((await pool!.query('SELECT is_active FROM inventory_items WHERE id=$1',[item])).rows[0].is_active).toBe('true');
  } finally {await pool!.query('DELETE FROM menu_items WHERE id=$1',[plate]);await pool!.query('DELETE FROM menu_categories WHERE id=$1',[category]);}
 });
 it('el alta exige clasificación completa, proveedor y límites coherentes',async()=>{
  const group=id+'-group',category=id+'-leaf';let created:string|undefined;const supplier=(await pool!.query("INSERT INTO accounting_suppliers(razon_social,cuit,condicion_iva) VALUES($1,$2,'responsable_inscripto') RETURNING id",[id,'30'+randomUUID().replaceAll('-','').slice(0,9)])).rows[0].id;
  try {
   await pool!.query("INSERT INTO item_categories(id,name,area,is_group) VALUES($1,'Agrupamiento','restaurant',true)",[group]);await pool!.query("INSERT INTO item_categories(id,name,area,parent_id) VALUES($1,'Subagrupamiento','restaurant',$2)",[category,group]);
   const payload={name:id,unit:'unidad',categoryId:category,itemKind:'materia_prima',accountingSupplierIds:[supplier],minStock:'2',criticalStock:'1',abcClass:'C',ivaRate:'21'};
   expect((await request('POST','/api/inventory/items',{...payload,accountingSupplierIds:[]})).status).toBe(400);
   expect((await request('POST','/api/inventory/items',{...payload,criticalStock:'3'})).status).toBe(400);
   expect((await request('POST','/api/inventory/items',{...payload,ivaRate:null})).status).toBe(400);
   const response=await request('POST','/api/inventory/items',payload);const result=await response.json();expect(response.status,JSON.stringify(result)).toBe(201);created=result.id;
   expect((await pool!.query('SELECT category_id,min_stock,critical_stock FROM inventory_items WHERE id=$1',[created])).rows[0]).toMatchObject({category_id:category,min_stock:'2.000',critical_stock:'1.000'});
  } finally {
   if(created){await pool!.query('DELETE FROM inventory_item_suppliers WHERE item_id=$1',[created]);await pool!.query('DELETE FROM inventory_items WHERE id=$1',[created]);}
   await pool!.query('DELETE FROM item_categories WHERE id=$1',[category]);await pool!.query('DELETE FROM item_categories WHERE id=$1',[group]);await pool!.query('DELETE FROM accounting_suppliers WHERE id=$1',[supplier]);
  }
 });
 it('bloquea saldos y conserva cantidades',async()=>{
  await pool!.query('UPDATE inventory_items SET current_stock=2 WHERE id=$1',[item]);
  const r=await request('POST',`/api/inventory/items/${item}/deactivate`,{reason:'Prueba'});expect(r.status).toBe(409);expect((await r.json()).error).toContain('saldo');
  expect((await pool!.query('SELECT is_active,current_stock FROM inventory_items WHERE id=$1',[item])).rows[0]).toMatchObject({is_active:'true',current_stock:'2.000'});
 });
 it('informa la receta que impide la baja, también desde storage',async()=>{
  await storage.createRecipeIngredient({recipeId:recipe,inventoryItemId:item,ingredientName:'Harina',quantity:'1',unit:'kg'});
  await expect(storage.updateInventoryItem(item,{isActive:'false'})).rejects.toThrow('Sorrentinos');
 });
 it('serializa asociación y baja simultáneas sin dejar una referencia inactiva',async()=>{
  const results=await Promise.allSettled([storage.updateInventoryItem(item,{isActive:'false'}),storage.createRecipeIngredient({recipeId:recipe,inventoryItemId:item,ingredientName:'Harina',quantity:'1',unit:'kg'})]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const r=await pool!.query('SELECT i.is_active, COUNT(ri.id)::int AS refs FROM inventory_items i LEFT JOIN recipe_ingredients ri ON ri.inventory_item_id=i.id WHERE i.id=$1 GROUP BY i.is_active',[item]);
  expect(r.rows[0].is_active==='false' && r.rows[0].refs>0).toBe(false);
 });
 it('bloquea producción y consumo pendientes',async()=>{
  await pool!.query("INSERT INTO inventory_pending_productions(request_id,payload,formula_hash) VALUES($1,$2,'test')",[id,JSON.stringify({recipeId:recipe,outputWarehouseId:warehouse,lines:[]})]);
  expect((await request('DELETE',`/api/inventory/warehouses/${warehouse}`)).status).toBe(409);
  await pool!.query("INSERT INTO inventory_consumption_jobs(source_type,source_id,lines,status) VALUES('restaurant_order',$1,$2,'pending')",[id,JSON.stringify([{itemId:item,warehouseId:warehouse,quantity:1}])]);
  await expect(storage.updateInventoryItem(item,{isActive:'false'})).rejects.toThrow('Consumo pendiente');
 });
 it('protege ambos caminos de baja del depósito con saldo',async()=>{
  await pool!.query('INSERT INTO warehouse_stock(warehouse_id,item_id,current_stock) VALUES($1,$2,3)',[warehouse,item]);
  expect((await request('DELETE',`/api/inventory/warehouses/${warehouse}`)).status).toBe(409);
  expect((await request('PATCH',`/api/inventory/warehouses/${warehouse}`,{isActive:'false'})).status).toBe(409);
 });
 it('conserva el historial al dar de baja artículos y depósitos vacíos',async()=>{
  await pool!.query("INSERT INTO stock_movements(item_id,warehouse_id,movement_type,quantity,previous_stock,new_stock,created_at) VALUES($1,$2,'ajuste',0,0,0,now())",[item,warehouse]);
  expect((await request('POST',`/api/inventory/items/${item}/deactivate`,{reason:'Fin prueba'})).status).toBe(200);
  expect((await request('DELETE',`/api/inventory/warehouses/${warehouse}`)).status).toBe(204);
  expect((await pool!.query('SELECT id FROM stock_movements WHERE item_id=$1',[item])).rows).toHaveLength(1);
 });
 it('la edición general no evita la baja con motivo ni modifica cantidades',async()=>{
  expect((await request('PATCH',`/api/inventory/items/${item}`,{isActive:'false'})).status).toBe(400);
  const r=await request('PATCH',`/api/inventory/items/${item}/metadata`,{name:'Harina',minStock:'2',maxStock:'20',criticalStock:'1',itemKind:'materia_prima',abcClass:'B',ivaRate:'10.5',unit:'kg',currentStock:500});
  expect(r.status).toBe(200);expect(await r.json()).toMatchObject({name:'Harina',maxStock:'20.000',abcClass:'B',currentStock:'0.000'});
 });
 it('impide que una entrada simultánea termine en un depósito inactivo con saldo',async()=>{
  const results=await Promise.all([request('DELETE',`/api/inventory/warehouses/${warehouse}`),request('POST',`/api/inventory/warehouses/${warehouse}/movements`,{itemId:item,movementType:'entrada',quantity:2})]);
  expect(results.map(r=>r.status).filter(status=>status<300)).toHaveLength(1);
  const row=(await pool!.query('SELECT w.is_active,COALESCE(s.current_stock,0)::float AS stock FROM inventory_warehouses w LEFT JOIN warehouse_stock s ON s.warehouse_id=w.id AND s.item_id=$2 WHERE w.id=$1',[warehouse,item])).rows[0];
  expect(row.is_active==='false' && row.stock!==0).toBe(false);
 });
 it('protege los insumos de tratamientos SPA',async()=>{
  await pool!.query("INSERT INTO spa_treatments(id,name) VALUES($1,'Masajes')",[id]);
  try {
   await storage.createTreatmentSupply({treatmentId:id,inventoryItemId:item,quantity:'0.1',unit:'kg'});
   await expect(storage.updateInventoryItem(item,{isActive:'false'})).rejects.toThrow('Masajes');
  } finally {await pool!.query('DELETE FROM treatment_supplies WHERE treatment_id=$1',[id]);await pool!.query('DELETE FROM spa_treatments WHERE id=$1',[id]);}
 });
 it('desactiva marcas conservando vínculos y rechaza nuevas asociaciones',async()=>{
  await pool!.query("INSERT INTO brands(id,name) VALUES($1,'Marca prueba')",[id]);
  try {
   await pool!.query('UPDATE inventory_items SET brand_id=$1 WHERE id=$2',[id,item]);
   expect((await request('PATCH',`/api/inventory/brands/${id}`,{isActive:'false'})).status).toBe(200);
   expect((await request('DELETE',`/api/inventory/brands/${id}`)).status).toBe(405);
   expect((await pool!.query('SELECT brand_id FROM inventory_items WHERE id=$1',[item])).rows[0].brand_id).toBe(id);
   expect((await request('PATCH',`/api/inventory/items/${item}/metadata`,{name:'Harina',minStock:0,brandId:id})).status).toBe(200);
   await pool!.query('UPDATE inventory_items SET brand_id=NULL WHERE id=$1',[item]);
   expect((await request('PATCH',`/api/inventory/items/${item}/metadata`,{name:'Harina',minStock:0,brandId:id})).status).toBe(409);
  } finally {await pool!.query('UPDATE inventory_items SET brand_id=NULL WHERE id=$1',[item]);await pool!.query('DELETE FROM brands WHERE id=$1',[id]);}
 });
 it('rechaza estados que podrían evitar la protección central',async()=>{
  await expect(storage.updateInventoryItem(item,{isActive:false} as any)).rejects.toThrow('Estado');
 });
 it('los permisos de catálogo siguen siendo obligatorios',async()=>{role='reception';expect((await request('POST',`/api/inventory/items/${item}/deactivate`,{reason:'Prueba'})).status).toBe(403);});
});
