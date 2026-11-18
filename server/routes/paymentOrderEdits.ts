import type { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth, requirePermission } from "../auth";
import { editPaymentOrder, paymentOrderEditInput, readPaymentOrderEdit } from "../paymentOrderEdit";

export function registerPaymentOrderEditRoutes(app: Express) {
  const permission = "api:purchase-invoices:write";
  const validId = (value: string) => /^\d+$/.test(value) && Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2147483647;
  app.get("/api/payment-orders/:id/edit", requireAuth, requirePermission(permission), async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: "OP inválida" });
    try {
      const op = await readPaymentOrderEdit(db, Number(req.params.id));
      const history = (await db.execute(sql`SELECT user_name,timestamp,details FROM audit_logs WHERE entity_type='payment_order_edit' AND entity_id=${req.params.id} ORDER BY timestamp DESC,id DESC LIMIT 10`)).rows;
      res.json({ ...op, history });
    } catch (error: any) { res.status(error.statusCode || 500).json({ error: error.message }); }
  });
  app.patch("/api/payment-orders/:id", requireAuth, requirePermission(permission), async (req, res) => {
    const input = paymentOrderEditInput.safeParse(req.body);
    if (!validId(req.params.id) || !input.success) return res.status(400).json({ error: "Revisá la fecha, forma de pago, observaciones y motivo de la corrección." });
    try {
      const op = await db.transaction(tx => editPaymentOrder(tx, Number(req.params.id), input.data, { id: req.user!.id, name: req.user!.fullName || req.user!.username }));
      res.json(op);
    } catch (error: any) { res.status(error.statusCode || 500).json({ error: error.message }); }
  });
}
