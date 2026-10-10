import { requireActiveInventoryReferences } from "./inventoryLifecycle";
import {sql} from "drizzle-orm";
import {INVENTORY_UNITS} from './inventoryUnits';
import {stockUnits} from "./inventorySafety";
import {planIngredientsWithActualQuantities} from "./recipeStockDeduction";
import { randomUUID } from "crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  recipes, recipeIngredients, inventoryItems, stockMovements, productionRuns,
  type UnitType,
} from "@shared/schema";
import { cascadeRecipeCostsFromInventoryItem } from "./recipeCostCascade";
import {
  deductIngredientsWithActualQuantities, grossQuantityFor,
  type DeductedLine, type ShortfallWarning, type SkippedLine, type RecipeLookupFn,
} from "./recipeStockDeduction";

type Executor = Omit<typeof db, "$client">;

function buildRecipeLookup(executor: Executor): RecipeLookupFn {
  return async (recipeId: string) => {
    const [recipe] = await executor.select().from(recipes).where(eq(recipes.id, recipeId));
    if (!recipe) return undefined;
    const ingredients = await executor.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId));
    return { ingredients, productionYield: recipe.productionYield, productionUnit:recipe.productionUnit, outputInventoryItemId:recipe.outputInventoryItemId };
  };
}

export type ProducibleFormulaLine = {
  recipeIngredientId: string;
  ingredientName: string;
  inventoryItemId: string | null;
  subRecipeId: string | null;
  unit: string;
  formulaQuantity: number; // cantidad neta de la fórmula (1x lote)
  merma: number;
  grossQuantity: number;   // cantidad bruta teórica (1x lote), ya con merma aplicada
  unitCost: number;        // snapshot vigente de recipeIngredients.unitCost
};

export type ProducibleFormula = {
  isActive?: string;
  recipeId: string;
  name: string;
  productionUnit: string | null;
  productionYield: number;
  outputInventoryItemId: string;
  outputItemName: string;
  outputUnit: string;
  outputCurrentStock: number;
  outputCostPrice: number;
  notes: string | null;
  categoryId: string | null;
  lines: ProducibleFormulaLine[];
};

/** Elaboraciones Base marcadas como producibles (tienen outputInventoryItemId), con su fórmula resuelta. */
export async function getProducibleFormulas(): Promise<ProducibleFormula[]> {
  const baseRecipes = await db.select().from(recipes).where(eq(recipes.isBase, true));
  const producible = baseRecipes.filter(r => !!r.outputInventoryItemId);
  if (producible.length === 0) return [];

  const outputItems = await db.select().from(inventoryItems);
  const outputItemById = new Map(outputItems.map(i => [i.id, i]));

  const result: ProducibleFormula[] = [];
  for (const recipe of producible) {
    const outputItem = outputItemById.get(recipe.outputInventoryItemId as string);
    if (!outputItem || outputItem.isActive !== "true") continue; // el artículo de salida fue borrado — no se ofrece para registrar corridas
    const ingredients = await db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, recipe.id));
    result.push({
      recipeId: recipe.id,
      isActive: recipe.isActive,
      name: recipe.name || "Elaboración",
      productionUnit: recipe.productionUnit,
      productionYield: parseFloat(String(recipe.productionYield || "0")),
      outputInventoryItemId: outputItem.id,
      outputItemName: outputItem.name,
      outputUnit: outputItem.unit,
      outputCurrentStock: parseFloat(String(outputItem.currentStock ?? "0")),
      outputCostPrice: parseFloat(String(outputItem.costPrice ?? "0")),
      notes: recipe.notes,
      categoryId: outputItem.categoryId,
      lines: ingredients.map(ing => ({
        recipeIngredientId: ing.id,
        ingredientName: ing.ingredientName,
        inventoryItemId: ing.inventoryItemId,
        subRecipeId: ing.subRecipeId,
        unit: ing.unit,
        formulaQuantity: parseFloat(String(ing.quantity)),
        merma: parseFloat(String(ing.merma || "0")),
        grossQuantity: grossQuantityFor(ing, 1),
        unitCost: parseFloat(String(ing.unitCost || "0")),
      })),
    });
  }
  return result;
}

export type UnlinkedBaseRecipe = { recipeId: string; name: string; productionUnit: string | null; productionYield: number };

/** Elaboraciones Base que todavía no están marcadas como producibles — candidatas a vincular. */
export async function getUnlinkedBaseRecipes(): Promise<UnlinkedBaseRecipe[]> {
  const baseRecipes = await db.select().from(recipes).where(eq(recipes.isBase, true));
  return baseRecipes
    .filter(r => !r.outputInventoryItemId)
    .map(r => ({
      recipeId: r.id,
      name: r.name || "Elaboración",
      productionUnit: r.productionUnit,
      productionYield: parseFloat(String(r.productionYield || "0")),
    }));
}

async function assertBaseRecipe(recipeId: string): Promise<typeof recipes.$inferSelect> {
  const [recipe] = await db.select().from(recipes).where(eq(recipes.id, recipeId));
  if (!recipe || !recipe.isBase) throw new Error("La Elaboración Base no existe");
  return recipe;
}

/** Vincula una Elaboración Base existente a un artículo de Inventario ya creado (debe existir). */
export async function linkRecipeToOutputItem(recipeId: string, outputInventoryItemId: string): Promise<void> {
  await db.transaction(async tx=>{
    const current=await tx.execute(sql`SELECT id FROM recipes WHERE id=${recipeId} AND is_base=true FOR UPDATE`);if(!current.rows.length)throw new Error('La Elaboración Base no existe');
    await requireActiveInventoryReferences(tx, outputInventoryItemId);
    const [item]=await tx.select().from(inventoryItems).where(eq(inventoryItems.id,outputInventoryItemId));
    if(!item || item.isActive!=='true')throw new Error('El artículo de inventario no existe o está inactivo');
    await tx.update(recipes).set({outputInventoryItemId}).where(eq(recipes.id,recipeId));
  });
}

/** Crea un artículo de Inventario nuevo (tipo "semielaborado") y vincula la Elaboración Base a él. */
export async function createAndLinkOutputItem(
  recipeId: string,
  data: { name: string; unit: UnitType; categoryId?: string | null },
): Promise<string> {
  if(!INVENTORY_UNITS.includes(data.unit))throw new Error("Unidad de stock inválida");
  if (!data.name?.trim()) throw new Error("Falta el nombre del artículo producido");
  return db.transaction(async tx=>{
  const recipe=await tx.execute(sql`SELECT id FROM recipes WHERE id=${recipeId} AND is_base=true FOR UPDATE`);if(!recipe.rows.length)throw new Error("La Elaboración Base no existe");
  const [created] = await tx.insert(inventoryItems).values({
    name: data.name.trim(),
    unit: data.unit,
    categoryId: data.categoryId || null,
    itemKind: "semielaborado",
    costPrice: "0",
    currentStock: "0",
  } as any).returning();
  await tx.update(recipes).set({ outputInventoryItemId: created.id } as any).where(eq(recipes.id, recipeId));
  return created.id;
  });
}

export async function unlinkRecipeOutput(recipeId: string): Promise<void> {
  await db.transaction(async tx=>{
    const row=(await tx.execute(sql`SELECT output_inventory_item_id FROM recipes WHERE id=${recipeId} AND is_base=true FOR UPDATE`)).rows[0] as any;
    if(!row)throw new Error('Preparación inexistente');
    if(row.output_inventory_item_id){const used=(await tx.execute(sql`SELECT EXISTS(SELECT 1 FROM stock_movements WHERE item_id=${row.output_inventory_item_id}) OR EXISTS(SELECT 1 FROM recipe_ingredients WHERE sub_recipe_id=${recipeId}) OR EXISTS(SELECT 1 FROM inventory_pending_productions WHERE status='pending' AND payload->>'recipeId'=${recipeId}) AS used`)).rows[0] as any;if(used.used)throw new Error('No se puede cambiar a elaboración al momento: tiene historial, recetas vinculadas o producción pendiente');}
    await tx.update(recipes).set({outputInventoryItemId:null}).where(eq(recipes.id,recipeId));
  });
}

export type ProductionRunInputLine = { recipeIngredientId: string; actualQuantity: number; warehouseId?: string };

export type RegisterProductionRunInput = {
  date: string;
  recipeId: string;
  outputQuantity: number;
  outputWarehouseId?: string;
  requestId?:string;
  lines: ProductionRunInputLine[];
  notes?: string | null;
  registeredBy?: string | null;
};

export type RegisterProductionRunResult = {
  run: typeof productionRuns.$inferSelect;
  deducted: DeductedLine[];
  warnings: ShortfallWarning[];
  skipped: SkippedLine[];
};

/**
 * Registra una corrida real de producción: descuenta stock real de cada
 * insumo de primer nivel de la fórmula por la cantidad REAL informada (puede
 * diferir de la teórica — merma real del día), suma stock al artículo
 * producido y fija su costo unitario (costo total consumido / cantidad real
 * obtenida), propagando ese costo a cualquier receta que ya use ese artículo
 * (cascadeRecipeCostsFromInventoryItem). Si falta stock o configuración,
 * se rechaza toda la corrida sin descontar insumos ni ingresar producción.
 */
export async function registerProductionRun(input: RegisterProductionRunInput): Promise<RegisterProductionRunResult> {
  if (!Number.isFinite(input.outputQuantity) || input.outputQuantity <= 0) {
    throw new Error("La cantidad producida debe ser mayor a cero");
  }
  stockUnits(input.outputQuantity);
  if(!input.outputWarehouseId)throw new Error('Elegí el depósito de destino de lo producido');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||Number.isNaN(Date.parse(input.date))||new Date(input.date).toISOString().slice(0,10)!==input.date)throw new Error('Fecha de producción inválida');
  if(!Array.isArray(input.lines)||new Set(input.lines.map(l=>l.recipeIngredientId)).size!==input.lines.length)throw new Error('Insumos repetidos o inválidos');
  return db.transaction(async (tx) => {
  if(input.requestId){
    if(!/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId))throw new Error('Identificador de operación inválido');
    const payload={date:input.date,recipeId:input.recipeId,outputQuantity:input.outputQuantity,outputWarehouseId:input.outputWarehouseId,lines:input.lines,notes:input.notes || null};
    await tx.execute(sql`INSERT INTO inventory_production_requests(request_id,payload) VALUES(${input.requestId},${JSON.stringify(payload)}) ON CONFLICT DO NOTHING`);
    const guard=await tx.execute(sql`SELECT *,payload=${JSON.stringify(payload)}::jsonb AS matches FROM inventory_production_requests WHERE request_id=${input.requestId} FOR UPDATE`);
    if(!guard.rows[0].matches)throw new Error('Este identificador ya corresponde a otra producción');
    if(guard.rows[0].run_id){const [run]=await tx.select().from(productionRuns).where(eq(productionRuns.id,String(guard.rows[0].run_id)));return {run,deducted:[],warnings:[],skipped:[]};}
  }
  await tx.execute(sql`SELECT id FROM recipes WHERE id=${input.recipeId} FOR SHARE`);
  const [recipe]=await tx.select().from(recipes).where(eq(recipes.id,input.recipeId));
  if(!recipe || !recipe.isBase || recipe.isActive === 'false')throw new Error('La Elaboración Base no existe o está inactiva');
  if (!recipe.outputInventoryItemId) {
    throw new Error("Esta Elaboración Base no está marcada como producible");
  }

  const formulaIngredients = await tx.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, input.recipeId));
  if (formulaIngredients.length === 0) throw new Error("La fórmula no tiene insumos cargados");
  if(input.lines.length!==formulaIngredients.length || !input.lines.some(l=>l.actualQuantity>0))throw new Error('Informá todos los insumos de la fórmula y al menos un consumo positivo');

  const actualByIngredientId = new Map(input.lines.map(l => [l.recipeIngredientId, l.actualQuantity]));
  for (const ing of formulaIngredients) {
    const qty = actualByIngredientId.get(ing.id);
    if (qty === undefined) throw new Error(`Falta la cantidad real de "${ing.ingredientName}"`);
    if (!Number.isFinite(qty) || qty < 0) throw new Error(`Cantidad inválida para "${ing.ingredientName}"`);
  }

  const outputInventoryItemId = recipe.outputInventoryItemId;
  const runId = randomUUID();

    const deductionLines = formulaIngredients.map(ing => ({
      ingredient: {...ing,warehouseId: input.lines.find(l=>l.recipeIngredientId===ing.id)?.warehouseId || null},
      actualGrossQuantity: actualByIngredientId.get(ing.id)!,
    }));
    const planned=await planIngredientsWithActualQuantities(buildRecipeLookup(tx),deductionLines);
    if(planned.some(l=>l.itemId===outputInventoryItemId))throw new Error('La elaboración no puede consumir su propio artículo de salida');
    for(const id of [...new Set([outputInventoryItemId,...planned.map(l=>l.itemId).filter((v):v is string=>!!v)])].sort()) await tx.execute(sql`SELECT id FROM inventory_items WHERE id=${id} FOR UPDATE`);
    const destination=await tx.execute(sql`SELECT id FROM inventory_warehouses WHERE id=${input.outputWarehouseId} AND is_active='true' FOR SHARE`);
    if(!destination.rows.length)throw new Error('Depósito de destino inexistente o inactivo');
    const deduction = await deductIngredientsWithActualQuantities(tx, buildRecipeLookup(tx), deductionLines, {
      sourceType: "production_run",
      sourceId: runId,
      notes: `Producción — ${recipe.name || "Elaboración"}`,
      actor:input.registeredBy || undefined,
    });

    const totalCost=deduction.deducted.reduce((sum,line)=>sum+line.quantity*Number((line as any).unitCost || 0),0);
    const outputUnitCost = totalCost / input.outputQuantity;

    const [outputItem] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, outputInventoryItemId));
    if (!outputItem || outputItem.isActive!=="true") throw new Error("El artículo de salida de esta producción ya no existe");
    const prevStock = parseFloat(String(outputItem.currentStock ?? "0"));
    const newStock = prevStock + input.outputQuantity;
    const stockUnitCost = prevStock > 0 ? (prevStock * Number(outputItem.costPrice || 0) + totalCost) / newStock : outputUnitCost;

    const previousWarehouse=await tx.execute(sql`SELECT current_stock FROM warehouse_stock WHERE item_id=${outputInventoryItemId} AND warehouse_id=${input.outputWarehouseId} FOR UPDATE`);
    const whPrev=Number(previousWarehouse.rows[0]?.current_stock ?? 0);
    await tx.execute(sql`INSERT INTO warehouse_stock(item_id,warehouse_id,current_stock,updated_at) VALUES(${outputInventoryItemId},${input.outputWarehouseId},${input.outputQuantity},now()) ON CONFLICT(item_id,warehouse_id) DO UPDATE SET current_stock=warehouse_stock.current_stock+EXCLUDED.current_stock,updated_at=now()`);
    await tx.update(inventoryItems)
      .set({ currentStock: String(newStock), costPrice: stockUnitCost.toFixed(4) } as any)
      .where(eq(inventoryItems.id, outputInventoryItemId));

    await tx.insert(stockMovements).values({
      id: randomUUID(),
      itemId: outputInventoryItemId,
      movementType: "entrada",
      quantity: String(input.outputQuantity),
      previousStock: String(whPrev),
      newStock: String(whPrev + input.outputQuantity),
      warehouseId:input.outputWarehouseId,
      createdBy:input.registeredBy || null,
      unitCost: outputUnitCost.toFixed(2),
      notes: `Producción — ${recipe.name || "Elaboración"}`,
      sourceType: "production_run",
      sourceId: runId,
      createdAt: new Date(),
    } as any);

    await cascadeRecipeCostsFromInventoryItem(tx, outputInventoryItemId, stockUnitCost);

    const inputsSnapshot = formulaIngredients.map(ing => {
      const actual = actualByIngredientId.get(ing.id)!;
      const unitCost = parseFloat(String(ing.unitCost || "0"));
      return {
        recipeIngredientId: ing.id,
        ingredientName: ing.ingredientName,
        inventoryItemId: ing.inventoryItemId,
        subRecipeId: ing.subRecipeId,
        unit: ing.unit,
        quantityFormula: grossQuantityFor(ing, 1),
        quantityActual: actual,
        warehouseId:input.lines.find(l=>l.recipeIngredientId===ing.id)?.warehouseId,
        unitCost,
        totalCost: actual * unitCost,
      };
    });

    const notices = (deduction.warnings.length || deduction.skipped.length)
      ? { shortfalls: deduction.warnings, skipped: deduction.skipped }
      : null;

    const [run] = await tx.insert(productionRuns).values({
      id: runId,
      date: input.date,
      recipeId: input.recipeId,
      outputInventoryItemId,
      outputQuantity: String(input.outputQuantity),
      outputUnitCost: outputUnitCost.toFixed(4),
      totalCost: totalCost.toFixed(2),
      inputs: inputsSnapshot,
      warnings: {...(notices || {}),deductions:deduction.deducted},
      notes: input.notes || null,
      registeredBy: input.registeredBy || null,
    } as any).returning();

    if(input.requestId)await tx.execute(sql`UPDATE inventory_production_requests SET run_id=${run.id} WHERE request_id=${input.requestId}`);
    return { run, deducted: deduction.deducted, warnings: deduction.warnings, skipped: deduction.skipped };
  });
}

export type ProductionRunHistoryRow = {
  id: string;
  date: string;
  recipeId: string;
  recipeName: string;
  outputInventoryItemId: string;
  outputItemName: string;
  outputQuantity: number;
  outputUnit: string;
  outputUnitCost: number;
  totalCost: number;
  notes: string | null;
  registeredBy: string | null;
  createdAt: Date;
};

export async function getProductionRunHistory(limit = 100): Promise<ProductionRunHistoryRow[]> {
  const runs = await db.select().from(productionRuns).orderBy(desc(productionRuns.createdAt)).limit(limit);
  if (runs.length === 0) return [];

  const recipeIds = [...new Set(runs.map(r => r.recipeId))];
  const itemIds = [...new Set(runs.map(r => r.outputInventoryItemId))];
  const recipeRows = await db.select().from(recipes).where(inArray(recipes.id, recipeIds));
  const itemRows = await db.select().from(inventoryItems).where(inArray(inventoryItems.id, itemIds));
  const recipeById = new Map(recipeRows.map(r => [r.id, r]));
  const itemById = new Map(itemRows.map(i => [i.id, i]));

  return runs.map(r => ({
    id: r.id,
    date: r.date,
    recipeId: r.recipeId,
    recipeName: recipeById.get(r.recipeId)?.name || "Elaboración",
    outputInventoryItemId: r.outputInventoryItemId,
    outputItemName: itemById.get(r.outputInventoryItemId)?.name || "Artículo",
    outputQuantity: parseFloat(String(r.outputQuantity)),
    outputUnit: itemById.get(r.outputInventoryItemId)?.unit || "",
    outputUnitCost: parseFloat(String(r.outputUnitCost)),
    totalCost: parseFloat(String(r.totalCost)),
    notes: r.notes,
    registeredBy: r.registeredBy,
    createdAt: r.createdAt,
  }));
}
