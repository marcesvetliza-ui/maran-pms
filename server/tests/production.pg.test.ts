/**
 * Producción: una Elaboración Base puede marcarse "producible" (vinculada a
 * un artículo de Inventario propio). Al registrar una corrida real se
 * descuenta stock real de los insumos por la cantidad REAL informada (puede
 * diferir de la teórica — merma real del día, no la de la fórmula), incluso
 * recursivamente a través de una sub-receta/elaboración virtual anidada; se
 * suma stock al artículo producido y se fija su costo unitario; y ese costo
 * se propaga (cascadeRecipeCostsFromInventoryItem) a cualquier receta que ya
 * use ese artículo producido como ingrediente — igual que un artículo
 * comprado normal.
 *
 * También cubre el caso de falta de stock: nunca bloquea, solo avisa y
 * descuenta lo disponible (mismo criterio que ya usa la venta de un plato).
 */

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;

suite("PostgreSQL real: Producción", () => {
  let storage: typeof import("../db-storage").storage;
  let production: typeof import("../production");
  const cleanupItemIds: string[] = [];
  const cleanupRecipeIds: string[] = [];
  const cleanupMenuItemIds: string[] = [];
  const cleanupMenuCategoryIds: string[] = [];
  const cleanupRunIds: string[] = [];

  beforeAll(async () => {
    if (!pool) return;
    ({ storage } = await import("../db-storage"));
    production = await import("../production");
  });

  afterAll(async () => {
    if (!pool) return;
    for (const id of cleanupRunIds) await pool.query("DELETE FROM production_runs WHERE id = $1", [id]);
    for (const id of cleanupMenuItemIds) await pool.query("DELETE FROM menu_items WHERE id = $1", [id]);
    for (const id of cleanupMenuCategoryIds) await pool.query("DELETE FROM menu_categories WHERE id = $1", [id]);
    for (const recipeId of cleanupRecipeIds) await pool.query("DELETE FROM recipe_ingredients WHERE recipe_id = $1", [recipeId]);
    for (const recipeId of cleanupRecipeIds) await pool.query("DELETE FROM recipes WHERE id = $1", [recipeId]);
    for (const itemId of cleanupItemIds) await pool.query("DELETE FROM stock_movements WHERE item_id = $1", [itemId]);
    for (const itemId of cleanupItemIds) await pool.query("DELETE FROM inventory_items WHERE id = $1", [itemId]);
    await pool.end();
  });

  it("descuenta insumos reales (directo y vía sub-receta anidada), carga stock+costo del producido, y propaga el costo a un plato que lo usa", async () => {
    if (!pool) return;

    const carne = await storage.createInventoryItem({
      sku: `TEST-PROD-CARNE-${randomUUID().slice(0, 8)}`, name: "Carne Test Producción",
      unit: "kg", costPrice: "1000", currentStock: "100", itemKind: "materia_prima",
    } as any);
    cleanupItemIds.push(carne.id);

    const harina = await storage.createInventoryItem({
      sku: `TEST-PROD-HARINA-${randomUUID().slice(0, 8)}`, name: "Harina Test Producción",
      unit: "kg", costPrice: "200", currentStock: "100", itemKind: "materia_prima",
    } as any);
    cleanupItemIds.push(harina.id);

    // Elaboración virtual (NO producible — sin outputInventoryItemId): rinde
    // 10kg, usa 2kg de harina por lote (costo/kg = 2*200/10 = 40).
    const elabVirtual = await storage.createRecipe({
      isBase: true, name: "Salsa Base Test Producción", productionUnit: "kg", productionYield: "10",
    } as any);
    cleanupRecipeIds.push(elabVirtual.id);
    await storage.createRecipeIngredient({
      recipeId: elabVirtual.id, inventoryItemId: harina.id, ingredientName: "Harina Test Producción",
      quantity: "2", unit: "kg", unitCost: "200",
    } as any);

    // Fórmula producible: usa 5kg de carne (merma 10% → bruto teórico 5.5556kg)
    // + 1kg-equivalente de la elaboración virtual; rinde teórico 20 porciones.
    const formula = await storage.createRecipe({
      isBase: true, name: "Bife de Chorizo Test Producción", productionUnit: "porciones", productionYield: "20",
    } as any);
    cleanupRecipeIds.push(formula.id);
    const ingCarne = await storage.createRecipeIngredient({
      recipeId: formula.id, inventoryItemId: carne.id, ingredientName: "Carne Test Producción",
      quantity: "5", unit: "kg", unitCost: "1000", merma: "10",
    } as any);
    const ingSalsa = await storage.createRecipeIngredient({
      recipeId: formula.id, subRecipeId: elabVirtual.id, ingredientName: "Salsa Base Test Producción",
      quantity: "1", unit: "kg", unitCost: "40",
    } as any);

    const outputItemId = await production.createAndLinkOutputItem(formula.id, {
      name: "Bife de Chorizo Porcionado Test", unit: "unidad",
    });
    cleanupItemIds.push(outputItemId);

    // Plato que ya usa el producido como ingrediente directo — antes de
    // registrar ninguna corrida, su costo snapshot arranca en 0 (el
    // producido todavía no tiene costo real).
    const category = await storage.createMenuCategory({ name: `Test Prod Cat ${randomUUID().slice(0, 6)}` } as any);
    cleanupMenuCategoryIds.push(category.id);
    const menuItem = await storage.createMenuItem({
      categoryId: category.id, name: "Plato Test Producción", price: "1000",
    } as any);
    cleanupMenuItemIds.push(menuItem.id);
    if ((menuItem as any).inventoryItemId) cleanupItemIds.push((menuItem as any).inventoryItemId);
    const platoRecipe = await storage.createRecipe({ isBase: false, menuItemId: menuItem.id } as any);
    cleanupRecipeIds.push(platoRecipe.id);
    const ingPlato = await storage.createRecipeIngredient({
      recipeId: platoRecipe.id, inventoryItemId: outputItemId, ingredientName: "Bife de Chorizo Porcionado Test",
      quantity: "0.5", unit: "unidad", unitCost: "0",
    } as any);

    // Corrida real: se usó más carne de la teórica (6kg en vez de 5.5556kg)
    // y se obtuvieron menos porciones de las teóricas (18 en vez de 20).
    const result = await production.registerProductionRun({
      date: "2001-02-01",
      recipeId: formula.id,
      outputQuantity: 18,
      lines: [
        { recipeIngredientId: ingCarne.id, actualQuantity: 6 },
        { recipeIngredientId: ingSalsa.id, actualQuantity: 1.2 },
      ],
      notes: "Corrida de prueba",
      registeredBy: "test-user",
    });
    cleanupRunIds.push(result.run.id);

    expect(result.warnings).toEqual([]);
    expect(result.skipped).toEqual([]);

    // Carne: se descontaron exactamente los 6kg reales informados (no los 5.5556 teóricos).
    const carneRow = await pool.query("SELECT current_stock FROM inventory_items WHERE id = $1", [carne.id]);
    expect(Number(carneRow.rows[0].current_stock)).toBeCloseTo(94, 3);

    // Harina (vía la elaboración virtual anidada): ratio = 1.2 / 10 (rinde de
    // la elaboración virtual) = 0.12; esa elaboración usa 2kg de harina por
    // lote → se descuentan 2 * 0.12 = 0.24kg.
    const harinaRow = await pool.query("SELECT current_stock FROM inventory_items WHERE id = $1", [harina.id]);
    expect(Number(harinaRow.rows[0].current_stock)).toBeCloseTo(99.76, 3);

    // Costo total = 6*1000 (carne) + 1.2*40 (salsa, snapshot unitCost=40) = 6048.
    // Costo unitario resultante = 6048 / 18 = 336.
    expect(result.run.totalCost).toBe("6048.00");
    expect(Number(result.run.outputUnitCost)).toBeCloseTo(336, 4);

    const outputRow = await pool.query("SELECT current_stock, cost_price FROM inventory_items WHERE id = $1", [outputItemId]);
    expect(Number(outputRow.rows[0].current_stock)).toBeCloseTo(18, 3);
    expect(Number(outputRow.rows[0].cost_price)).toBeCloseTo(336, 4);

    // Movimiento de salida (consumo) de la carne, y de entrada del producido.
    const consumoRow = await pool.query(
      "SELECT quantity FROM stock_movements WHERE item_id = $1 AND movement_type = 'consumo' AND source_type = 'production_run' AND source_id = $2",
      [carne.id, result.run.id],
    );
    expect(Number(consumoRow.rows[0].quantity)).toBeCloseTo(6, 3);
    const entradaRow = await pool.query(
      "SELECT quantity FROM stock_movements WHERE item_id = $1 AND movement_type = 'entrada' AND source_type = 'production_run' AND source_id = $2",
      [outputItemId, result.run.id],
    );
    expect(Number(entradaRow.rows[0].quantity)).toBeCloseTo(18, 3);

    // El plato que ya usaba el producido como ingrediente ve su costo
    // actualizado solo, por la cascada — igual que si fuera un artículo comprado.
    const ingPlatoRow = await pool.query("SELECT unit_cost FROM recipe_ingredients WHERE id = $1", [ingPlato.id]);
    expect(Number(ingPlatoRow.rows[0].unit_cost)).toBeCloseTo(336, 4);
  });

  it("no bloquea una corrida aunque falte stock del insumo — avisa y descuenta lo disponible, pero el costo usa la cantidad real informada", async () => {
    if (!pool) return;

    const escaso = await storage.createInventoryItem({
      sku: `TEST-PROD-ESCASO-${randomUUID().slice(0, 8)}`, name: "Insumo Escaso Test Producción",
      unit: "kg", costPrice: "500", currentStock: "2", itemKind: "materia_prima",
    } as any);
    cleanupItemIds.push(escaso.id);

    const formula = await storage.createRecipe({
      isBase: true, name: "Elaboración Escasa Test Producción", productionUnit: "kg", productionYield: "1",
    } as any);
    cleanupRecipeIds.push(formula.id);
    const ing = await storage.createRecipeIngredient({
      recipeId: formula.id, inventoryItemId: escaso.id, ingredientName: "Insumo Escaso Test Producción",
      quantity: "5", unit: "kg", unitCost: "500",
    } as any);

    const outputItemId = await production.createAndLinkOutputItem(formula.id, {
      name: "Producto Escaso Test", unit: "unidad",
    });
    cleanupItemIds.push(outputItemId);

    const result = await production.registerProductionRun({
      date: "2001-02-02",
      recipeId: formula.id,
      outputQuantity: 1,
      lines: [{ recipeIngredientId: ing.id, actualQuantity: 5 }],
    });
    cleanupRunIds.push(result.run.id);

    expect(result.warnings).toEqual([{ itemName: "Insumo Escaso Test Producción", required: 5, available: 2 }]);

    // Se descontó lo disponible (quedó en 0), nunca negativo.
    const row = await pool.query("SELECT current_stock FROM inventory_items WHERE id = $1", [escaso.id]);
    expect(Number(row.rows[0].current_stock)).toBe(0);

    // El costo usa la cantidad REAL informada (5), no la clampeada (2):
    // 5 * 500 = 2500, costo unitario = 2500 / 1 = 2500.
    expect(result.run.totalCost).toBe("2500.00");
    expect(Number(result.run.outputUnitCost)).toBeCloseTo(2500, 4);

    const warningsRow = await pool.query("SELECT warnings FROM production_runs WHERE id = $1", [result.run.id]);
    expect(warningsRow.rows[0].warnings.shortfalls).toEqual([{ itemName: "Insumo Escaso Test Producción", required: 5, available: 2 }]);
  });
});
