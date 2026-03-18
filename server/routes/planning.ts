import type { Express } from "express";
import { storage } from "../db-storage";

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
}
