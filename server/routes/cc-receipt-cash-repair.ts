import type { Express } from "express";
import { requireAuth, requireRole } from "../auth";
import {
  applyCashShiftRepair,
  CashShiftRepairError,
  getCashShiftRepairPreview,
} from "../billing/ccReceiptCashRepair";

const authorized = [requireAuth, requireRole(["admin", "manager"])] as const;

export function registerCcReceiptCashRepairRoutes(app: Express) {
  app.get("/api/account-movements/:id/cash-shift-repair-preview", ...authorized, async (req, res) => {
    try {
      res.json(await getCashShiftRepairPreview(req.params.id));
    } catch (error) {
      const statusCode = error instanceof CashShiftRepairError ? error.statusCode : 500;
      res.status(statusCode).json({
        error: error instanceof Error ? error.message : "No se pudo generar la vista previa.",
      });
    }
  });

  app.post("/api/account-movements/:id/cash-shift-repair", ...authorized, async (req, res) => {
    const { previewToken, targetShiftId } = req.body ?? {};
    if (typeof previewToken !== "string" || !previewToken || typeof targetShiftId !== "string" || !targetShiftId) {
      return res.status(400).json({ error: "Se requieren previewToken y targetShiftId válidos." });
    }
    try {
      res.json(await applyCashShiftRepair({
        receiptId: req.params.id,
        previewToken,
        targetShiftId,
        actor: {
          id: req.user?.id,
          fullName: req.user?.fullName,
          username: req.user?.username,
          ipAddress: req.ip || req.socket?.remoteAddress || null,
        },
      }));
    } catch (error) {
      const statusCode = error instanceof CashShiftRepairError ? error.statusCode : 500;
      res.status(statusCode).json({
        error: error instanceof Error ? error.message : "No se pudo aplicar la reasignación.",
        ...(error instanceof CashShiftRepairError && error.preview ? { preview: error.preview } : {}),
      });
    }
  });
}