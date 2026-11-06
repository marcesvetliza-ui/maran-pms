import {z} from 'zod';
import {sql} from 'drizzle-orm';
import {db,withDatabaseSavepoint} from './db';
import {storage} from './db-storage';
import {requireActiveInventoryReferences} from './inventoryLifecycle';
import {computeBaseRecipeCostPerUnit} from './recipeCostCascade';
import {inventoryUnitFactor} from './inventoryUnits';
import {unitFactor} from './inventoryStockEngine';
const menu=z.object({name:z.string().trim().min(1).max(200),categoryId:z.string().min(1),description:z.string().max(4000).optional(),price:z.coerce.number().finite().min(0).max(99999999),preparationTime:z.coerce.number().int().min(0).optional(),isAvailable:z.enum(['true','false']).default('true'),isEditable:z.enum(['true','false']).default('false'),defaultCourse:z.coerce.number().int().min(0).max(3).optional()});
export async function copyDishRecipe(sourceId:string,input:unknown){
 const parsed=menu.safeParse(input);if(!parsed.success)throw Object.assign(new Error('Revisá nombre, categoría y precio del nuevo plato'),{statusCode:400});
 return withDatabaseSavepoint(async()=>{
  await db.execute(sql`SELECT pg_advisory_xact_lock(173410,4)`);
  const source=await storage.getRecipe(sourceId);
  if(!source||source.isBase||!source.menuItemId||source.isActive==='false')throw Object.assign(new Error('Elegí una receta activa de un plato'),{statusCode:409});
  const sourceMenu=await storage.getMenuItem(source.menuItemId);
  if(!sourceMenu||sourceMenu.isActive==='false')throw Object.assign(new Error('El plato de origen está inactivo'),{statusCode:409});
  const ingredients=await storage.getRecipeIngredients(sourceId);
  if(!ingredients.length)throw Object.assign(new Error('La receta de origen no tiene ingredientes'),{statusCode:409});
  const item=await storage.createMenuItem({...parsed.data,price:String(parsed.data.price)} as any);
  const recipe=await storage.createRecipe({menuItemId:item.id,isBase:false,name:null,notes:source.notes,productionUnit:source.productionUnit,productionYield:source.productionYield,outputInventoryItemId:null});
  const warnings:string[]=[];
  for(const original of ingredients){
    const {id,recipeId,...values}=original;
    await requireActiveInventoryReferences(db,values.inventoryItemId,values.warehouseId);
    const sub=values.subRecipeId?await storage.getRecipe(values.subRecipeId):undefined;
    if(values.subRecipeId&&(!sub||sub.isActive==='false'))throw Object.assign(new Error('La elaboración seleccionada está inactiva o no existe'),{statusCode:409});
    try{
      let cost=values.unitCost;
      if(sub){
        const output=sub.outputInventoryItemId?await storage.getInventoryItem(sub.outputInventoryItemId):undefined;
        if(sub.outputInventoryItemId)await requireActiveInventoryReferences(db,sub.outputInventoryItemId);
        const perUnit=output?Number(output.costPrice||0):await computeBaseRecipeCostPerUnit(db,sub.id);
        const factor=output?await unitFactor(db,output.id,values.unit,output.unit):inventoryUnitFactor(values.unit,sub.productionUnit||values.unit);
        cost=(perUnit*factor).toFixed(2);
      }
      await storage.createRecipeIngredient({...values,unitCost:cost,recipeId:recipe.id});
    }
    catch(error){throw error;}
  }
  return {menuItem:item,recipe:await storage.getRecipe(recipe.id),warnings};
 });
}
