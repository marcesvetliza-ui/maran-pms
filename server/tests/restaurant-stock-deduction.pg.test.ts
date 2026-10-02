/**
 * Regresión del descuento automático de stock al cerrar una comanda de
 * Restaurant (storage.deductStockFromOrder). Esta lógica no tenía cobertura
 * propia — se extrajo a server/recipeStockDeduction.ts (compartida con
 * Producción) y este test fija el comportamiento exacto de antes: expande
 * recursivamente una sub-receta/elaboración anidada, aplicando merma en cada
 * nivel, y descuenta la materia prima final en la cantidad bruta correcta.
 */

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;

suite("PostgreSQL real: descuento de stock al vender un plato (con sub-receta anidada)", () => {
  let storage: typeof import("../db-storage").storage;
  const cleanupItemIds: string[] = [];
  const cleanupRecipeIds: string[] = [];
  const cleanupMenuItemIds: string[] = [];
  const cleanupMenuCategoryIds: string[] = [];
  const fakeOrderId = randomUUID();

  beforeAll(async () => {
    if (!pool) return;
    ({ storage } = await import("../db-storage"));
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM stock_movements WHERE source_type = 'restaurant_order' AND source_id = $1", [fakeOrderId]);
    for (const id of cleanupMenuItemIds) await pool.query("DELETE FROM menu_items WHERE id = $1", [id]);
    for (const id of cleanupMenuCategoryIds) await pool.query("DELETE FROM menu_categories WHERE id = $1", [id]);
    for (const recipeId of cleanupRecipeIds) await pool.query("DELETE FROM recipe_ingredients WHERE recipe_id = $1", [recipeId]);
    for (const recipeId of cleanupRecipeIds) await pool.query("DELETE FROM recipes WHERE id = $1", [recipeId]);
    for (const itemId of cleanupItemIds) await pool.query("DELETE FROM inventory_items WHERE id = $1", [itemId]);
    await pool.end();
  });

  it("descuenta la materia prima en la cantidad bruta correcta, expandiendo recursivamente la elaboración anidada", async () => {
    if (!pool) return;

    const rawMaterial = await storage.createInventoryItem({
      sku: `TEST-DEDUCT-${randomUUID().slice(0, 8)}`, name: "Materia Prima Test Descuento",
      unit: "kg", costPrice: "100", currentStock: "100", itemKind: "materia_prima",
    } as any);
    cleanupItemIds.push(rawMaterial.id);

    // Elaboración: rinde 10kg, usa 4kg de materia prima por lote con 20% de merma
    // (bruto teórico = 4 / 0.8 = 5kg por lote).
    const elaboracion = await storage.createRecipe({
      isBase: true, name: "Elaboración Test Descuento", productionUnit: "kg", productionYield: "10",
    } as any);
    cleanupRecipeIds.push(elaboracion.id);
    await storage.createRecipeIngredient({
      recipeId: elaboracion.id, inventoryItemId: rawMaterial.id, ingredientName: "Materia Prima Test Descuento",
      quantity: "4", unit: "kg", unitCost: "100", merma: "20",
    } as any);

    const category = await storage.createMenuCategory({ name: `Test Descuento Cat ${randomUUID().slice(0, 6)}` } as any);
    cleanupMenuCategoryIds.push(category.id);
    const menuItem = await storage.createMenuItem({
      categoryId: category.id, name: "Plato Test Descuento", price: "1000",
    } as any);
    cleanupMenuItemIds.push(menuItem.id);
    if ((menuItem as any).inventoryItemId) cleanupItemIds.push((menuItem as any).inventoryItemId);

    // Receta del plato: usa 2kg (sin merma) de la elaboración por unidad vendida.
    const platoRecipe = await storage.createRecipe({ isBase: false, menuItemId: menuItem.id } as any);
    cleanupRecipeIds.push(platoRecipe.id);
    await storage.createRecipeIngredient({
      recipeId: platoRecipe.id, subRecipeId: elaboracion.id, ingredientName: "Elaboración Test Descuento",
      quantity: "2", unit: "kg", unitCost: "50",
    } as any);

    // Se venden 3 unidades del plato:
    //   ratio por unidad = (2kg / 10kg rinde) = 0.2 → 3 unidades = 0.6
    //   materia prima descontada = 5kg (bruto teórico del lote) * 0.6 = 3kg
    const result = await storage.deductStockFromOrder(fakeOrderId, [{ menuItemId: menuItem.id, quantity: 3 }]);

    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.deducted).toEqual([{ itemName: "Materia Prima Test Descuento", quantity: 3, unit: "kg" }]);

    const row = await pool.query("SELECT current_stock FROM inventory_items WHERE id = $1", [rawMaterial.id]);
    expect(Number(row.rows[0].current_stock)).toBeCloseTo(97, 3);

    const movement = await pool.query(
      "SELECT quantity, movement_type, source_type, source_id FROM stock_movements WHERE item_id = $1 AND source_id = $2",
      [rawMaterial.id, fakeOrderId],
    );
    expect(movement.rows).toHaveLength(1);
    expect(Number(movement.rows[0].quantity)).toBeCloseTo(3, 3);
    expect(movement.rows[0].movement_type).toBe("consumo");
    expect(movement.rows[0].source_type).toBe("restaurant_order");
  });

  it("avisa (sin bloquear) cuando no hay stock suficiente para cubrir la venta", async () => {
    if (!pool) return;

    const scarce = await storage.createInventoryItem({
      sku: `TEST-DEDUCT-SCARCE-${randomUUID().slice(0, 8)}`, name: "Materia Escasa Test Descuento",
      unit: "kg", costPrice: "100", currentStock: "1", itemKind: "materia_prima",
    } as any);
    cleanupItemIds.push(scarce.id);

    const category = await storage.createMenuCategory({ name: `Test Descuento Escaso ${randomUUID().slice(0, 6)}` } as any);
    cleanupMenuCategoryIds.push(category.id);
    const menuItem = await storage.createMenuItem({
      categoryId: category.id, name: "Plato Test Descuento Escaso", price: "1000",
    } as any);
    cleanupMenuItemIds.push(menuItem.id);
    if ((menuItem as any).inventoryItemId) cleanupItemIds.push((menuItem as any).inventoryItemId);

    const platoRecipe = await storage.createRecipe({ isBase: false, menuItemId: menuItem.id } as any);
    cleanupRecipeIds.push(platoRecipe.id);
    await storage.createRecipeIngredient({
      recipeId: platoRecipe.id, inventoryItemId: scarce.id, ingredientName: "Materia Escasa Test Descuento",
      quantity: "5", unit: "kg", unitCost: "100",
    } as any);

    const result = await storage.deductStockFromOrder(fakeOrderId, [{ menuItemId: menuItem.id, quantity: 1 }]);

    expect(result.warnings).toEqual([{ itemName: "Materia Escasa Test Descuento", required: 5, available: 1 }]);
    const row = await pool.query("SELECT current_stock FROM inventory_items WHERE id = $1", [scarce.id]);
    expect(Number(row.rows[0].current_stock)).toBe(0);
  });
});
