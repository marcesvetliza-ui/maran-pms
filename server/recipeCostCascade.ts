import { eq } from "drizzle-orm";
import { db } from "./db";
import { recipes, recipeIngredients } from "@shared/schema";

type Executor = Omit<typeof db, "$client">;

/**
 * Costo total de los ingredientes de una receta, aplicando merma (la
 * cantidad bruta real = cantidad / (1 - merma/100)) — misma fórmula que usa
 * el cliente en recetas-costos.tsx.
 */
export async function computeRecipeTotalCost(executor: Executor, recipeId: string): Promise<number> {
  const ingredients = await executor
    .select()
    .from(recipeIngredients)
    .where(eq(recipeIngredients.recipeId, recipeId));

  return ingredients.reduce((sum, ing) => {
    const qty = parseFloat(String(ing.quantity));
    const cost = parseFloat(String(ing.unitCost || "0"));
    const merma = parseFloat(String(ing.merma || "0"));
    const grossQty = merma > 0 ? qty / (1 - merma / 100) : qty;
    return sum + grossQty * cost;
  }, 0);
}

/**
 * Costo por unidad producida de una Elaboración Base (isBase=true): costo
 * total de sus ingredientes dividido su rinde (productionYield). Devuelve 0
 * si la receta no existe, no es una Elaboración Base, o no tiene rinde
 * cargado.
 */
export async function computeBaseRecipeCostPerUnit(executor: Executor, recipeId: string): Promise<number> {
  const [recipe] = await executor.select().from(recipes).where(eq(recipes.id, recipeId));
  if (!recipe || !recipe.isBase) return 0;
  const yieldQty = parseFloat(String(recipe.productionYield || "0"));
  if (yieldQty <= 0) return 0;
  const totalCost = await computeRecipeTotalCost(executor, recipeId);
  return totalCost / yieldQty;
}

/**
 * El costo de un ingrediente de receta (recipeIngredients.unitCost) es una
 * foto del costo del artículo/elaboración al momento de agregarlo — igual
 * que el costo de una Elaboración Base es una foto de sus ingredientes al
 * momento de armarla. Sin esto, cuando Compras carga un remito con un costo
 * nuevo, ese costo nunca llega a las recetas que ya existían: quedan
 * mostrando un costo viejo para siempre, en silencio.
 *
 * Esta función recorre en cascada todo lo que depende, directa o
 * transitivamente, del costo de un artículo de inventario:
 *   artículo → ingredientes que lo usan directo → Elaboraciones Base
 *   afectadas → ingredientes que usan esas elaboraciones → ... (recursivo,
 *   porque una Elaboración Base puede tener como ingrediente a otra)
 * y deja el unitCost de cada recipeIngredient afectado al día.
 *
 * Debe llamarse con el mismo executor (db o una tx) que acaba de escribir
 * el nuevo costPrice del artículo, para que todo quede atómico junto con
 * esa escritura.
 */
export async function cascadeRecipeCostsFromInventoryItem(
  executor: Executor,
  inventoryItemId: string,
  newCost: number,
): Promise<void> {
  if (!Number.isFinite(newCost) || newCost < 0) return;

  const newCostStr = newCost.toFixed(4);
  await executor
    .update(recipeIngredients)
    .set({ unitCost: newCostStr })
    .where(eq(recipeIngredients.inventoryItemId, inventoryItemId));

  const directRows = await executor
    .select({ recipeId: recipeIngredients.recipeId })
    .from(recipeIngredients)
    .where(eq(recipeIngredients.inventoryItemId, inventoryItemId));

  const dirty = new Set(directRows.map((r) => r.recipeId));
  const processed = new Set<string>();

  while (dirty.size > 0) {
    const recipeId = dirty.values().next().value as string;
    dirty.delete(recipeId);
    if (processed.has(recipeId)) continue;
    processed.add(recipeId);

    const [recipe] = await executor.select().from(recipes).where(eq(recipes.id, recipeId));
    // Solo una Elaboración Base (isBase) tiene un "costo por unidad producida"
    // que otras recetas puedan tomar como ingrediente — un plato de menú no
    // se usa nunca como sub-receta, así que no hay nada más que propagar.
    if (!recipe || !recipe.isBase) continue;

    const yieldQty = parseFloat(String(recipe.productionYield || "0"));
    if (yieldQty <= 0) continue;

    const newCostPerUnit = await computeBaseRecipeCostPerUnit(executor, recipeId);
    const newCostPerUnitStr = newCostPerUnit.toFixed(4);

    const dependents = await executor
      .select()
      .from(recipeIngredients)
      .where(eq(recipeIngredients.subRecipeId, recipeId));

    for (const dep of dependents) {
      const prevCost = parseFloat(String(dep.unitCost || "0"));
      // Comparar redondeado a centavos: la columna es numeric(10,2), así que
      // una diferencia menor nunca se refleja y seguir propagando no aporta
      // nada (y en un ciclo mal armado, podría no terminar nunca).
      if (Math.round(prevCost * 100) === Math.round(newCostPerUnit * 100)) continue;
      await executor
        .update(recipeIngredients)
        .set({ unitCost: newCostPerUnitStr })
        .where(eq(recipeIngredients.id, dep.id));
      dirty.add(dep.recipeId);
    }
  }
}
