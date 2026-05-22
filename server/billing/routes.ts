import type { Express } from "express";
import { db } from "../db";
import { sql, desc, and, gte, lte, eq } from "drizzle-orm";
import { salesInvoices, invoiceCounters } from "@shared/schema";
import { getBillingConfig, updateBillingConfig } from "./billingConfig";
import { emitirFactura, type NewInvoiceData } from "./invoiceService";
import { generarFacturaPDF } from "./invoicePdf";
import { requireAuth } from "../auth";

export function registerBillingRoutes(app: Express) {

  // GET /api/billing/config
  app.get("/api/billing/config", requireAuth, async (req, res) => {
    try {
      const config = await getBillingConfig();
      // Never expose certificates over the API
      const { arcaCert, arcaKey, ...safe } = config as any;
      res.json({ ...safe, hasArcaCert: !!arcaCert, hasArcaKey: !!arcaKey });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/billing/config
  app.patch("/api/billing/config", requireAuth, async (req, res) => {
    try {
      const allowed = [
        "modoArca", "arcaAmbiente", "cuit", "razonSocial", "domicilioComercial", "localidad",
        "provincia", "cp", "condicionIva", "inicioActividades",
        "puntoVenta", "puntoVentaHomolog", "tipoPuntoVenta", "arcaCuit", "logoUrl",
        "arcaCert", "arcaKey",
      ];
      const data: any = {};
      for (const k of allowed) {
        if (req.body[k] !== undefined) data[k] = req.body[k];
      }
      const updated = await updateBillingConfig(data);
      const { arcaCert, arcaKey, ...safe } = updated as any;
      res.json({ ...safe, hasArcaCert: !!arcaCert, hasArcaKey: !!arcaKey });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/billing/next-number?tipo=FA
  app.get("/api/billing/next-number", requireAuth, async (req, res) => {
    try {
      const { tipo } = req.query as Record<string, string>;
      const config = await getBillingConfig();
      const pv = config.puntoVenta ?? 1;
      const row = await db.execute(sql`
        SELECT ultimo_numero FROM invoice_counters
        WHERE tipo_comprobante = ${tipo} AND punto_venta = ${pv}
      `);
      const last = (row.rows[0] as any)?.ultimo_numero ?? 0;
      res.json({ tipo, puntoVenta: pv, proximoNumero: last + 1 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/billing/invoices
  app.get("/api/billing/invoices", requireAuth, async (req, res) => {
    try {
      const { desde, hasta, tipo, clienteCuit } = req.query as Record<string, string>;
      let whereClause = sql`1=1`;
      if (desde) whereClause = sql`${whereClause} AND fecha_emision >= ${desde}`;
      if (hasta) whereClause = sql`${whereClause} AND fecha_emision <= ${hasta}`;
      if (tipo) whereClause = sql`${whereClause} AND tipo_comprobante = ${tipo}`;
      if (clienteCuit) whereClause = sql`${whereClause} AND cliente_cuit = ${clienteCuit}`;

      const rows = await db.execute(sql`
        SELECT * FROM sales_invoices
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT 200
      `);
      res.json(rows.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/billing/invoices/:id
  app.get("/api/billing/invoices/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const row = await db.execute(sql`SELECT * FROM sales_invoices WHERE id = ${id}`);
      if (!row.rows.length) return res.status(404).json({ error: "Factura no encontrada" });
      res.json(row.rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/billing/invoices
  app.post("/api/billing/invoices", requireAuth, async (req, res) => {
    try {
      const { tipoComprobante, cliente, items, reservaId, folioId } = req.body;
      if (!tipoComprobante || !cliente || !items?.length) {
        return res.status(400).json({ error: "tipoComprobante, cliente e items son requeridos" });
      }
      const user = (req as any).user;
      const factura = await emitirFactura({
        tipoComprobante,
        cliente,
        items,
        reservaId,
        folioId,
        operador: user?.fullName || user?.username,
      } as NewInvoiceData);
      res.status(201).json(factura);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/billing/invoices/:id/pdf
  app.get("/api/billing/invoices/:id/pdf", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const row = await db.execute(sql`SELECT * FROM sales_invoices WHERE id = ${id}`);
      if (!row.rows.length) return res.status(404).json({ error: "Factura no encontrada" });
      const factura = row.rows[0] as any;
      const config = await getBillingConfig();
      const pdfBuf = await generarFacturaPDF(factura, config);
      const tipo = factura.tipo_comprobante ?? "F";
      const pv = String(factura.punto_venta ?? 1).padStart(4, "0");
      const nro = String(factura.numero ?? 0).padStart(8, "0");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${tipo}_${pv}_${nro}.pdf"`);
      res.send(pdfBuf);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/billing/test-connection — prueba la conexión con ARCA (solo WSAA)
  app.post("/api/billing/test-connection", requireAuth, async (req, res) => {
    try {
      const config = await getBillingConfig();
      const ambiente = ((config as any).arcaAmbiente ?? "ficticio") as string;

      if (ambiente === "ficticio") {
        return res.status(400).json({ error: "Modo ficticio activo. Seleccionar homologación o producción." });
      }
      if (!config.arcaCert || !config.arcaKey) {
        return res.status(400).json({ error: "Faltan certificado y/o clave privada." });
      }

      const { getTokenAuth } = await import("./wsaaClient");
      const ta = await getTokenAuth(
        config.arcaCert,
        config.arcaKey,
        ambiente as "homologacion" | "produccion"
      );

      res.json({
        ok: true,
        ambiente,
        mensaje: `Conexión exitosa con ARCA (${ambiente}). Token obtenido correctamente.`,
        tokenPreview: ta.token.slice(0, 30) + "...",
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST /api/billing/invoices/:id/nota-credito
  app.post("/api/billing/invoices/:id/nota-credito", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const row = await db.execute(sql`SELECT * FROM sales_invoices WHERE id = ${id}`);
      if (!row.rows.length) return res.status(404).json({ error: "Factura no encontrada" });
      const original = row.rows[0] as any;

      if (original.estado === "anulada") {
        return res.status(400).json({ error: "La factura ya tiene una nota de crédito emitida" });
      }

      const { motivo, items } = req.body;
      const tipoNC = original.tipo_comprobante === "FA" ? "NCA" : "NCB";
      const user = (req as any).user;

      const nc = await emitirFactura({
        tipoComprobante: tipoNC as any,
        cliente: {
          razonSocial: original.cliente_razon_social,
          cuit: original.cliente_cuit,
          dni: original.cliente_dni,
          condicionIva: original.cliente_condicion_iva,
          domicilio: original.cliente_domicilio,
        },
        items: items ?? original.items ?? [],
        facturaOriginalId: original.id,
        operador: user?.fullName || user?.username,
      } as NewInvoiceData);

      // Mark original as anulada
      await db.execute(sql`
        UPDATE sales_invoices SET estado = 'anulada', nota_credito_id = ${nc.id}
        WHERE id = ${id}
      `);

      res.status(201).json(nc);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
