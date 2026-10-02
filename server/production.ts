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
    return { ingredients, productionYield: recipe.productionYield };
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
  recipeId: string;
  name: string;
  productionUnit: string | null;
  productionYield: number;
  outputInventoryItemId: string;
  outputItemName: string;
  outputUnit: string;
  outputCurrentStock: number;
  outputCostPrice: number;
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
    if (!outputItem) continue; // el artículo de salida fue borrado — no se ofrece para registrar corridas
    const ingredients = await db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, recipe.id));
    result.push({
      recipeId: recipe.id,
      name: recipe.name || "Elaboración",
      productionUnit: recipe.productionUnit,
      productionYield: parseFloat(String(recipe.productionYield || "0")),
      outputInventoryItemId: outputItem.id,
      outputItemName: outputItem.name,
      outputUnit: outputItem.unit,
      outputCurrentStock: parseFloat(String(outputItem.currentStock ?? "0")),
      outputCostPrice: parseFloat(String(outputItem.costPrice ?? "0")),
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
  await assertBaseRecipe(recipeId);
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, outputInventoryItemId));
  if (!item) throw new Error("El artículo de inventario no existe");
  await db.update(recipes).set({ outputInventoryItemId } as any).where(eq(recipes.id, recipeId));
}

/** Crea un artículo de Inventario nuevo (tipo "semielaborado") y vincula la Elaboración Base a él. */
export async function createAndLinkOutputItem(
  recipeId: string,
  data: { name: string; unit: UnitType; categoryId?: string | null },
): Promise<string> {
  await assertBaseRecipe(recipeId);
  if (!data.name?.trim()) throw new Error("Falta el nombre del artículo producido");
  const [created] = await db.insert(inventoryItems).values({
    name: data.name.trim(),
    unit: data.unit,
    categoryId: data.categoryId || null,
    itemKind: "semielaborado",
    costPrice: "0",
    currentStock: "0",
  } as any).returning();
  await db.update(recipes).set({ outputInventoryItemId: created.id } as any).where(eq(recipes.id, recipeId));
  return created.id;
}

export async function unlinkRecipeOutput(recipeId: string): Promise<void> {
  await assertBaseRecipe(recipeId);
  await db.update(recipes).set({ outputInventoryItemId: null } as any).where(eq(recipes.id, recipeId));
}

export type ProductionRunInputLine = { recipeIngredientId: string; actualQuantity: number };

export type RegisterProductionRunInput = {
  date: string;
  recipeId: string;
  outputQuantity: number;
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
 * (cascadeRecipeCostsFromInventoryItem). La falta de stock de un insumo
 * nunca bloquea la corrida — se avisa (warnings) y se descuenta lo
 * disponible, igual que en el descuento automático al vender un plato.
 */
export async function registerProductionRun(input: RegisterProductionRunInput): Promise<RegisterProductionRunResult> {
  if (!Number.isFinite(input.outputQuantity) || input.outputQuantity <= 0) {
    throw new Error("La cantidad producida debe ser mayor a cero");
  }
  const recipe = await assertBaseRecipe(input.recipeId);
  if (!recipe.outputInventoryItemId) {
    throw new Error("Esta Elaboración Base no está marcada como producible");
  }

  const formulaIngredients = await db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, input.recipeId));
  if (formulaIngredients.length === 0) throw new Error("La fórmula no tiene insumos cargados");

  const actualByIngredientId = new Map(input.lines.map(l => [l.recipeIngredientId, l.actualQuantity]));
  for (const ing of formulaIngredients) {
    const qty = actualByIngredientId.get(ing.id);
    if (qty === undefined) throw new Error(`Falta la cantidad real de "${ing.ingredientName}"`);
    if (!Number.isFinite(qty) || qty < 0) throw new Error(`Cantidad inválida para "${ing.ingredientName}"`);
  }

  const outputInventoryItemId = recipe.outputInventoryItemId;
  const runId = randomUUID();

  return db.transaction(async (tx) => {
    const deductionLines = formulaIngredients.map(ing => ({
      ingredient: ing,
      actualGrossQuantity: actualByIngredientId.get(ing.id)!,
    }));
    const deduction = await deductIngredientsWithActualQuantities(tx, buildRecipeLookup(tx), deductionLines, {
      sourceType: "production_run",
      sourceId: runId,
      notes: `Producción — ${recipe.name || "Elaboración"}`,
    });

    const totalCost = formulaIngredients.reduce((sum, ing) => {
      const qty = actualByIngredientId.get(ing.id)!;
      const unitCost = parseFloat(String(ing.unitCost || "0"));
      return sum + qty * unitCost;
    }, 0);
    const outputUnitCost = totalCost / input.outputQuantity;

    const [outputItem] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, outputInventoryItemId));
    if (!outputItem) throw new Error("El artículo de salida de esta producción ya no existe");
    const prevStock = parseFloat(String(outputItem.currentStock ?? "0"));
    const newStock = prevStock + input.outputQuantity;

    await tx.update(inventoryItems)
      .set({ currentStock: String(newStock), costPrice: outputUnitCost.toFixed(4) } as any)
      .where(eq(inventoryItems.id, outputInventoryItemId));

    await tx.insert(stockMovements).values({
      id: randomUUID(),
      itemId: outputInventoryItemId,
      movementType: "entrada",
      quantity: String(input.outputQuantity),
      previousStock: String(prevStock),
      newStock: String(newStock),
      unitCost: outputUnitCost.toFixed(2),
      notes: `Producción — ${recipe.name || "Elaboración"}`,
      sourceType: "production_run",
      sourceId: runId,
      createdAt: new Date(),
    } as any);

    await cascadeRecipeCostsFromInventoryItem(tx, outputInventoryItemId, outputUnitCost);

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
      warnings: notices,
      notes: input.notes || null,
      registeredBy: input.registeredBy || null,
    } as any).returning();

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
