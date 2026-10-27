import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { requireAuth, requirePermission } from "../auth";
import { ensureGroupFiscalCashInformation } from "./groupFiscalCash";

// Authorization and operational reconciliation are separate. Never use this
// recovery to authorize a document, apply a credit, collect or refund money.
const eligible = sql`si.group_id IS NOT NULL
  AND si.estado IN ('emitida','parcial','anulada')
  AND (si.cae ~ '^[0-9]{14}$' OR si.modo_ficticio = true)
  AND si.monto_total > 0
  AND (si.tipo_comprobante IN ('FA','FB','FC','FT','FM','FMB')
    OR (si.tipo_comprobante IN ('NCA','NCB','NCC','NCT','NCM','NCMB')
      AND si.reconciliation_status = 'conciliada'))`;

export function registerGroupFiscalCashRecoveryRoutes(app: Express) {
  app.get(
    "/api/billing/group-cash-information/pending",
    requireAuth,
    requirePermission("api:cash:area-admin"),
    async (_req, res) => {
      try {
        const rows =
          await db.execute(sql`SELECT si.id,si.tipo_comprobante,si.punto_venta,si.numero,
        si.monto_total,si.cliente_razon_social,si.group_id,g.name AS group_name
        FROM sales_invoices si LEFT JOIN groups g ON g.id=si.group_id
        WHERE ${eligible} AND NOT EXISTS (
          SELECT 1 FROM cash_movements cm
          WHERE cm.source_id=si.id::text AND cm.movement_type='informational' AND cm.anulado=false
            AND cm.source_type=CASE WHEN si.tipo_comprobante LIKE 'NC%' THEN 'nota_credito' ELSE 'comprobante_grupo' END
        ) ORDER BY si.created_at,si.id LIMIT 100`);
        res.json(rows.rows);
      } catch {
        res
          .status(503)
          .json({
            error:
              "No se pudieron consultar los registros informativos pendientes de Caja.",
          });
      }
    },
  );
  app.post(
    "/api/billing/invoices/:id/complete-cash-information",
    requireAuth,
    requirePermission("api:cash:area-admin"),
    async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0)
        return res
          .status(400)
          .json({ error: "Identificador de comprobante inválido." });
      try {
        const result = await db.transaction(async (tx) => {
          const rows = await tx.execute(
            sql`SELECT si.* FROM sales_invoices si WHERE si.id=${id} AND ${eligible} FOR UPDATE`,
          );
          const document = rows.rows[0] as any;
          if (!document)
            throw Object.assign(
              new Error(
                "El comprobante no está autorizado o todavía requiere conciliación fiscal; no se puede completar su registro informativo.",
              ),
              { statusCode: 409 },
            );
          let originalReference: string | undefined;
          if (document.tipo_comprobante.startsWith("NC")) {
            const original = await tx.execute(
              sql`SELECT tipo_comprobante,punto_venta,numero FROM sales_invoices WHERE id=${Number(document.nota_credito_id)} AND group_id=${document.group_id}`,
            );
            const row = original.rows[0] as any;
            if (!row)
              throw Object.assign(
                new Error(
                  "La NC no tiene una factura original válida del mismo grupo.",
                ),
                { statusCode: 409 },
              );
            originalReference = `${row.tipo_comprobante} ${String(row.punto_venta).padStart(4, "0")}-${String(row.numero).padStart(8, "0")}`;
          }
          const created = await ensureGroupFiscalCashInformation(
            tx,
            {
              id: document.id,
              groupId: document.group_id,
              tipoComprobante: document.tipo_comprobante,
              puntoVenta: document.punto_venta,
              numero: document.numero,
              montoTotal: document.monto_total,
              clienteRazonSocial: document.cliente_razon_social,
              originalReference,
            },
            req.user!.fullName || req.user!.username,
          );
          if (created)
            await tx.execute(sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp)
          VALUES(${req.user!.id || null},${req.user!.username},'reconcile','cash','sales_invoice',${String(id)},
          'Registro informativo de comprobante grupal recuperado sin emitir ni cobrar',
          ${JSON.stringify({ invoiceId: id, groupId: document.group_id })},NOW())`);
          return { invoiceId: id, alreadyRecorded: !created };
        });
        res.json(result);
      } catch (error: any) {
        res
          .status(error?.statusCode || 503)
          .json({
            error:
              error?.message ||
              "No se pudo completar el registro informativo. El comprobante fiscal se conserva.",
          });
      }
    },
  );
}
