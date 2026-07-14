import { Router } from "express";
import { storage } from "../db-storage";
import { insertGiftVoucherSchema } from "@shared/schema";
import { requireAuth } from "../auth";
import { z } from "zod";

const router = Router();

const VOUCHER_ROLES = ["admin", "manager", "reception", "spa", "restaurant", "events"];

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

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const voucher = await storage.getGiftVoucher(req.params.id);
    if (!voucher) return res.status(404).json({ error: "Voucher no encontrado" });
    res.json(voucher);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener voucher" });
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
    const updated = await storage.updateGiftVoucher(req.params.id, partial);
    if (!updated) return res.status(404).json({ error: "Voucher no encontrado" });
    res.json(updated);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Error al actualizar voucher" });
  }
});

router.post("/:id/use", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const { usedNotes } = req.body as { usedNotes?: string };
    const updated = await storage.markGiftVoucherUsed(
      req.params.id,
      user?.username ?? "sistema",
      usedNotes
    );
    if (!updated) return res.status(404).json({ error: "Voucher no encontrado" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Error al marcar voucher como usado" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const ok = await storage.deleteGiftVoucher(req.params.id);
    if (!ok) return res.status(404).json({ error: "Voucher no encontrado" });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar voucher" });
  }
});

export function registerGiftVouchersRoutes(app: any) {
  app.use("/api/gift-vouchers", router);
}
