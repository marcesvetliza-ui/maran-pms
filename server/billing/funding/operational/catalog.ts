import type { PoolClient } from "pg";
import type { RecipeIngredient } from "@shared/schema";
import {
  grossQuantityFor,
  planIngredientsWithActualQuantities,
  type RecipeLookupFn,
} from "../../../recipeStockDeduction";
import type { ConsumptionLine } from "../../../inventoryStockEngine";
import { FundingError, identifier } from "../contracts";
export type SpaCatalogSource = "restaurant" | "spa" | "inventory";
export type SpaCatalogEntry = {
  id: string;
  source: SpaCatalogSource;
  area: "restaurant" | "spa";
  name: string;
  priceCents: number | null;
};
/** Prices belong to the sale catalog, never to inventory cost_price. */
export async function spaChargeCatalog(
  c: Pick<PoolClient, "query">,
  schema = "public",
): Promise<SpaCatalogEntry[]> {
  const s = identifier(schema);
  return (
    await c.query(`SELECT id,'restaurant' AS source,'restaurant' AS area,name,round(price*100)::double precision AS "priceCents"
  FROM ${s}.menu_items WHERE is_active IS DISTINCT FROM 'false' AND is_available IS DISTINCT FROM 'false' AND name IS NOT NULL AND price>0
 UNION ALL SELECT id,'spa','spa',name,round(price*100)::double precision FROM ${s}.spa_treatments WHERE is_active IS DISTINCT FROM 'false' AND name IS NOT NULL AND price>0
 UNION ALL SELECT i.id,'inventory',cat.area,i.name,NULL::double precision FROM ${s}.inventory_items i JOIN ${s}.item_categories cat ON cat.id=i.category_id
  WHERE i.is_active='true' AND i.item_kind='venta_directa' AND cat.area IN ('spa','restaurant') AND cat.is_active='true'
   AND COALESCE(i.iva_rate,'21')='21' AND NOT EXISTS(SELECT 1 FROM ${s}.menu_items m WHERE m.inventory_item_id=i.id)
 ORDER BY area,name,id`)
  ).rows;
}
export async function resolveSpaCatalogCharge(
  c: PoolClient,
  source: SpaCatalogSource,
  id: string,
  quantity: number,
  unitCents: number,
  schema = "public",
) {
  const s = identifier(schema);
  let row: any,
    inventoryItemId: string | null = null,
    lines: ConsumptionLine[] = [];
  if (source === "inventory") {
    row = (
      await c.query(
        `SELECT i.id,i.name FROM ${s}.inventory_items i JOIN ${s}.item_categories cat ON cat.id=i.category_id
   WHERE i.id=$1 AND i.is_active='true' AND i.item_kind='venta_directa' AND cat.area IN ('spa','restaurant') AND cat.is_active='true'
    AND COALESCE(i.iva_rate,'21')='21' AND NOT EXISTS(SELECT 1 FROM ${s}.menu_items m WHERE m.inventory_item_id=i.id) FOR SHARE OF i,cat`,
        [id],
      )
    ).rows[0];
    inventoryItemId = id;
    lines = [{ itemId: id, quantity }];
  } else if (source === "spa") {
    row = (
      await c.query(
        `SELECT id,name,price FROM ${s}.spa_treatments WHERE id=$1 AND is_active IS DISTINCT FROM 'false' FOR SHARE`,
        [id],
      )
    ).rows[0];
    if (row)
      lines = (
        await c.query(
          `SELECT inventory_item_id AS "itemId",quantity*$2 AS quantity,unit FROM ${s}.treatment_supplies WHERE treatment_id=$1 ORDER BY id FOR SHARE`,
          [id, quantity],
        )
      ).rows.map((r) => ({ ...r, quantity: Number(r.quantity) }));
  } else {
    row = (
      await c.query(
        `SELECT id,name,price,inventory_item_id FROM ${s}.menu_items WHERE id=$1 AND is_active IS DISTINCT FROM 'false' AND is_available IS DISTINCT FROM 'false' FOR SHARE`,
        [id],
      )
    ).rows[0];
    if (row) {
      inventoryItemId = row.inventory_item_id;
      const recipes = (
        await c.query(
          `SELECT id FROM ${s}.recipes WHERE menu_item_id=$1 AND is_active IS DISTINCT FROM 'false' ORDER BY id FOR SHARE`,
          [id],
        )
      ).rows;
      if (recipes.length > 1)
        throw new FundingError(
          "INVALID_PRODUCT",
          "El producto tiene varias recetas activas. Revisá su configuración.",
          422,
        );
      const getRecipe: RecipeLookupFn = async (recipeId: string) => {
        const recipe = (
          await c.query(
            `SELECT id,production_yield AS "productionYield",production_unit AS "productionUnit",output_inventory_item_id AS "outputInventoryItemId" FROM ${s}.recipes WHERE id=$1 AND is_active IS DISTINCT FROM 'false' FOR SHARE`,
            [recipeId],
          )
        ).rows[0];
        if (!recipe) return undefined;
        const ingredients = (
          await c.query(
            `SELECT id,recipe_id AS "recipeId",inventory_item_id AS "inventoryItemId",sub_recipe_id AS "subRecipeId",ingredient_name AS "ingredientName",quantity,unit,unit_cost AS "unitCost",warehouse_id AS "warehouseId",merma FROM ${s}.recipe_ingredients WHERE recipe_id=$1 ORDER BY id FOR SHARE`,
            [recipeId],
          )
        ).rows as RecipeIngredient[];
        return { ...recipe, ingredients };
      };
      const recipe = recipes.length
        ? await getRecipe(recipes[0].id)
        : undefined;
      if (recipe?.ingredients.length) {
        try {
          lines = await planIngredientsWithActualQuantities(
            getRecipe,
            recipe.ingredients.map((ingredient) => ({
              ingredient,
              actualGrossQuantity: grossQuantityFor(ingredient, quantity),
            })),
          );
        } catch (error: any) {
          if (error.statusCode === 409)
            throw new FundingError("INVALID_PRODUCT", error.message, 422);
          throw error;
        }
      } else {
        const direct = inventoryItemId
          ? (
              await c.query(
                `SELECT id,name FROM ${s}.inventory_items WHERE id=$1 AND is_active='true' AND item_kind='venta_directa' FOR SHARE`,
                [inventoryItemId],
              )
            ).rows[0]
          : null;
        if (!direct)
          throw new FundingError(
            "INVALID_PRODUCT",
            "El producto de Restaurant necesita su receta o vínculo de venta directa para descontar stock.",
            422,
          );
        lines = [{ itemId: direct.id, quantity }];
      }
    }
  }
  if (!row)
    throw new FundingError(
      "INVALID_PRODUCT",
      "El producto ya no está activo o disponible en el catálogo.",
      422,
    );
  if (
    source !== "inventory" &&
    Math.round(Number(row.price) * 100) !== unitCents
  )
    throw new FundingError(
      "CATALOG_PRICE_CHANGED",
      "Cambió el precio del catálogo. Volvé a elegir el producto antes de agregarlo.",
      409,
    );
  if (lines.some((l) => !l.itemId))
    throw new FundingError(
      "INVALID_PRODUCT",
      "Falta vincular un ingrediente de la receta con Inventario.",
      422,
    );
  // Same warehouse policy as Restaurant: latest real transfer destination.
  return {
    description: row.name as string,
    inventoryItemId,
    lines: lines.map((l) => ({ ...l, warehouseId: null })),
  };
}
