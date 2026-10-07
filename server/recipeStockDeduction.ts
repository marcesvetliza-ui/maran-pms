import {inventoryUnitFactor} from './inventoryUnits';
import {consumeStockLines,queueAutomaticConsumption,type ConsumptionLine} from './inventoryStockEngine';
import type {RecipeIngredient} from '@shared/schema';
export type RecipeLookupFn=(id:string)=>Promise<{ingredients:RecipeIngredient[];productionYield:string|number|null;productionUnit?:string|null;outputInventoryItemId?:string|null}|undefined>;
export type DeductedLine={itemName:string;quantity:number;unit:string};
export type ShortfallWarning={itemName:string;required:number;available:number};
export type SkippedLine={ingredientName:string;reason:string};
export type StockDeductionResult={deducted:DeductedLine[];warnings:ShortfallWarning[];skipped:SkippedLine[]};
export type DeductionSource={sourceType:string;sourceId:string;notes:string;actor?:string};
const fail=(message:string)=>Object.assign(new Error(message),{statusCode:409});
export function grossQuantityFor(ingredient:Pick<RecipeIngredient,'quantity'|'merma'>,multiplier:number){
 const waste=Number(ingredient.merma || 0),net=Number(ingredient.quantity);
 if(!Number.isFinite(waste)||waste<0||waste>=100||!Number.isFinite(net)||net<0||!Number.isFinite(multiplier)||multiplier<0)throw fail('Cantidad, rendimiento o merma inválidos en la receta');
 return net/(1-waste/100)*multiplier;
}
export async function planIngredientsWithActualQuantities(getRecipe:RecipeLookupFn,lines:Array<{ingredient:RecipeIngredient;actualGrossQuantity:number}>):Promise<ConsumptionLine[]>{
 const result:ConsumptionLine[]=[];
 async function visit(ingredient:RecipeIngredient,quantity:number,path:Set<string>){
  if(!Number.isFinite(quantity)||quantity<0)throw fail('Cantidad de insumo inválida');
  if(ingredient.subRecipeId){
   if(path.has(ingredient.subRecipeId)||path.size>=20)throw fail('La receta tiene una referencia cíclica o demasiado profunda');
   const sub=await getRecipe(ingredient.subRecipeId);if(!sub)throw fail('Sub-receta inexistente');
   if(sub.outputInventoryItemId){result.push({itemId:sub.outputInventoryItemId,quantity,unit:ingredient.unit,warehouseId:ingredient.warehouseId,name:ingredient.ingredientName});return;}
   const yieldQty=Number(sub.productionYield || 0);if(!Number.isFinite(yieldQty)||yieldQty<=0||!sub.productionUnit)throw fail('Sub-receta sin rendimiento o unidad de producción');
   const ratio=quantity*inventoryUnitFactor(ingredient.unit,sub.productionUnit)/yieldQty;
   const next=new Set(path);next.add(ingredient.subRecipeId);
   for(const child of sub.ingredients)await visit({...child,warehouseId:ingredient.warehouseId || child.warehouseId},grossQuantityFor(child,ratio),next);
  }else result.push({itemId:ingredient.inventoryItemId,quantity,unit:ingredient.unit,warehouseId:ingredient.warehouseId,name:ingredient.ingredientName});
 }
 for(const line of lines)await visit(line.ingredient,line.actualGrossQuantity,new Set());return result;
}
export async function deductIngredientsAtMultiplier(executor:any,getRecipe:RecipeLookupFn,ingredients:RecipeIngredient[],multiplier:number,source:DeductionSource):Promise<StockDeductionResult>{
 const lines=await planIngredientsWithActualQuantities(getRecipe,ingredients.map(ingredient=>({ingredient,actualGrossQuantity:grossQuantityFor(ingredient,multiplier)})));
 return queueAutomaticConsumption(source.sourceType,source.sourceId,lines,source.actor);
}
export async function deductIngredientsWithActualQuantities(executor:any,getRecipe:RecipeLookupFn,lines:Array<{ingredient:RecipeIngredient;actualGrossQuantity:number}>,source:DeductionSource):Promise<StockDeductionResult>{
 const planned=await planIngredientsWithActualQuantities(getRecipe,lines);
 return {deducted:await consumeStockLines(executor,planned,{type:source.sourceType,id:source.sourceId,notes:source.notes,actor:source.actor,strictWarehouse:true}),warnings:[],skipped:[]};
}
