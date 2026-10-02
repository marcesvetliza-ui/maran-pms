import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "./db";
import { inventoryItems, stockMovements, type RecipeIngredient } from "@shared/schema";

type Executor = Omit<typeof db, "$client">;

export type RecipeLookupFn = (
  recipeId: string,
) => Promise<{ ingredients: RecipeIngredient[]; productionYield: string | number | null } | undefined>;

export type DeductedLine = { itemName: string; quantity: number; unit: string };
export type ShortfallWarning = { itemName: string; required: number; available: number };
export type SkippedLine = { ingredientName: string; reason: string };

export type StockDeductionResult = {
  deducted: DeductedLine[];
  warnings: ShortfallWarning[];
  skipped: SkippedLine[];
};

export type DeductionSource = { sourceType: string; sourceId: string; notes: string };

/** Cantidad bruta real (ya incluye merma) para un insumo a un multiplicador uniforme. */
export function grossQuantityFor(ingredient: Pick<RecipeIngredient, "quantity" | "merma">, multiplier: number): number {
  const merma = ingredient.merma ? parseFloat(String(ingredient.merma)) : 0;
  const net = parseFloat(String(ingredient.quantity));
  const gross = merma > 0 ? net / (1 - merma / 100) : net;
  return gross * multiplier;
}

/**
 * Descuenta stock real para UN insumo de nivel superior por la cantidad
 * bruta ya resuelta para esta operación (grossQuantity). Si el insumo es una
 * sub-receta/elaboración, expande recursivamente sus propios ingredientes en
 * la proporción teórica de la fórmula (quantity/merma), igual que siempre se
 * hizo al vender un plato — la cantidad "real" editable solo existe en el
 * insumo de primer nivel que recibe esta función, nunca más abajo.
 */
async function deductOne(
  executor: Executor,
  getRecipe: RecipeLookupFn,
  ingredient: RecipeIngredient,
  grossQuantity: number,
  source: DeductionSource,
  result: StockDeductionResult,
  depth: number,
): Promise<void> {
  if (depth > 6) return; // guard de seguridad ante recursión infinita
  const subRecipeId = (ingredient as any).subRecipeId as string | null;

  if (subRecipeId) {
    const subRecipe = await getRecipe(subRecipeId);
    if (!subRecipe) {
      result.skipped.push({ ingredientName: ingredient.ingredientName, reason: "Sub-receta no encontrada" });
      return;
    }
    const subYield = parseFloat(String(subRecipe.productionYield || "0"));
    if (subYield <= 0) {
      result.skipped.push({ ingredientName: ingredient.ingredientName, reason: "Sub-receta sin rendimiento (productionYield) definido" });
      return;
    }
    const ratio = grossQuantity / subYield;
    for (const subIngredient of subRecipe.ingredients) {
      await deductOne(executor, getRecipe, subIngredient, grossQuantityFor(subIngredient, ratio), source, result, depth + 1);
    }
    return;
  }

  if (!ingredient.inventoryItemId) {
    result.skipped.push({ ingredientName: ingredient.ingredientName, reason: "Sin vínculo con inventario" });
    return;
  }

  const [invItem] = await executor.select().from(inventoryItems).where(eq(inventoryItems.id, ingredient.inventoryItemId));
  if (!invItem) {
    result.skipped.push({ ingredientName: ingredient.ingredientName, reason: "Ítem de inventario no encontrado" });
    return;
  }

  const currentStock = parseFloat(String(invItem.currentStock ?? 0));
  if (currentStock < grossQuantity) {
    result.warnings.push({ itemName: invItem.name, required: grossQuantity, available: currentStock });
  }
  const actualDeduct = Math.min(grossQuantity, currentStock);
  if (actualDeduct <= 0) return;

  const newStock = Math.max(0, currentStock - actualDeduct);
  await executor.update(inventoryItems)
    .set({ currentStock: String(newStock) as any })
    .where(eq(inventoryItems.id, ingredient.inventoryItemId));

  await executor.insert(stockMovements).values({
    id: randomUUID(),
    itemId: ingredient.inventoryItemId,
    movementType: "consumo",
    quantity: String(actualDeduct),
    previousStock: String(currentStock),
    newStock: String(newStock),
    notes: source.notes,
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    createdAt: new Date(),
  } as any);

  result.deducted.push({ itemName: invItem.name, quantity: actualDeduct, unit: invItem.unit });
}

/** Descuenta todos los ingredientes de una receta a un multiplicador uniforme (ej. venta de N unidades de un plato). */
export async function deductIngredientsAtMultiplier(
  executor: Executor,
  getRecipe: RecipeLookupFn,
  ingredients: RecipeIngredient[],
  multiplier: number,
  source: DeductionSource,
): Promise<StockDeductionResult> {
  const result: StockDeductionResult = { deducted: [], warnings: [], skipped: [] };
  for (const ingredient of ingredients) {
    await deductOne(executor, getRecipe, ingredient, grossQuantityFor(ingredient, multiplier), source, result, 0);
  }
  return result;
}

/** Descuenta insumos de nivel superior con una cantidad bruta real editable por insumo (ej. corrida de Producción). */
export async function deductIngredientsWithActualQuantities(
  executor: Executor,
  getRecipe: RecipeLookupFn,
  lines: Array<{ ingredient: RecipeIngredient; actualGrossQuantity: number }>,
  source: DeductionSource,
): Promise<StockDeductionResult> {
  const result: StockDeductionResult = { deducted: [], warnings: [], skipped: [] };
  for (const { ingredient, actualGrossQuantity } of lines) {
    await deductOne(executor, getRecipe, ingredient, actualGrossQuantity, source, result, 0);
  }
  return result;
}
