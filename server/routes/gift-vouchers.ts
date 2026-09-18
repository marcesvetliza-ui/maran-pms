import { Router } from "express";
import { storage } from "../db-storage";
import { insertGiftVoucherSchema } from "@shared/schema";
import type { GiftVoucherApplicationTargetType } from "@shared/schema";
import { requireAuth } from "../auth";
import { z } from "zod";

const router = Router();

const VOUCHER_ROLES = ["admin", "manager", "reception", "spa", "restaurant", "events"];

function actorName(req: any): string {
  return req.user?.username ?? req.user?.fullName ?? "sistema";
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const { status, area, search } = req.query as Record<string, string>;
    const vouchers = await storage.getGiftVouchers({ status, area, search });
    res.json(vouchers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener vouchers" });
  }
});

router.get("/available", requireAuth, async (req, res) => {
  try {
    const area = req.query.area as string;
    if (!area) return res.status(400).json({ error: "area es requerida" });
    const vouchers = await storage.getAvailableGiftVouchers(area as any);
    res.json(vouchers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener vouchers disponibles" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const voucher = await storage.getGiftVoucher(req.params.id);
    if (!voucher) return res.status(404).json({ error: "Voucher no encontrado" });
    res.json(voucher);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener voucher" });
  }
});

router.get("/:id/history", requireAuth, async (req, res) => {
  try {
    const [applications, events] = await Promise.all([
      storage.getGiftVoucherApplications(req.params.id),
      storage.getGiftVoucherEvents(req.params.id),
    ]);
    res.json({ applications, events });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener el historial del voucher" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const code = await storage.generateVoucherCode();
    const parsed = insertGiftVoucherSchema.parse({
      ...req.body,
      voucherCode: code,
      createdBy: user?.username ?? null,
    });
    const voucher = await storage.createGiftVoucher(parsed);
    res.status(201).json(voucher);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error(err);
    res.status(500).json({ error: "Error al crear voucher" });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const partial = insertGiftVoucherSchema.partial().parse(req.body);
    const updated = await storage.updateGiftVoucher(req.params.id, partial, actorName(req));
    if (!updated) return res.status(404).json({ error: "Voucher no encontrado" });
    res.json(updated);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(400).json({ error: err?.message || "Error al actualizar voucher" });
  }
});

router.post("/:id/apply", requireAuth, async (req, res) => {
  try {
    const { targetType, targetId, amount } = req.body as {
      targetType: GiftVoucherApplicationTargetType;
      targetId: string;
      amount: number;
    };
    if (!targetType || !targetId || !Number.isFinite(amount)) {
      return res.status(400).json({ error: "targetType, targetId y amount son requeridos" });
    }
    const result = await storage.applyGiftVoucher(req.params.id, targetType, targetId, amount, actorName(req));
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Error al aplicar el voucher" });
  }
});

router.post("/release", requireAuth, async (req, res) => {
  try {
    const { targetType, targetId, reason } = req.body as {
      targetType: GiftVoucherApplicationTargetType;
      targetId: string;
      reason?: string;
    };
    const application = await storage.getGiftVoucherApplicationForTarget(targetType, targetId);
    if (!application) return res.status(404).json({ error: "No hay una aplicación de voucher activa para esta operación" });
    const released = await storage.releaseGiftVoucherApplication(application.id, actorName(req), reason);
    res.json(released);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Error al liberar el voucher" });
  }
});

router.post("/consume", requireAuth, async (req, res) => {
  try {
    const { targetType, targetId } = req.body as {
      targetType: GiftVoucherApplicationTargetType;
      targetId: string;
    };
    const application = await storage.getGiftVoucherApplicationForTarget(targetType, targetId);
    if (!application) return res.status(404).json({ error: "No hay una aplicación de voucher activa para esta operación" });
    const consumed = await storage.consumeGiftVoucherApplication(application.id, actorName(req));
    res.json(consumed);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Error al consumir el voucher" });
  }
});

router.post("/:id/mark-used", requireAuth, async (req, res) => {
  try {
    const { usedNotes } = req.body as { usedNotes?: string };
    const updated = await storage.markGiftVoucherUsedManually(req.params.id, actorName(req), usedNotes);
    if (!updated) return res.status(404).json({ error: "Voucher no encontrado" });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Error al marcar el voucher como utilizado" });
  }
});

router.post("/:id/cancel", requireAuth, async (req, res) => {
  try {
    const { reason } = req.body as { reason?: string };
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "El motivo de cancelación es requerido" });
    }
    const updated = await storage.cancelGiftVoucher(req.params.id, actorName(req), reason.trim());
    if (!updated) return res.status(404).json({ error: "Voucher no encontrado" });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Error al cancelar el voucher" });
  }
});

export function registerGiftVouchersRoutes(app: any) {
  app.use("/api/gift-vouchers", router);
}
