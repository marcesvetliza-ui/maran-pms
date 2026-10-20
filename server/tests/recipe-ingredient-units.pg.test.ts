import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { packageConversions } from '@shared/inventoryPackage';

const url = process.env.DATABASE_URL;
if (url && (!['localhost','127.0.0.1'].includes(new URL(url).hostname) || !/test/.test(new URL(url).pathname))) {
  throw new Error('Recipe unit tests require a local disposable test database');
}
const suite = url ? describe : describe.skip;
const pool = url ? new pg.Pool({connectionString:url}) : null;
suite('recipe quantities, cost and real stock use the same conversion', () => {
  let storage: typeof import('../db-storage').storage;
  beforeAll(async()=>{ ({storage} = await import('../db-storage')); });
  afterAll(async()=>{await pool?.end();});
  it.each([
    {unit:'kg',stock:3,cost:6000,input:'g',quantity:'300',remaining:2.7,perUnit:6},
    {unit:'litro',stock:3,cost:6000,input:'ml',quantity:'300',remaining:2.7,perUnit:6},
    {unit:'unidad',stock:1,cost:18000,input:'g',quantity:'300',remaining:0.9,perUnit:6},
  ])('$quantity $input of stock in $unit costs 1800 and deducts the equivalent', async scenario => {
    const id = randomUUID(), recipeId = randomUUID(), warehouseId = randomUUID();
    try {
      await pool!.query('INSERT INTO inventory_items(id,name,unit,current_stock,cost_price,item_kind) VALUES($1,$2,$3,$4,$5,\'materia_prima\')',[id,'Unit test',scenario.unit,scenario.stock,scenario.cost]);
      await pool!.query('INSERT INTO recipes(id,name,is_base) VALUES($1,$2,true)',[recipeId,'Unit recipe']);
      if (scenario.unit === 'unidad') for (const row of packageConversions('unidad','unidad','g',3000)) {
        await pool!.query('INSERT INTO inventory_unit_conversions(item_id,from_unit,factor) VALUES($1,$2,$3)',[id,row.fromUnit,row.factor]);
      }
      const ingredient = await storage.createRecipeIngredient({recipeId,inventoryItemId:id,ingredientName:'Unit test',unit:scenario.input,quantity:scenario.quantity,unitCost:'99999'});
      expect(Number(ingredient.unitCost)).toBe(scenario.perUnit);
      expect(Number(ingredient.quantity)*Number(ingredient.unitCost)).toBe(1800);
      // An edit must also recompute the price, rather than accept a client price.
      const updated = await storage.updateRecipeIngredient(ingredient.id,{unitCost:'99999'});
      expect(Number(updated?.unitCost)).toBe(scenario.perUnit);
      await expect(storage.createRecipeIngredient({recipeId,inventoryItemId:id,ingredientName:'Invalid conversion',unit:scenario.unit==='litro'?'kg':'litro',quantity:'1',unitCost:'1'})).rejects.toThrow(/equivalencia/);
      await pool!.query('INSERT INTO inventory_warehouses(id,name) VALUES($1,$2)',[warehouseId,'Unit warehouse']);
      await pool!.query('INSERT INTO warehouse_stock(item_id,warehouse_id,current_stock) VALUES($1,$2,$3)',[id,warehouseId,scenario.stock]);
      const { db } = await import('../db');
      const { consumeStockLines } = await import('../inventoryStockEngine');
      await db.transaction(tx=>consumeStockLines(tx,[{itemId:id,warehouseId,quantity:Number(scenario.quantity),unit:scenario.input}],{type:'unit_test',id,notes:'Disposable recipe test',strictWarehouse:true}));
      const stock = await pool!.query('SELECT current_stock FROM inventory_items WHERE id=$1',[id]);
      expect(Number(stock.rows[0].current_stock)).toBe(scenario.remaining);
      const { cascadeRecipeCostsFromInventoryItem } = await import('../recipeCostCascade');
      await cascadeRecipeCostsFromInventoryItem(db,id,scenario.cost*2);
      expect(Number((await storage.getRecipeIngredients(recipeId))[0].unitCost)).toBe(scenario.perUnit*2);
    } finally {
      await pool!.query('DELETE FROM stock_movements WHERE item_id=$1',[id]);
      await pool!.query('DELETE FROM warehouse_stock WHERE item_id=$1',[id]);
      await pool!.query('DELETE FROM inventory_warehouses WHERE id=$1',[warehouseId]);
      await pool!.query('DELETE FROM recipe_ingredients WHERE recipe_id=$1',[recipeId]);
      await pool!.query('DELETE FROM recipes WHERE id=$1',[recipeId]);
      await pool!.query('DELETE FROM inventory_unit_conversions WHERE item_id=$1',[id]);
      await pool!.query('DELETE FROM inventory_items WHERE id=$1',[id]);
    }
  });
});
