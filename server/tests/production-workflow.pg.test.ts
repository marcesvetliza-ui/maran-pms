import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {db,pool,withDatabaseTransaction} from '../db';
import {ensureProductionPendingSchema,submitProduction,retryProduction,cancelPendingProduction} from '../productionPending';
import {savePreparation} from '../productionPreparations';
import {getProducibleFormulas} from '../production';
import {safeWarehouseMovement,safeInventoryTransfer} from '../inventorySafety';
import {planIngredientsWithActualQuantities} from '../recipeStockDeduction';
import {consumeStockLines} from '../inventoryStockEngine';
beforeAll(async()=>{expect(['localhost','127.0.0.1']).toContain(new URL(process.env.DATABASE_URL!).hostname);await ensureProductionPendingSchema();});
afterAll(async()=>pool.end());
async function fixture(run:(f:any)=>Promise<void>){const rollback=new Error('rollback fixture');await expect(withDatabaseTransaction(async()=>{
 const raw=randomUUID(),wh=randomUUID(),cat=randomUUID();await db.execute(sql`INSERT INTO inventory_warehouses(id,name) VALUES(${wh},'Cocina de prueba')`);await db.execute(sql`INSERT INTO item_categories(id,name,area) VALUES(${cat},'Preparados','restaurant')`);await db.execute(sql`INSERT INTO inventory_items(id,name,unit,item_kind,current_stock,cost_price) VALUES(${raw},'Harina','kg','materia_prima',0,100)`);await db.execute(sql`INSERT INTO warehouse_stock(item_id,warehouse_id,current_stock) VALUES(${raw},${wh},0)`);
 const prep=await savePreparation({name:'Sorrentinos',unit:'unidad',yield:100,categoryId:cat,lines:[{itemId:raw,quantity:1,unit:'kg',merma:0}]});const formula=(await getProducibleFormulas()).find(f=>f.recipeId===prep.recipeId)!;await run({raw,wh,cat,...prep,formula});throw rollback;
 })).rejects.toBe(rollback);}
const payload=(f:any)=>({date:'2026-10-07',recipeId:f.recipeId,outputWarehouseId:f.wh,requestId:randomUUID(),outputQuantity:100,lines:[{recipeIngredientId:f.formula.lines[0].recipeIngredientId,actualQuantity:1,warehouseId:f.wh}],registeredBy:'production-workflow'});
it('conserva producción con faltante, no aplica stock parcial y regulariza una sola vez',async()=>fixture(async f=>{
 const input=payload(f);expect((await submitProduction(input)).status).toBe('pending');expect((await submitProduction(input)).status).toBe('pending');
 expect((await db.execute(sql`SELECT count(*) AS n FROM inventory_pending_productions WHERE request_id=${input.requestId}`)).rows[0].n).toBe('1');
 expect((await db.execute(sql`SELECT current_stock FROM inventory_items WHERE id=${f.outputInventoryItemId}`)).rows[0].current_stock).toBe('0.000');
 expect((await db.execute(sql`SELECT id FROM production_runs WHERE recipe_id=${f.recipeId}`)).rows).toHaveLength(0);
 await expect(submitProduction({...input,outputQuantity:200})).rejects.toThrow('otra producción');
 await safeWarehouseMovement(f.wh,{itemId:f.raw,movementType:'entrada',quantity:2},'production-workflow');
 const first=await retryProduction(input.requestId,'production-workflow');expect(first.status).toBe('completed');expect((await retryProduction(input.requestId,'production-workflow')).runId).toBe(first.runId);
 expect((await db.execute(sql`SELECT current_stock FROM inventory_items WHERE id=${f.raw}`)).rows[0].current_stock).toBe('1.000');expect((await db.execute(sql`SELECT current_stock FROM inventory_items WHERE id=${f.outputInventoryItemId}`)).rows[0].current_stock).toBe('100.000');
}));
it('impide regularizar silenciosamente una producción si cambió la fórmula',async()=>fixture(async f=>{
 const input=payload(f);await submitProduction(input);await savePreparation({name:'Sorrentinos',unit:'unidad',yield:100,lines:[{itemId:f.raw,quantity:2,unit:'kg'}]},f.recipeId);
 await expect(retryProduction(input.requestId,'production-workflow')).rejects.toThrow('fórmula cambió');
 expect((await db.execute(sql`SELECT current_stock FROM inventory_items WHERE id=${f.outputInventoryItemId}`)).rows[0].current_stock).toBe('0.000');
}));
it('produce, consume un plato mixto sin repetir harina y mantiene costo promedio de los lotes',async()=>fixture(async f=>{
 await safeWarehouseMovement(f.wh,{itemId:f.raw,movementType:'entrada',quantity:3},'production-workflow');const first=await submitProduction(payload(f));expect(first.status).toBe('completed');
 await db.execute(sql`UPDATE inventory_items SET cost_price=200 WHERE id=${f.raw}`);await submitProduction({...payload(f),requestId:randomUUID()});
 expect(Number((await db.execute(sql`SELECT cost_price FROM inventory_items WHERE id=${f.outputInventoryItemId}`)).rows[0].cost_price)).toBeCloseTo(1.5);
 const sauce=randomUUID(),cheese=randomUUID(),virtual=randomUUID();for(const [id,name] of [[sauce,'Crema'],[cheese,'Queso']]){await db.execute(sql`INSERT INTO inventory_items(id,name,unit,item_kind,current_stock,cost_price) VALUES(${id},${name},'kg','materia_prima',1,100)`);await db.execute(sql`INSERT INTO warehouse_stock(item_id,warehouse_id,current_stock) VALUES(${id},${f.wh},1)`);}
 await db.execute(sql`INSERT INTO recipes(id,name,is_base,production_unit,production_yield) VALUES(${virtual},'Salsa al momento',true,'kg',1)`);const vi=(await db.execute(sql`INSERT INTO recipe_ingredients(recipe_id,inventory_item_id,ingredient_name,quantity,unit) VALUES(${virtual},${sauce},'Crema',1,'kg') RETURNING *`)).rows[0] as any;
 const ingredient=(data:any)=>({id:randomUUID(),recipeId:randomUUID(),inventoryItemId:null,subRecipeId:null,ingredientName:'Ingrediente',quantity:'1',unit:'kg',unitCost:'100',merma:null,warehouseId:f.wh,...data});
 const lines=await planIngredientsWithActualQuantities(async id=>id===f.recipeId?{ingredients:[],productionYield:100,productionUnit:'unidad',outputInventoryItemId:f.outputInventoryItemId}:id===virtual?{ingredients:[ingredient({inventoryItemId:sauce,quantity:'1'})],productionYield:1,productionUnit:'kg'}:undefined,[{ingredient:ingredient({subRecipeId:f.recipeId,unit:'unidad'}),actualGrossQuantity:8},{ingredient:ingredient({subRecipeId:virtual}),actualGrossQuantity:0.12},{ingredient:ingredient({inventoryItemId:cheese}),actualGrossQuantity:0.01}]);
 expect(lines.map(l=>l.itemId)).not.toContain(f.raw);
 const service=randomUUID(),menu=randomUUID(),menuCat=randomUUID(),parent=randomUUID(),order=randomUUID();
 await db.execute(sql`INSERT INTO inventory_warehouses(id,name) VALUES(${service},'Servicio de cocina')`);
 await safeInventoryTransfer(f.wh,service,[{itemId:f.outputInventoryItemId,quantity:100},{itemId:sauce,quantity:.5},{itemId:cheese,quantity:.2}],undefined,'production-workflow');
 await db.execute(sql`INSERT INTO menu_categories(id,name) VALUES(${menuCat},'Pastas')`);await db.execute(sql`INSERT INTO menu_items(id,name,category_id,price) VALUES(${menu},'Sorrentinos con salsa',${menuCat},100)`);
 await db.execute(sql`INSERT INTO recipes(id,menu_item_id,is_base) VALUES(${parent},${menu},false)`);
 await db.execute(sql`INSERT INTO recipe_ingredients(recipe_id,sub_recipe_id,ingredient_name,quantity,unit) VALUES(${parent},${f.recipeId},'Sorrentinos',8,'unidad'),(${parent},${virtual},'Salsa',.12,'kg')`);
 await db.execute(sql`INSERT INTO recipe_ingredients(recipe_id,inventory_item_id,ingredient_name,quantity,unit) VALUES(${parent},${cheese},'Queso',.01,'kg')`);
 const {storage}=await import('../db-storage');expect((await storage.deductStockFromOrder(order,[{menuItemId:menu,quantity:1}],'production-workflow')).status).toBe('completed');
 await storage.deductStockFromOrder(order,[{menuItemId:menu,quantity:1}],'production-workflow');
 const balance=async(id:string)=>Number((await db.execute(sql`SELECT current_stock FROM inventory_items WHERE id=${id}`)).rows[0].current_stock);
 expect(await balance(f.outputInventoryItemId)).toBe(192);expect(await balance(f.raw)).toBe(1);expect(await balance(sauce)).toBe(.88);expect(await balance(cheese)).toBe(.99);
}));
it('una fórmula inválida no queda guardada como producción pendiente',async()=>fixture(async f=>{
 const input=payload(f);await expect(submitProduction({...input,outputQuantity:-1})).rejects.toThrow('mayor a cero');expect((await db.execute(sql`SELECT request_id FROM inventory_production_requests WHERE request_id=${input.requestId}`)).rows).toHaveLength(0);
}));

it('anular un pendiente conserva el registro, no toca cantidades e impide reintentarlo',async()=>fixture(async f=>{
 const input=payload(f);await submitProduction(input);expect(await cancelPendingProduction(input.requestId,'Datos de prueba','production-workflow')).toEqual({status:'cancelled'});await expect(retryProduction(input.requestId,'production-workflow')).rejects.toThrow('anulada');expect((await db.execute(sql`SELECT current_stock FROM inventory_items WHERE id=${f.outputInventoryItemId}`)).rows[0].current_stock).toBe('0.000');
}));
it('revertir un lote retira su costo del promedio y conserva el costo del lote restante',async()=>fixture(async f=>{
 await safeWarehouseMovement(f.wh,{itemId:f.raw,movementType:'entrada',quantity:3},'production-workflow');await submitProduction(payload(f));await db.execute(sql`UPDATE inventory_items SET cost_price=200 WHERE id=${f.raw}`);const second=await submitProduction(payload(f));
 await (await import('../inventorySourceReversal')).reverseInventorySource('production_run',second.runId!,'Reversión del segundo lote','production-workflow');
 expect(Number((await db.execute(sql`SELECT cost_price FROM inventory_items WHERE id=${f.outputInventoryItemId}`)).rows[0].cost_price)).toBeCloseTo(1);expect(Number((await db.execute(sql`SELECT current_stock FROM inventory_items WHERE id=${f.outputInventoryItemId}`)).rows[0].current_stock)).toBe(100);
}));

it('usa producción sin transferencia y respeta luego el último destino, incluso si está inactivo',async()=>fixture(async f=>{
 const line=[{itemId:f.outputInventoryItemId,quantity:8,unit:'unidad'}];
 await submitProduction(payload(f));await expect(consumeStockLines(db,line,{type:'test',id:randomUUID(),notes:'Prueba'})).rejects.toThrow('no hay transferencia ni producción');
 await safeWarehouseMovement(f.wh,{itemId:f.raw,movementType:'entrada',quantity:2},'production-workflow');await submitProduction(payload(f));
 await consumeStockLines(db,line,{type:'test',id:randomUUID(),notes:'Prueba'});
 expect(Number((await db.execute(sql`SELECT current_stock FROM warehouse_stock WHERE item_id=${f.outputInventoryItemId} AND warehouse_id=${f.wh}`)).rows[0].current_stock)).toBe(92);
 const destination=randomUUID();await db.execute(sql`INSERT INTO inventory_warehouses(id,name) VALUES(${destination},'Destino')`);await safeInventoryTransfer(f.wh,destination,[{itemId:f.outputInventoryItemId,quantity:20}],undefined,'production-workflow');
 await consumeStockLines(db,line,{type:'test',id:randomUUID(),notes:'Prueba'});
 expect(Number((await db.execute(sql`SELECT current_stock FROM warehouse_stock WHERE item_id=${f.outputInventoryItemId} AND warehouse_id=${destination}`)).rows[0].current_stock)).toBe(12);
 await db.execute(sql`UPDATE inventory_warehouses SET is_active='false' WHERE id=${destination}`);await expect(consumeStockLines(db,line,{type:'test',id:randomUUID(),notes:'Prueba'})).rejects.toThrow('Depósito inexistente o inactivo');
}));
