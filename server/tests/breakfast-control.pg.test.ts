/**
 * Control de Desayunos: catálogo de artículos (Elaboración Base o artículo
 * de Inventario suelto), carga diaria con costo "snapshoteado" al momento
 * de guardar (para que el histórico de un día no se mueva solo si después
 * cambia el costo del artículo — ver server/recipeCostCascade.ts), y
 * resumen mensual.
 */

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;

suite("PostgreSQL real: Control de Desayunos", () => {
  let mod: typeof import("../breakfastControl");
  let storage: typeof import("../db-storage").storage;
  let rawMaterialId: string;
  let catalogItemId: string;
  const testDate = "2001-01-15"; // fecha lejos de cualquier dato real/seed
  const cleanupItemIds: string[] = [];

  beforeAll(async () => {
    if (!pool) return;
    mod = await import("../breakfastControl");
    ({ storage } = await import("../db-storage"));

    const rawMaterial = await storage.createInventoryItem({
      sku: `TEST-BKF-${randomUUID().slice(0, 8)}`,
      name: "Pan Test Desayuno",
      unit: "kg",
      costPrice: "2000",
      itemKind: "materia_prima",
    } as any);
    rawMaterialId = rawMaterial.id;
    cleanupItemIds.push(rawMaterialId);

    catalogItemId = await mod.createBreakfastCatalogItem({
      itemSourceType: "inventario",
      inventoryItemId: rawMaterialId,
    });
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM breakfast_entries WHERE date = $1", [testDate]);
    await pool.query("DELETE FROM breakfast_days WHERE date = $1", [testDate]);
    if (catalogItemId) await pool.query("DELETE FROM breakfast_catalog_items WHERE id = $1", [catalogItemId]);
    for (const id of cleanupItemIds) await pool.query("DELETE FROM inventory_items WHERE id = $1", [id]);
    await pool.end();
  });

  it("guarda un día con un artículo del catálogo y uno novedad, snapshotea el costo vigente, y el consumo real/costo salen bien", async () => {
    if (!pool) return;

    await mod.saveBreakfastDay(
      testDate,
      40,
      "Carga de prueba",
      [
        { catalogItemId, itemSourceType: "inventario", inventoryItemId: rawMaterialId, recipeId: null, quantityOut: 5, quantityRecovered: 1 },
        { catalogItemId: null, itemSourceType: "inventario", inventoryItemId: rawMaterialId, recipeId: null, quantityOut: 2, quantityRecovered: 0 },
      ],
      "test-user",
    );

    const day = await mod.getBreakfastDay(testDate);
    expect(day.pax).toBe(40);
    expect(day.paxIsSuggested).toBe(false);
    expect(day.notes).toBe("Carga de prueba");

    const catalogEntry = day.entries.find(e => e.catalogItemId === catalogItemId);
    expect(catalogEntry).toBeTruthy();
    expect(catalogEntry!.quantityOut).toBe(5);
    expect(catalogEntry!.quantityRecovered).toBe(1);
    expect(catalogEntry!.unitCost).toBe(2000); // costo vigente al momento de guardar

    const noveltyEntry = day.entries.find(e => e.catalogItemId === null);
    expect(noveltyEntry).toBeTruthy();
    expect(noveltyEntry!.quantityOut).toBe(2);
  });

  it("el costo guardado queda fijo (snapshot): si después cambia el costo del artículo, el día ya cargado no se mueve solo", async () => {
    if (!pool) return;

    // Subo el costo del artículo DESPUÉS de haber guardado el día de prueba.
    await storage.updateInventoryItem(rawMaterialId, { costPrice: "9999" } as any);

    const day = await mod.getBreakfastDay(testDate);
    const catalogEntry = day.entries.find(e => e.catalogItemId === catalogItemId);
    // Sigue en 2000, el costo vigente al momento en que se guardó esa fila.
    expect(catalogEntry!.unitCost).toBe(2000);

    // Pero un día TODAVÍA NO cargado sí debe ofrecer el costo vigente nuevo.
    const freshDay = await mod.getBreakfastDay("2001-01-16");
    const freshCatalogEntry = freshDay.entries.find(e => e.catalogItemId === catalogItemId);
    expect(freshCatalogEntry!.unitCost).toBe(9999);
    // Limpieza del sondeo del día "fresco" (no debería haber creado nada).
    await pool.query("DELETE FROM breakfast_days WHERE date = $1", ["2001-01-16"]);
  });

  it("el resumen mensual agrega el consumo real y el costo total correctamente", async () => {
    if (!pool) return;

    const summary = await mod.getBreakfastMonth(2001, 1);
    const dayRow = summary.days.find(d => d.date === testDate);
    expect(dayRow).toBeTruthy();
    // Consumo real del artículo del catálogo: 5 - 1 = 4, costo 4*2000 = 8000.
    // Consumo real del novedad: 2 - 0 = 2, costo 2*2000 = 4000.
    // Total del día: 12000.
    expect(dayRow!.totalCost).toBeCloseTo(12000, 2);
    expect(dayRow!.costPerPax).toBeCloseTo(300, 2); // 12000 / 40 pax

    const article = summary.articles.find(a => a.itemName === "Pan Test Desayuno");
    expect(article).toBeTruthy();
    expect(article!.totalConsumedReal).toBeCloseTo(6, 3); // 4 + 2
  });
});
