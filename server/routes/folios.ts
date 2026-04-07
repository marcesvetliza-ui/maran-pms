import type { Express } from "express";
import { storage } from "../db-storage";
import { requireAuth } from "../auth";
import type { FolioEntityType, FolioStatus } from "@shared/schema";

export function registerFolioRoutes(app: Express) {

  // MUST be before /:entityType/:entityId to avoid route collision
  app.get("/api/folios/stats/summary", requireAuth, async (req, res) => {
    try {
      const { db } = await import("../db");
      const { folios } = await import("@shared/schema");
      const { sql } = await import("drizzle-orm");

      const [totals] = await db.select({
        open: sql<number>`COUNT(*) FILTER (WHERE status = 'open')`,
        closed: sql<number>`COUNT(*) FILTER (WHERE status = 'closed')`,
        total_balance: sql<number>`COALESCE(SUM(balance::numeric), 0)`,
        total_charges: sql<number>`COALESCE(SUM(total_charges::numeric), 0)`,
        total_payments: sql<number>`COALESCE(SUM(total_payments::numeric), 0)`,
      }).from(folios);

      res.json({
        openFolios: Number(totals.open),
        closedFolios: Number(totals.closed),
        totalBalance: Number(totals.total_balance),
        totalCharges: Number(totals.total_charges),
        totalPayments: Number(totals.total_payments),
      });
    } catch (error) {
      console.error("Error fetching folio stats:", error);
      res.status(500).json({ error: "Error al obtener estadísticas de folios" });
    }
  });

  app.get("/api/folios/:entityType/:entityId", requireAuth, async (req, res) => {
    try {
      const { entityType, entityId } = req.params;
      const folio = await storage.getFolioWithMovementsByEntity(
        entityType as FolioEntityType,
        entityId,
      );
      if (!folio) {
        return res.json(null);
      }
      res.json(folio);
    } catch (error) {
      console.error("Error fetching folio:", error);
      res.status(500).json({ error: "Error al obtener el folio" });
    }
  });

  app.post("/api/folios/:entityType/:entityId/ensure", requireAuth, async (req, res) => {
    try {
      const { entityType, entityId } = req.params;
      const folio = await storage.getOrCreateFolio(entityType as FolioEntityType, entityId);
      res.json(folio);
    } catch (error) {
      console.error("Error creating folio:", error);
      res.status(500).json({ error: "Error al crear el folio" });
    }
  });

  app.post("/api/folios/:folioId/movements", requireAuth, async (req, res) => {
    try {
      const { folioId } = req.params;
      const folio = await storage.getFolioById(folioId);
      if (!folio) return res.status(404).json({ error: "Folio no encontrado" });

      const { type, amount, description, paymentMethod, sourceType, sourceId, registeredBy, receiptType } = req.body;
      const movement = await storage.addFolioAdjustment(
        folioId, type, parseFloat(amount), description,
        registeredBy, undefined, undefined,
      );
      res.status(201).json(movement);
    } catch (error) {
      console.error("Error adding folio movement:", error);
      res.status(500).json({ error: "Error al agregar movimiento al folio" });
    }
  });

  app.post("/api/folios/:folioId/close", requireAuth, async (req, res) => {
    try {
      const { folioId } = req.params;
      const user = (req as any).user;
      const folio = await storage.closeFolio(folioId, user?.username || "sistema");
      res.json(folio);
    } catch (error) {
      console.error("Error closing folio:", error);
      res.status(500).json({ error: "Error al cerrar el folio" });
    }
  });

  app.post("/api/folios/:folioId/reopen", requireAuth, async (req, res) => {
    try {
      const { folioId } = req.params;
      const [updated] = await (await import("../db")).db
        .update((await import("@shared/schema")).folios)
        .set({ status: "open", closedAt: null, closedBy: null })
        .where((await import("drizzle-orm")).eq((await import("@shared/schema")).folios.id, folioId))
        .returning();
      if (!updated) return res.status(404).json({ error: "Folio no encontrado" });
      res.json(updated);
    } catch (error) {
      console.error("Error reopening folio:", error);
      res.status(500).json({ error: "Error al reabrir el folio" });
    }
  });

  app.get("/api/folios", requireAuth, async (req, res) => {
    try {
      const { entityType, status } = req.query;
      const result = await storage.listFolios(
        entityType as FolioEntityType | undefined,
        status as FolioStatus | undefined,
      );
      res.json(result);
    } catch (error) {
      console.error("Error listing folios:", error);
      res.status(500).json({ error: "Error al listar folios" });
    }
  });

}
