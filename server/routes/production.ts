import type { Express } from "express";
import {
  getProducibleFormulas, getUnlinkedBaseRecipes,
  linkRecipeToOutputItem, createAndLinkOutputItem, unlinkRecipeOutput,
  registerProductionRun, getProductionRunHistory,
} from "../production";

export function registerProductionRoutes(app: Express) {
  app.get("/api/production/formulas", async (req, res) => {
    try {
      const formulas = await getProducibleFormulas();
      res.json(formulas);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error obteniendo las fórmulas de producción" });
    }
  });

  app.get("/api/production/formulas/unlinked", async (req, res) => {
    try {
      const recipes = await getUnlinkedBaseRecipes();
      res.json(recipes);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error obteniendo las Elaboraciones Base" });
    }
  });

  app.post("/api/production/formulas/:recipeId/link", async (req, res) => {
    try {
      const { outputInventoryItemId } = req.body;
      if (!outputInventoryItemId) return res.status(400).json({ error: "Falta el artículo de inventario" });
      await linkRecipeToOutputItem(req.params.recipeId, outputInventoryItemId);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Error vinculando el artículo" });
    }
  });

  app.post("/api/production/formulas/:recipeId/link-new", async (req, res) => {
    try {
      const { name, unit, categoryId } = req.body;
      const id = await createAndLinkOutputItem(req.params.recipeId, { name, unit, categoryId });
      res.status(201).json({ id });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Error creando el artículo producido" });
    }
  });

  app.delete("/api/production/formulas/:recipeId/link", async (req, res) => {
    try {
      await unlinkRecipeOutput(req.params.recipeId);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Error desvinculando el artículo" });
    }
  });

  app.post("/api/production/runs", async (req, res) => {
    try {
      const { date, recipeId, outputQuantity, lines, notes } = req.body;
      const user = (req as any).user?.fullName || (req as any).user?.username || null;
      const result = await registerProductionRun({
        date,
        recipeId,
        outputQuantity: Number(outputQuantity),
        lines: Array.isArray(lines) ? lines.map((l: any) => ({
          recipeIngredientId: l.recipeIngredientId,
          actualQuantity: Number(l.actualQuantity),
        })) : [],
        notes: notes || null,
        registeredBy: user,
      });
      res.status(201).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Error registrando la producción" });
    }
  });

  app.get("/api/production/runs", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const history = await getProductionRunHistory(limit && Number.isFinite(limit) ? limit : undefined);
      res.json(history);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error obteniendo el historial de producción" });
    }
  });
}
