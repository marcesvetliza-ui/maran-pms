/**
 * El costo de un ingrediente de receta (recipeIngredients.unitCost) era una
 * foto fija del costo del artículo/elaboración al momento de agregarlo:
 * cuando Compras cargaba un remito con un costo nuevo, el costo del
 * artículo de Inventario se actualizaba solo, pero ninguna receta que ya
 * usara ese artículo se enteraba — quedaban mostrando un costo viejo para
 * siempre, en silencio, hasta que alguien entrara a mano a cada receta.
 *
 * Este test arma una cadena real de tres niveles —
 *   materia prima → Elaboración A (la usa) → Elaboración B (usa A) → receta
 *   de un plato de menú (usa B)
 * — cambia el costo de la materia prima, y confirma que el costo se
 * propaga correctamente hasta el final de la cadena, con los números
 * exactos que da la fórmula (no solo "cambió").
 */

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;

suite("PostgreSQL real: cascada de costos de recetas al cambiar el costo de un artículo", () => {
  let storage: typeof import("../db-storage").storage;
  let rawMaterialId: string;
  let elabAId: string;
  let elabBId: string;
  let platoRecipeId: string;
  let ingInA: string;
  let ingAInB: string;
  let ingBInPlato: string;
  const cleanupItemIds: string[] = [];
  const cleanupRecipeIds: string[] = [];

  beforeAll(async () => {
    if (!pool) return;
    ({ storage } = await import("../db-storage"));

    // Materia prima: 1000 $/kg para empezar.
    const rawMaterial = await storage.createInventoryItem({
      sku: `TEST-CASCADE-${randomUUID().slice(0, 8)}`,
      name: "Harina Test Cascada",
      unit: "kg",
      costPrice: "1000",
      itemKind: "materia_prima",
    } as any);
    rawMaterialId = rawMaterial.id;
    cleanupItemIds.push(rawMaterialId);

    // Elaboración A: rinde 10 kg, usa 2 kg de la materia prima (costo = 2 * 1000 = 2000; costo/u = 200).
    const elabA = await storage.createRecipe({
      isBase: true, name: "Elaboración A Test", productionUnit: "kg", productionYield: "10",
    } as any);
    elabAId = elabA.id;
    cleanupRecipeIds.push(elabAId);
    const ingA = await storage.createRecipeIngredient({
      recipeId: elabAId, inventoryItemId: rawMaterialId, ingredientName: "Harina Test Cascada",
      quantity: "2", unit: "kg", unitCost: "1000",
    } as any);
    ingInA = ingA.id;

    // Elaboración B: rinde 5 kg, usa 1 kg de Elaboración A (costo inicial 200, lo que sea al armar).
    const elabB = await storage.createRecipe({
      isBase: true, name: "Elaboración B Test", productionUnit: "kg", productionYield: "5",
    } as any);
    elabBId = elabB.id;
    cleanupRecipeIds.push(elabBId);
    const ingB = await storage.createRecipeIngredient({
      recipeId: elabBId, subRecipeId: elabAId, ingredientName: "Elaboración A Test",
      quantity: "1", unit: "kg", unitCost: "200",
    } as any);
    ingAInB = ingB.id;

    // Receta de un plato (no isBase): usa 0.5 kg de Elaboración B.
    const platoRecipe = await storage.createRecipe({ isBase: false } as any);
    platoRecipeId = platoRecipe.id;
    cleanupRecipeIds.push(platoRecipeId);
    const ingPlato = await storage.createRecipeIngredient({
      recipeId: platoRecipeId, subRecipeId: elabBId, ingredientName: "Elaboración B Test",
      quantity: "0.5", unit: "kg", unitCost: "40",
    } as any);
    ingBInPlato = ingPlato.id;
  });

  afterAll(async () => {
    if (!pool) return;
    for (const recipeId of cleanupRecipeIds) {
      await pool.query("DELETE FROM recipe_ingredients WHERE recipe_id = $1", [recipeId]);
    }
    for (const recipeId of cleanupRecipeIds) {
      await pool.query("DELETE FROM recipes WHERE id = $1", [recipeId]);
    }
    for (const itemId of cleanupItemIds) {
      await pool.query("DELETE FROM inventory_items WHERE id = $1", [itemId]);
    }
    await pool.end();
  });

  it("propaga el costo nuevo de la materia prima hasta el ingrediente de la receta del plato, pasando por las dos elaboraciones", async () => {
    if (!pool) return;

    // Subo el costo de la materia prima de 1000 a 1500 $/kg.
    await storage.updateInventoryItem(rawMaterialId, { costPrice: "1500" } as any);

    const ingARow = await pool.query("SELECT unit_cost FROM recipe_ingredients WHERE id = $1", [ingInA]);
    expect(Number(ingARow.rows[0].unit_cost)).toBe(1500);

    // Elaboración A: 2 kg * 1500 = 3000 de costo total / 10 kg de rinde = 300 $/kg.
    const ingBRow = await pool.query("SELECT unit_cost FROM recipe_ingredients WHERE id = $1", [ingAInB]);
    expect(Number(ingBRow.rows[0].unit_cost)).toBe(300);

    // Elaboración B: 1 kg * 300 = 300 de costo total / 5 kg de rinde = 60 $/kg.
    const ingPlatoRow = await pool.query("SELECT unit_cost FROM recipe_ingredients WHERE id = $1", [ingBInPlato]);
    expect(Number(ingPlatoRow.rows[0].unit_cost)).toBe(60);
  });
});
