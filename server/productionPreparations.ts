import {sql} from 'drizzle-orm';
import {db,withDatabaseTransaction} from './db';
import {INVENTORY_UNITS} from './inventoryUnits';
import {unitFactor} from './inventoryStockEngine';
import {validateItemClassification,catalogLock} from './inventoryCatalog';
import {computeBaseRecipeCostPerUnit} from './recipeCostCascade';
export async function savePreparation(input:any,id?:string,actor?:string){
 if(!input.name?.trim()||!INVENTORY_UNITS.includes(input.unit)||!Number.isFinite(Number(input.yield))||Number(input.yield)<=0)throw new Error('Indicá nombre, unidad y rendimiento positivo');
 if(!Array.isArray(input.lines)||!input.lines.length)throw new Error('Agregá al menos un ingrediente');
 return withDatabaseTransaction(async()=>{
  await catalogLock();
  const old=id?(await db.execute(sql`SELECT * FROM recipes WHERE id=${id} AND is_base=true FOR UPDATE`)).rows[0] as any:null;
  if(id&&!old)throw new Error('Preparación inexistente');
  if(old&&!old.output_inventory_item_id)throw new Error('Esta receta no es una preparación con stock');
  if(!input.categoryId&&!old)throw new Error('Elegí el subagrupamiento del artículo producido');
  if(input.categoryId)await validateItemClassification({categoryId:input.categoryId},old?.output_inventory_item_id);
  const output=old?(await db.execute(sql`SELECT * FROM inventory_items WHERE id=${old.output_inventory_item_id} FOR UPDATE`)).rows[0] as any:null;
  if(old&&(!output||output.is_active!=='true'))throw new Error('El artículo producido está inactivo');
  if(output&&output.unit!==input.unit)throw new Error('La unidad de una preparación existente no puede cambiarse');
  const lines=[];
  for(const line of input.lines){
   if(!!line.itemId===!!line.subRecipeId||!Number.isFinite(Number(line.quantity))||Number(line.quantity)<=0||!INVENTORY_UNITS.includes(line.unit)||!Number.isFinite(Number(line.merma??0))||Number(line.merma??0)<0||Number(line.merma??0)>=100)throw new Error('Ingrediente, cantidad, unidad o merma inválidos');
   let name:string,cost:number;
   if(line.itemId){const item=(await db.execute(sql`SELECT * FROM inventory_items WHERE id=${line.itemId} FOR SHARE`)).rows[0] as any;
    if(!item||item.is_active!=='true'||!['materia_prima','venta_directa','semielaborado'].includes(item.item_kind)||item.id===output?.id)throw new Error('Elegí un insumo físico activo; la preparación no puede consumirse a sí misma');
    name=item.name;cost=Number(item.cost_price||0)*await unitFactor(db,item.id,line.unit,item.unit);
   }else{const sub=(await db.execute(sql`SELECT * FROM recipes WHERE id=${line.subRecipeId} AND is_base=true FOR SHARE`)).rows[0] as any;if(!sub||sub.id===id)throw new Error('Elaboración inválida o circular');
    const seen=new Set<string>();async function check(recipeId:string,path=new Set<string>()){if(recipeId===id||path.has(recipeId)||path.size>=20)throw new Error('Referencia circular entre preparaciones');if(seen.has(recipeId))return;const next=new Set(path);next.add(recipeId);for(const child of (await db.execute(sql`SELECT sub_recipe_id,inventory_item_id FROM recipe_ingredients WHERE recipe_id=${recipeId}`)).rows as any[]){if(output?.id&&child.inventory_item_id===output.id)throw new Error('La preparación no puede consumir su propio artículo');if(child.sub_recipe_id)await check(child.sub_recipe_id,next);}seen.add(recipeId);}
    await check(sub.id);name=sub.name;
    if(sub.output_inventory_item_id){const item=(await db.execute(sql`SELECT * FROM inventory_items WHERE id=${sub.output_inventory_item_id}`)).rows[0] as any;if(!item||item.is_active!=='true'||item.id===output?.id)throw new Error('Preparación de ingrediente inválida');cost=Number(item.cost_price||0)*await unitFactor(db,item.id,line.unit,item.unit);}
    else{const {inventoryUnitFactor}=await import('./inventoryUnits');cost=await computeBaseRecipeCostPerUnit(db,sub.id)*inventoryUnitFactor(line.unit,sub.production_unit);}
   }
   lines.push({...line,name,cost});
  }
  const outputId=output?.id??(await db.execute(sql`INSERT INTO inventory_items(name,unit,item_kind,current_stock,cost_price,category_id) VALUES(${input.name.trim()},${input.unit},'semielaborado',0,0,${input.categoryId}) RETURNING id`)).rows[0].id;
  const recipeId=id??(await db.execute(sql`INSERT INTO recipes(name,is_base,production_unit,production_yield,output_inventory_item_id,notes) VALUES(${input.name.trim()},true,${input.unit},${Number(input.yield)},${outputId},${input.notes||null}) RETURNING id`)).rows[0].id;
  if(id){await db.execute(sql`UPDATE recipes SET name=${input.name.trim()},production_yield=${Number(input.yield)},notes=${input.notes||null} WHERE id=${id}`);await db.execute(sql`UPDATE inventory_items SET name=${input.name.trim()},category_id=${input.categoryId||output.category_id} WHERE id=${outputId}`);await db.execute(sql`DELETE FROM recipe_ingredients WHERE recipe_id=${id}`);}
  for(const line of lines)await db.execute(sql`INSERT INTO recipe_ingredients(recipe_id,inventory_item_id,sub_recipe_id,ingredient_name,quantity,unit,unit_cost,merma) VALUES(${recipeId},${line.itemId||null},${line.subRecipeId||null},${line.name},${Number(line.quantity)},${line.unit},${line.cost},${Number(line.merma||0)})`);
  if(actor)await db.execute(sql`INSERT INTO audit_logs(user_id,action,module,entity_type,entity_id,description,details,timestamp) VALUES(${actor},${id?'update':'create'},'inventory','production_preparation',${recipeId},'Preparación guardada sin movimientos de stock',${JSON.stringify({before:old,after:{...input,outputInventoryItemId:outputId}})},now())`);
  return {recipeId,outputInventoryItemId:outputId};
 });
}
