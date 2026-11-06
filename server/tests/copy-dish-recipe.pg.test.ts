import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,it,expect,describe} from 'vitest';
import {sql} from 'drizzle-orm';
const suite=process.env.DATABASE_URL?describe:describe.skip;
let db:typeof import('../db').db,transaction:typeof import('../db').withDatabaseTransaction,storage:typeof import('../db-storage').storage,copy:typeof import('../copyDishRecipe').copyDishRecipe,pool:typeof import('../db').pool;
async function fixture(run:(f:any)=>Promise<void>){const rollback=new Error('Fixture rollback');try{await transaction(async()=>{
 const category=(await db.execute(sql`INSERT INTO menu_categories(name) VALUES('Copias prueba') RETURNING id`)).rows[0].id;
 const inventory=(await db.execute(sql`INSERT INTO inventory_items(name,unit,cost_price,current_stock) VALUES('Carne prueba','kg',6000,10) RETURNING id`)).rows[0].id;
 const original=await storage.createMenuItem({name:'Milanesa',categoryId:String(category),price:'10000'} as any);
 const recipe=await storage.createRecipe({menuItemId:original.id,notes:'Preparar al horno',productionYield:'1',productionUnit:'porciones'});
 const ingredient=(await db.execute(sql`INSERT INTO recipe_ingredients(recipe_id,inventory_item_id,ingredient_name,quantity,unit,unit_cost,merma) VALUES(${recipe.id},${inventory},'Carne',0.2,'kg',123,10) RETURNING id`)).rows[0].id;
 await run({category,inventory,original,recipe,ingredient});throw rollback;
});}catch(error){if(error!==rollback)throw error;}}
suite('Independent dish recipe copy',()=>{
 beforeAll(async()=>{const url=new URL(process.env.DATABASE_URL!);if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.includes('test'))throw new Error('Solo base local de pruebas');({db,pool,withDatabaseTransaction:transaction}=await import('../db'));await(await import('../inventoryStage2Schema')).ensureInventoryStage2Schema();({storage}=await import('../db-storage'));({copyDishRecipe:copy}=await import('../copyDishRecipe'));});
 afterAll(async()=>{await pool?.end();});
 it('copies a zero-price MP dish independently with current costs and the same consumption',()=>fixture(async f=>{
  const result=await copy(f.recipe.id,{name:'Milanesa MP',categoryId:f.category,price:0});
  expect(result.menuItem.id).not.toBe(f.original.id);expect(Number(result.menuItem.price)).toBe(0);expect(result.menuItem.name).toBe('Milanesa MP');
  expect(result.recipe?.notes).toBe('Preparar al horno');expect(Number(result.recipe?.productionYield)).toBe(1);expect(result.recipe?.productionUnit).toBe('porciones');
  const ingredient=result.recipe!.ingredients[0];expect(ingredient.id).not.toBe(f.ingredient);expect(ingredient.inventoryItemId).toBe(f.inventory);expect(Number(ingredient.unitCost)).toBe(6000);expect(Number(ingredient.quantity)).toBe(.2);expect(Number(ingredient.merma)).toBe(10);
  const originalPlan=await storage.planStockFromOrder([{menuItemId:f.original.id,quantity:1}]),copyPlan=await storage.planStockFromOrder([{menuItemId:result.menuItem.id,quantity:1}]);expect(copyPlan).toEqual(originalPlan);
  await storage.updateRecipeIngredient(ingredient.id,{quantity:'0.400'});
  const original=await storage.getRecipe(f.recipe.id);expect(Number(original!.ingredients[0].quantity)).toBe(.2);expect(Number(original!.ingredients[0].unitCost)).toBe(123);
  expect(Number((await storage.getInventoryItem(f.inventory))?.currentStock)).toBe(10);
 }));
 it('rolls back the menu item and mirror if a referenced ingredient is inactive',()=>fixture(async f=>{
  await db.execute(sql`UPDATE inventory_items SET is_active='false' WHERE id=${f.inventory}`);
  await expect(copy(f.recipe.id,{name:'Copia inválida',categoryId:f.category,price:0})).rejects.toThrow(/inactivo/);
  expect((await db.execute(sql`SELECT id FROM menu_items WHERE name='Copia inválida'`)).rows).toHaveLength(0);
  expect((await db.execute(sql`SELECT id FROM inventory_items WHERE name='Copia inválida'`)).rows).toHaveLength(0);
 }));
 it('keeps base preparation references and computes their current cost for the copied dish',()=>fixture(async f=>{
  const base=await storage.createRecipe({menuItemId:null,isBase:true,name:'Salsa',productionYield:'2',productionUnit:'kg'});
  await storage.createRecipeIngredient({recipeId:base.id,inventoryItemId:f.inventory,ingredientName:'Carne',quantity:'1',unit:'kg',unitCost:'1'});
  await db.execute(sql`INSERT INTO recipe_ingredients(recipe_id,sub_recipe_id,ingredient_name,quantity,unit,unit_cost) VALUES(${f.recipe.id},${base.id},'Salsa',0.1,'kg',1)`);
  const result=await copy(f.recipe.id,{name:'Milanesa con salsa MP',categoryId:f.category,price:0});
  const ingredient=result.recipe!.ingredients.find(row=>row.subRecipeId===base.id)!;expect(ingredient).toBeTruthy();expect(Number(ingredient.unitCost)).toBe(3000);expect(Number(ingredient.quantity)).toBe(.1);
 }));
 it('rejects empty recipes, negative price and base preparations as dish sources',()=>fixture(async f=>{
  await expect(copy(f.recipe.id,{name:'Inválido',categoryId:f.category,price:-1})).rejects.toThrow(/precio/);
  await db.execute(sql`DELETE FROM recipe_ingredients WHERE recipe_id=${f.recipe.id}`);
  await expect(copy(f.recipe.id,{name:'Vacío',categoryId:f.category,price:0})).rejects.toThrow(/ingredientes/);
  await db.execute(sql`UPDATE recipes SET is_base=true WHERE id=${f.recipe.id}`);
  await expect(copy(f.recipe.id,{name:'Base',categoryId:f.category,price:0})).rejects.toThrow(/plato/);
 }));
});
