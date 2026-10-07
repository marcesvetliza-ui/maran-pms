import {inventoryAccess} from "../inventoryAccess";
import {requireAuth,requirePermission} from "../auth";
import type { Express } from "express";
import {
  getProducibleFormulas, getUnlinkedBaseRecipes,
  linkRecipeToOutputItem, createAndLinkOutputItem, unlinkRecipeOutput,
  registerProductionRun, getProductionRunHistory,
} from "../production";

export function registerProductionRoutes(app: Express) {
  app.use("/api/production", requireAuth, inventoryAccess);
  app.get("/api/production/formulas", requireAuth, async (req, res) => {
    try {
      const formulas = await getProducibleFormulas();
      res.json(formulas);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error obteniendo las fórmulas de producción" });
    }
  });

  app.get("/api/production/formulas/unlinked", requireAuth, async (req, res) => {
    try {
      const recipes = await getUnlinkedBaseRecipes();
      res.json(recipes);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error obteniendo las Elaboraciones Base" });
    }
  });

  app.post("/api/production/formulas/:recipeId/link", requireAuth, requirePermission("api:inventory:catalog"), async (req, res) => {
    try {
      const { outputInventoryItemId } = req.body;
      if (!outputInventoryItemId) return res.status(400).json({ error: "Falta el artículo de inventario" });
      await linkRecipeToOutputItem(req.params.recipeId, outputInventoryItemId);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Error vinculando el artículo" });
    }
  });

  app.post("/api/production/formulas/:recipeId/link-new", requireAuth, requirePermission("api:inventory:catalog"), async (req, res) => {
    try {
      const { name, unit, categoryId } = req.body;
      const id = await createAndLinkOutputItem(req.params.recipeId, { name, unit, categoryId });
      res.status(201).json({ id });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Error creando el artículo producido" });
    }
  });

  app.delete("/api/production/formulas/:recipeId/link", requireAuth, requirePermission("api:inventory:catalog"), async (req, res) => {
    try {
      await unlinkRecipeOutput(req.params.recipeId);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Error desvinculando el artículo" });
    }
  });

  app.post("/api/production/runs", requireAuth, requirePermission("api:inventory:operate"), async (req, res) => {
    try {
      const { date, recipeId, outputQuantity, outputWarehouseId, requestId, lines, notes } = req.body;
      if(!requestId)return res.status(400).json({error:"Falta el identificador de la operación; actualizá la página y reintentá."});
      const user = (req as any).user?.fullName || (req as any).user?.username || null;
      const result = await registerProductionRun({
        date,
        recipeId,
        outputWarehouseId,
        requestId,
        outputQuantity: Number(outputQuantity),
        lines: Array.isArray(lines) ? lines.map((l: any) => ({
          recipeIngredientId: l.recipeIngredientId,
          actualQuantity: Number(l.actualQuantity),
          warehouseId:l.warehouseId,
        })) : [],
        notes: notes || null,
        registeredBy: user,
      });
      res.status(201).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Error registrando la producción" });
    }
  });

  app.get("/api/production/runs", requireAuth, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const history = await getProductionRunHistory(limit && Number.isFinite(limit) ? limit : undefined);
      res.json(history);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error obteniendo el historial de producción" });
    }
  });
}
