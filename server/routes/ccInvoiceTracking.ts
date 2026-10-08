import {addCcManualTracking} from '../ccManualTracking';
import {db,withDatabaseTransaction} from '../db';
import {sql} from 'drizzle-orm';
import type { Express } from "express";
import {
  getCcInvoiceTrackingList, upsertCcInvoiceTracking, getCcInvoiceTrackingMonthReport,
  backfillCcInvoiceRecipients,
} from "../ccInvoiceTracking";
import { requireAuth, requireRole, requirePermission } from "../auth";

export function registerCcInvoiceTrackingRoutes(app: Express) {
  // Vincula retroactivamente facturas CC emitidas antes de que este
  // seguimiento existiera (ver backfillCcInvoiceRecipients). Un solo uso
  // por lote de facturas sin vincular — se puede correr más de una vez sin
  // riesgo, ya que solo toca filas con recipientEntityType nulo.
  app.post("/api/cc-invoice-tracking/backfill-recipients", requireAuth, requirePermission("api:admin:reconcile-cc-payments"), async (_req, res) => {
    try {
      const result = await backfillCcInvoiceRecipients();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error vinculando facturas CC antiguas" });
    }
  });

  const manageManual=requireRole(['admin','jefe_recepcion']);
  app.get('/api/cc-invoice-tracking/candidates',requireAuth,manageManual,async(req,res)=>{
    try{const search=String(req.query.search??'').trim().slice(0,150);
      const result=await db.execute(sql`SELECT id,cliente_razon_social AS name,fecha_emision AS fecha,monto_total AS monto,
       tipo_comprobante || ' ' || lpad(punto_venta::text,4,'0') || '-' || lpad(numero::text,8,'0') AS reference
       FROM sales_invoices si WHERE estado='emitida' AND cash_forma_pago='cuenta_corriente' AND tipo_comprobante LIKE 'F%'
       AND NOT EXISTS(SELECT 1 FROM cc_manual_tracking m WHERE m.sales_invoice_id=si.id)
       AND (cliente_razon_social ILIKE ${'%'+search+'%'} OR numero::text ILIKE ${'%'+search+'%'}) ORDER BY fecha_emision DESC,id DESC LIMIT 100`);res.json(result.rows);
    }catch(error:any){res.status(500).json({error:error.message});}
  });
  app.post('/api/cc-invoice-tracking/manual',requireAuth,manageManual,async(req,res)=>{
    try{res.status(201).json(await addCcManualTracking(req.body,req.user?.username??null));}
    catch(error:any){const code=error.code??error.cause?.code;res.status(code==='23505'?409:400).json({error:code==='23505'?'Esta factura ya tiene seguimiento manual':error.message});}
  });
  app.put('/api/cc-invoice-tracking/manual/:id',requireAuth,manageManual,async(req,res)=>{
    const {estado,observaciones}=req.body;
    if(!['pendiente','enviada','reclamada','pagada','cargada_extranet'].includes(estado)||typeof observaciones!=='string'||observaciones.length>5000)return res.status(400).json({error:'Datos inválidos'});
    try{const id=Number(req.params.id);if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Seguimiento inválido'});
      const updated=await withDatabaseTransaction(async()=>{
       const result=await db.execute(sql`UPDATE cc_manual_tracking SET estado=${estado},observaciones=${observaciones},updated_by=${req.user?.username??null},updated_at=now() WHERE id=${id} RETURNING id`);
       if(!result.rows.length)return false;
       await db.execute(sql`INSERT INTO audit_logs(action,module,entity_type,entity_id,description,details,user_name,timestamp) VALUES('update','admin','cc_manual_tracking',${String(id)},'Seguimiento manual actualizado',${JSON.stringify({estado,observaciones})}::jsonb,${req.user?.username??null},now())`);return true;
      });if(!updated)return res.status(404).json({error:'Seguimiento no encontrado'});res.json({ok:true});}
    catch(error:any){res.status(400).json({error:error.message});}
  });

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
