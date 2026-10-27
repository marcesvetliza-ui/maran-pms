import {breakfastEligibility} from "./stayEligibility";
import { and, eq, gte, lte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, withDatabaseTransaction } from "./db";
import {
  breakfastCatalogItems, breakfastDays, breakfastEntries,
  inventoryItems, recipes,
  type BreakfastItemSourceType,
} from "@shared/schema";
import { computeBaseRecipeCostPerUnit } from "./recipeCostCascade";

export type BreakfastCatalogItemView = {
  id: string;
  itemSourceType: BreakfastItemSourceType;
  inventoryItemId: string | null;
  recipeId: string | null;
  name: string;
  unit: string;
  currentUnitCost: number;
  sortOrder: number;
  isActive: boolean;
};

async function currentUnitCostOf(
  itemSourceType: BreakfastItemSourceType,
  inventoryItemId: string | null,
  recipeId: string | null,
): Promise<{ cost: number; name: string; unit: string } | null> {
  if (itemSourceType === "inventario" && inventoryItemId) {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, inventoryItemId));
    if (!item) return null;
    return { cost: parseFloat(String(item.costPrice || "0")), name: item.name, unit: item.unit };
  }
  if (itemSourceType === "elaboracion" && recipeId) {
    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, recipeId));
    if (!recipe) return null;
    const cost = await computeBaseRecipeCostPerUnit(db, recipeId);
    return { cost, name: recipe.name || "Elaboración", unit: recipe.productionUnit || "kg" };
  }
  return null;
}

export async function getBreakfastCatalog(): Promise<BreakfastCatalogItemView[]> {
  const rows = await db.select().from(breakfastCatalogItems).orderBy(breakfastCatalogItems.sortOrder);
  const views: BreakfastCatalogItemView[] = [];
  for (const row of rows) {
    const resolved = await currentUnitCostOf(row.itemSourceType, row.inventoryItemId, row.recipeId);
    if (!resolved) continue; // artículo o elaboración borrados: no se listan, pero no se pierde el histórico ya cargado
    views.push({
      id: row.id,
      itemSourceType: row.itemSourceType,
      inventoryItemId: row.inventoryItemId,
      recipeId: row.recipeId,
      name: resolved.name,
      unit: resolved.unit,
      currentUnitCost: resolved.cost,
      sortOrder: row.sortOrder,
      isActive: row.isActive !== "false",
    });
  }
  return views;
}

export async function createBreakfastCatalogItem(data: {
  itemSourceType: BreakfastItemSourceType;
  inventoryItemId?: string | null;
  recipeId?: string | null;
}): Promise<string> {
  if (data.itemSourceType === "inventario" && !data.inventoryItemId) {
    throw new Error("Falta el artículo de inventario");
  }
  if (data.itemSourceType === "elaboracion" && !data.recipeId) {
    throw new Error("Falta la elaboración base");
  }
  return withDatabaseTransaction(async () => {
    await db.execute(sql`SELECT pg_advisory_xact_lock(173410, 4)`);
    if (data.recipeId) {
      const active = await db.execute(sql`SELECT id FROM recipes WHERE id=${data.recipeId} AND is_active='true' FOR SHARE`);
      if (!active.rows.length) throw Object.assign(new Error("La elaboración está inactiva o no existe"),{statusCode:409});
    }
    const existing = await db.select().from(breakfastCatalogItems);
    const maxSort = existing.reduce((max, r) => Math.max(max, r.sortOrder), -1);
    const [created] = await db.insert(breakfastCatalogItems).values({
      itemSourceType: data.itemSourceType,
      inventoryItemId: data.itemSourceType === "inventario" ? data.inventoryItemId : null,
      recipeId: data.itemSourceType === "elaboracion" ? data.recipeId : null,
      sortOrder: maxSort + 1,
      isActive: "true",
    } as any).returning();
    return created.id;
  });
}

export async function updateBreakfastCatalogItem(
  id: string,
  data: Partial<{ sortOrder: number; isActive: string }>,
): Promise<void> {
  await withDatabaseTransaction(async () => {
    await db.execute(sql`SELECT pg_advisory_xact_lock(173410, 4)`);
    if (data.isActive === 'true') {
      const inactive=await db.execute(sql`SELECT 1 FROM breakfast_catalog_items c JOIN recipes r ON r.id=c.recipe_id WHERE c.id=${id} AND r.is_active='false'`);
      if(inactive.rows.length) throw Object.assign(new Error("Reactivá primero la elaboración"),{statusCode:409});
    }
    await db.update(breakfastCatalogItems).set(data as any).where(eq(breakfastCatalogItems.id, id));
  });
}

export async function deleteBreakfastCatalogItem(id: string): Promise<void> {
  await db.delete(breakfastCatalogItems).where(eq(breakfastCatalogItems.id, id));
}

/**
 * Pax sugerido para la mañana del desayuno de `date`: huéspedes cuya
 * estadía cubre la noche anterior a esa fecha, sin importar si para esa
 * fecha ya pasó (reserva histórica) o es futura. Es un punto de partida —
 * el gte de A&B lo puede pisar a mano en cada día.
 */
export async function suggestedBreakfastPax(date: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(r.number_of_guests), 0) AS pax
    FROM reservations r
    JOIN rooms rm ON rm.id = r.room_id
    WHERE ${breakfastEligibility(date)}
      AND (rm.is_virtual IS NULL OR rm.is_virtual = false)
  `);
  return Number((result.rows[0] as any)?.pax ?? 0);
}

export type BreakfastEntryView = {
  id: string | null; // null = todavía no se cargó esta fila para este día
  catalogItemId: string | null;
  itemSourceType: BreakfastItemSourceType;
  inventoryItemId: string | null;
  recipeId: string | null;
  itemName: string;
  unit: string;
  unitCost: number; // snapshot si ya se guardó; costo vigente si todavía no
  quantityOut: number;
  quantityRecovered: number;
};

export type BreakfastDayView = {
  date: string;
  pax: number;
  paxIsSuggested: boolean;
  forecastPax: number;
  notes: string | null;
  entries: BreakfastEntryView[];
};

export async function getBreakfastDay(date: string): Promise<BreakfastDayView> {
  const [dayRow] = await db.select().from(breakfastDays).where(eq(breakfastDays.date, date));
  const catalog = await getBreakfastCatalog();
  const savedEntries = await db.select().from(breakfastEntries).where(eq(breakfastEntries.date, date));
  const savedByCatalogId = new Map(savedEntries.filter(e => e.catalogItemId).map(e => [e.catalogItemId as string, e]));
  const noveltyEntries = savedEntries.filter(e => !e.catalogItemId);

  const entries: BreakfastEntryView[] = [];
  for (const cat of catalog.filter(c => c.isActive)) {
    const saved = savedByCatalogId.get(cat.id);
    entries.push({
      id: saved?.id ?? null,
      catalogItemId: cat.id,
      itemSourceType: cat.itemSourceType,
      inventoryItemId: cat.inventoryItemId,
      recipeId: cat.recipeId,
      itemName: cat.name,
      unit: cat.unit,
      unitCost: saved ? parseFloat(String(saved.unitCostSnapshot)) : cat.currentUnitCost,
      quantityOut: saved ? parseFloat(String(saved.quantityOut)) : 0,
      quantityRecovered: saved ? parseFloat(String(saved.quantityRecovered)) : 0,
    });
  }
  for (const nov of noveltyEntries) {
    entries.push({
      id: nov.id,
      catalogItemId: null,
      itemSourceType: nov.itemSourceType,
      inventoryItemId: nov.inventoryItemId,
      recipeId: nov.recipeId,
      itemName: nov.itemName,
      unit: nov.unit,
      unitCost: parseFloat(String(nov.unitCostSnapshot)),
      quantityOut: parseFloat(String(nov.quantityOut)),
      quantityRecovered: parseFloat(String(nov.quantityRecovered)),
    });
  }

  const forecastPax = await suggestedBreakfastPax(date);
  const pax = dayRow?.pax ?? forecastPax;
  return {
    date,
    pax,
    paxIsSuggested: !dayRow,
    forecastPax,
    notes: dayRow?.notes ?? null,
    entries,
  };
}

export type SaveBreakfastEntryInput = {
  catalogItemId: string | null;
  itemSourceType: BreakfastItemSourceType;
  inventoryItemId: string | null;
  recipeId: string | null;
  quantityOut: number;
  quantityRecovered: number;
};

/**
 * Guarda el día completo: cabecera (pax/notas) + cada fila. El costo de
 * cada fila se fija al costo vigente en este momento (snapshot) — así el
 * histórico de ese día no se mueve solo si después cambia el costo del
 * artículo. Pensado para poder cargarse con fecha retroactiva: no hay
 * ninguna restricción sobre qué `date` se puede guardar.
 */
export async function saveBreakfastDay(
  date: string,
  pax: number,
  notes: string | null,
  entries: SaveBreakfastEntryInput[],
  updatedBy: string | null,
): Promise<void> {
  if (!Number.isFinite(pax) || pax < 0) throw new Error("N° de pax inválido");

  await db.transaction(async (tx) => {
    await tx.insert(breakfastDays).values({ date, pax, notes, updatedBy } as any)
      .onConflictDoUpdate({
        target: breakfastDays.date,
        set: { pax, notes, updatedAt: new Date(), updatedBy },
      });

    for (const entry of entries) {
      const resolved = await currentUnitCostOf(entry.itemSourceType, entry.inventoryItemId, entry.recipeId);
      if (!resolved) throw new Error("Uno de los artículos cargados ya no existe");
      if (entry.quantityOut < 0 || entry.quantityRecovered < 0) {
        throw new Error(`Cantidad inválida en ${resolved.name}`);
      }

      const values = {
        date,
        catalogItemId: entry.catalogItemId,
        itemSourceType: entry.itemSourceType,
        inventoryItemId: entry.inventoryItemId,
        recipeId: entry.recipeId,
        itemName: resolved.name,
        unit: resolved.unit,
        unitCostSnapshot: resolved.cost.toFixed(4),
        quantityOut: String(entry.quantityOut),
        quantityRecovered: String(entry.quantityRecovered),
        updatedAt: new Date(),
        updatedBy,
      };

      if (entry.catalogItemId) {
        const [existing] = await tx.select().from(breakfastEntries).where(
          and(eq(breakfastEntries.date, date), eq(breakfastEntries.catalogItemId, entry.catalogItemId))
        );
        if (existing) {
          await tx.update(breakfastEntries).set(values as any).where(eq(breakfastEntries.id, existing.id));
        } else {
          await tx.insert(breakfastEntries).values(values as any);
        }
      } else {
        // Ítem "novedad": siempre se inserta como fila nueva — editar o
        // borrar una fila novedad puntual se hace con su propio id, no acá.
        await tx.insert(breakfastEntries).values(values as any);
      }
    }
  });
}

export async function deleteBreakfastEntry(id: string): Promise<void> {
  await db.delete(breakfastEntries).where(eq(breakfastEntries.id, id));
}

export type BreakfastMonthDaySummary = {
  date: string;
  pax: number;
  totalCost: number;
  costPerPax: number;
};

export type BreakfastMonthArticleSummary = {
  itemName: string;
  unit: string;
  totalConsumedReal: number;
  totalCost: number;
};

export async function getBreakfastMonth(year: number, month: number): Promise<{
  days: BreakfastMonthDaySummary[];
  articles: BreakfastMonthArticleSummary[];
  totalCost: number;
  totalPax: number;
}> {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const dayRows = await db.select().from(breakfastDays).where(
    and(gte(breakfastDays.date, from), lte(breakfastDays.date, to))
  );
  const entryRows = await db.select().from(breakfastEntries).where(
    and(gte(breakfastEntries.date, from), lte(breakfastEntries.date, to))
  );

  const entriesByDate = new Map<string, typeof entryRows>();
  for (const e of entryRows) {
    const list = entriesByDate.get(e.date) ?? [];
    list.push(e);
    entriesByDate.set(e.date, list);
  }

  const days: BreakfastMonthDaySummary[] = dayRows
    .map((d) => {
      const dayEntries = entriesByDate.get(d.date) ?? [];
      const totalCost = dayEntries.reduce((sum, e) => {
        const consumedReal = parseFloat(String(e.quantityOut)) - parseFloat(String(e.quantityRecovered));
        return sum + consumedReal * parseFloat(String(e.unitCostSnapshot));
      }, 0);
      return {
        date: d.date,
        pax: d.pax,
        totalCost,
        costPerPax: d.pax > 0 ? totalCost / d.pax : 0,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const articleMap = new Map<string, BreakfastMonthArticleSummary>();
  for (const e of entryRows) {
    const consumedReal = parseFloat(String(e.quantityOut)) - parseFloat(String(e.quantityRecovered));
    const cost = consumedReal * parseFloat(String(e.unitCostSnapshot));
    const key = e.itemName;
    const existing = articleMap.get(key);
    if (existing) {
      existing.totalConsumedReal += consumedReal;
      existing.totalCost += cost;
    } else {
      articleMap.set(key, { itemName: e.itemName, unit: e.unit, totalConsumedReal: consumedReal, totalCost: cost });
    }
  }

  return {
    days,
    articles: [...articleMap.values()].sort((a, b) => b.totalCost - a.totalCost),
    totalCost: days.reduce((sum, d) => sum + d.totalCost, 0),
    totalPax: days.reduce((sum, d) => sum + d.pax, 0),
  };
}
