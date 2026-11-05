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
  it.each(['unidad','litro'])('resolves legacy L recipes against %s stock without changing its unit or quantities', async previousUnit => {
    const id=randomUUID(),recipe=randomUUID(),warehouse=randomUUID();
    try {
      await pool!.query("INSERT INTO inventory_items(id,name,unit,current_stock,cost_price,item_kind) VALUES($1,'Leche prueba',$2,12,1777,'materia_prima')",[id,previousUnit]);
      await pool!.query("INSERT INTO inventory_warehouses(id,name) VALUES($1,'Depósito prueba')",[warehouse]);
      await pool!.query('INSERT INTO warehouse_stock(item_id,warehouse_id,current_stock) VALUES($1,$2,12)',[id,warehouse]);
      await pool!.query("INSERT INTO recipes(id,name,is_base) VALUES($1,'Receta con leche',false)",[recipe]);
      await pool!.query("INSERT INTO recipe_ingredients(id,recipe_id,inventory_item_id,ingredient_name,quantity,unit,unit_cost) VALUES($1,$2,$3,'Leche prueba',0.2,'L',999)",[id,recipe,id]);
      if(previousUnit==='unidad') {
        await pool!.query("INSERT INTO inventory_unit_conversions(item_id,from_unit,factor) VALUES($1,'litro',1)",[id]);
        const {db}=await import('../db');const {unitFactor}=await import('../inventoryStockEngine');
        expect(await unitFactor(db,id,'L','unidad')).toBe(1);
      }
      const before=(await pool!.query('SELECT * FROM warehouse_stock WHERE item_id=$1',[id])).rows;
      const {db:costDb}=await import('../db');const {cascadeRecipeCostsFromInventoryItem}=await import('../recipeCostCascade');
      await costDb.transaction(tx=>cascadeRecipeCostsFromInventoryItem(tx,id,1777));
      const saved=(await pool!.query('SELECT unit,current_stock,cost_price FROM inventory_items WHERE id=$1',[id])).rows[0];expect(saved.unit).toBe(previousUnit);expect(Number(saved.current_stock)).toBe(12);expect(Number(saved.cost_price)).toBe(1777);
      expect((await pool!.query('SELECT * FROM warehouse_stock WHERE item_id=$1',[id])).rows).toEqual(before);
      const ingredient=(await pool!.query('SELECT quantity,unit,unit_cost FROM recipe_ingredients WHERE id=$1',[id])).rows[0];
      expect(Number(ingredient.quantity)).toBe(.2);expect(ingredient.unit).toBe('L');expect(Number(ingredient.unit_cost)).toBe(1777);
      const {db}=await import('../db');const {consumeStockLines}=await import('../inventoryStockEngine');
      await db.transaction(tx=>consumeStockLines(tx,[{itemId:id,warehouseId:warehouse,quantity:.25,unit:'L'}],{type:'unit_test',id,notes:'Disposable',strictWarehouse:true}));
      expect(Number((await pool!.query('SELECT current_stock FROM inventory_items WHERE id=$1',[id])).rows[0].current_stock)).toBe(11.75);
    } finally {
      await pool!.query('DELETE FROM stock_movements WHERE item_id=$1',[id]);await pool!.query('DELETE FROM warehouse_stock WHERE item_id=$1',[id]);await pool!.query('DELETE FROM inventory_warehouses WHERE id=$1',[warehouse]);await pool!.query('DELETE FROM recipe_ingredients WHERE recipe_id=$1',[recipe]);await pool!.query('DELETE FROM recipes WHERE id=$1',[recipe]);await pool!.query('DELETE FROM inventory_unit_conversions WHERE item_id=$1',[id]);await pool!.query('DELETE FROM inventory_items WHERE id=$1',[id]);
    }
  });

  it('a real incompatible subrecipe names the affected recipe and rolls the correction back',async()=>{
    const id=randomUUID(),base=randomUUID(),parent=randomUUID(),ing=randomUUID(),dep=randomUUID();
    try {
      await pool!.query("INSERT INTO inventory_items(id,name,unit,current_stock,cost_price) VALUES($1,'Leche prueba','unidad',12,1777)",[id]);
      await pool!.query("INSERT INTO inventory_unit_conversions(item_id,from_unit,factor) VALUES($1,'litro',1)",[id]);
      await pool!.query("INSERT INTO recipes(id,name,is_base,production_unit,production_yield) VALUES($1,'Base en kilos',true,'kg',1),($2,'Postre afectado',false,NULL,NULL)",[base,parent]);
      await pool!.query("INSERT INTO recipe_ingredients(id,recipe_id,inventory_item_id,ingredient_name,quantity,unit,unit_cost) VALUES($1,$2,$3,'Leche prueba',1,'L',999)",[ing,base,id]);
      await pool!.query("INSERT INTO recipe_ingredients(id,recipe_id,sub_recipe_id,ingredient_name,quantity,unit,unit_cost) VALUES($1,$2,$3,'Base en kilos',1,'L',999)",[dep,parent,base]);
      const {db}=await import('../db');const {cascadeRecipeCostsFromInventoryItem}=await import('../recipeCostCascade');
      await expect(db.transaction(tx=>cascadeRecipeCostsFromInventoryItem(tx,id,1777))).rejects.toThrow(/Postre afectado.*Base en kilos.*L.*kg/);
      expect((await pool!.query('SELECT unit FROM inventory_items WHERE id=$1',[id])).rows[0].unit).toBe('unidad');
      expect(Number((await pool!.query('SELECT unit_cost FROM recipe_ingredients WHERE id=$1',[ing])).rows[0].unit_cost)).toBe(999);
      expect((await pool!.query('SELECT from_unit FROM inventory_unit_conversions WHERE item_id=$1',[id])).rows).toEqual([{from_unit:'litro'}]);
    } finally {
      await pool!.query('DELETE FROM recipe_ingredients WHERE id=ANY($1::text[])',[[ing,dep]]);await pool!.query('DELETE FROM recipes WHERE id=ANY($1::text[])',[[base,parent]]);await pool!.query('DELETE FROM inventory_unit_conversions WHERE item_id=$1',[id]);await pool!.query('DELETE FROM inventory_items WHERE id=$1',[id]);
    }
  });

});
