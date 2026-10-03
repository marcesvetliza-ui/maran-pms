import type { Express } from "express";
import {
  getCcInvoiceTrackingList, upsertCcInvoiceTracking, getCcInvoiceTrackingMonthReport,
} from "../ccInvoiceTracking";

export function registerCcInvoiceTrackingRoutes(app: Express) {
  app.get("/api/cc-invoice-tracking", async (req, res) => {
    try {
      const { from, to, entityType, entityId, estado, search } = req.query as Record<string, string | undefined>;
      const rows = await getCcInvoiceTrackingList({
        from, to,
        entityType: entityType === "company" || entityType === "agency" ? entityType : undefined,
        entityId, estado: estado as any, search,
      });
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error obteniendo el seguimiento de facturas CC" });
    }
  });

  app.put("/api/cc-invoice-tracking/:salesInvoiceId", async (req, res) => {
    try {
      const salesInvoiceId = parseInt(req.params.salesInvoiceId, 10);
      if (!Number.isInteger(salesInvoiceId)) return res.status(400).json({ error: "Factura inválida" });
      const { estado, observaciones } = req.body;
      const user = (req as any).user?.fullName || (req as any).user?.username || null;
      await upsertCcInvoiceTracking(salesInvoiceId, { estado, observaciones }, user);
      const [row] = await getCcInvoiceTrackingList({ salesInvoiceId });
      res.json(row ?? { ok: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Error guardando el seguimiento" });
    }
  });

  app.get("/api/cc-invoice-tracking/month/:year/:month", async (req, res) => {
    try {
      const year = parseInt(req.params.year, 10);
      const month = parseInt(req.params.month, 10);
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: "Año o mes inválido" });
      }
      const summary = await getCcInvoiceTrackingMonthReport(year, month);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error obteniendo el informe mensual" });
    }
  });
}
