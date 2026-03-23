import type { Express } from "express";
import { storage } from "../db-storage";
import { db } from "../db";
import { planningDayNotes } from "../../shared/schema";
import { and, gte, lte } from "drizzle-orm";

export function registerPlanningRoutes(app: Express) {
  app.get("/api/planning", async (req, res) => {
    try {
      const startDate = req.query.start as string;
      const endDate = req.query.end as string;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: "Start and end dates are required" });
      }

      const planningData = await storage.getPlanningData(startDate, endDate);
      res.json(planningData);
    } catch (error) {
      res.status(500).json({ error: "Error fetching planning data" });
    }
  });

  // GET /api/planning/day-notes?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get("/api/planning/day-notes", async (req, res) => {
    try {
      const from = req.query.from as string;
      const to = req.query.to as string;
      if (!from || !to) return res.status(400).json({ error: "from y to son requeridos" });

      const notes = await db
        .select()
        .from(planningDayNotes)
        .where(and(gte(planningDayNotes.date, from), lte(planningDayNotes.date, to)));

      res.json(notes);
    } catch (error) {
      console.error("Error fetching day notes:", error);
      res.status(500).json({ error: "Error al obtener notas" });
    }
  });

  // PUT /api/planning/day-notes/:date
  app.put("/api/planning/day-notes/:date", async (req, res) => {
    try {
      const { date } = req.params;
      const { note } = req.body as { note: string };

      if (!date) return res.status(400).json({ error: "Fecha requerida" });

      await db
        .insert(planningDayNotes)
        .values({ date, note: note ?? "" })
        .onConflictDoUpdate({
          target: planningDayNotes.date,
          set: { note: note ?? "", updatedAt: new Date() },
        });

      res.json({ ok: true });
    } catch (error) {
      console.error("Error saving day note:", error);
      res.status(500).json({ error: "Error al guardar nota" });
    }
  });
}
