import type { Express } from "express";
import {
  getBreakfastCatalog, createBreakfastCatalogItem, updateBreakfastCatalogItem, deleteBreakfastCatalogItem,
  getBreakfastDay, saveBreakfastDay, deleteBreakfastEntry, getBreakfastMonth,
} from "../breakfastControl";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function registerBreakfastRoutes(app: Express) {
  app.get("/api/breakfast/catalog", async (req, res) => {
    try {
      const catalog = await getBreakfastCatalog();
      res.json(catalog);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error obteniendo el catálogo de desayuno" });
    }
  });

  app.post("/api/breakfast/catalog", async (req, res) => {
    try {
      const id = await createBreakfastCatalogItem(req.body);
      res.status(201).json({ id });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Error agregando artículo al catálogo" });
    }
  });

  app.patch("/api/breakfast/catalog/:id", async (req, res) => {
    try {
      await updateBreakfastCatalogItem(req.params.id, req.body);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Error actualizando el artículo" });
    }
  });

  app.delete("/api/breakfast/catalog/:id", async (req, res) => {
    try {
      await deleteBreakfastCatalogItem(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Error eliminando el artículo" });
    }
  });

  app.get("/api/breakfast/days/:date", async (req, res) => {
    try {
      if (!DATE_RE.test(req.params.date)) return res.status(400).json({ error: "Fecha inválida" });
      const day = await getBreakfastDay(req.params.date);
      res.json(day);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error obteniendo el día" });
    }
  });

  app.put("/api/breakfast/days/:date", async (req, res) => {
    try {
      if (!DATE_RE.test(req.params.date)) return res.status(400).json({ error: "Fecha inválida" });
      const { pax, notes, entries } = req.body;
      const user = (req as any).user?.fullName || (req as any).user?.username || null;
      await saveBreakfastDay(req.params.date, Number(pax), notes || null, entries || [], user);
      const day = await getBreakfastDay(req.params.date);
      res.json(day);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Error guardando el día" });
    }
  });

  app.delete("/api/breakfast/entries/:id", async (req, res) => {
    try {
      await deleteBreakfastEntry(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Error eliminando la fila" });
    }
  });

  app.get("/api/breakfast/month/:year/:month", async (req, res) => {
    try {
      const year = parseInt(req.params.year, 10);
      const month = parseInt(req.params.month, 10);
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: "Año o mes inválido" });
      }
      const summary = await getBreakfastMonth(year, month);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error obteniendo el resumen del mes" });
    }
  });
}
