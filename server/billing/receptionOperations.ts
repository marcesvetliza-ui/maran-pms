import { resolveFiscalRecipientDocument } from "./fiscalDocument";
import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { requireAuth, requirePermission } from "../auth";
import { withReservationFinancialLock } from "../nightlyPricingGuard";
import { getBillingConfig } from "./billingConfig";
import { type BillingOperation } from "./operationJournal";

const fail = (message: string, code = "BILLING_REVIEW_REQUIRED") => Object.assign(new Error(message), { statusCode: 409, code });
async function withSeriesLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  const client = await pool.connect(); let locked = false;
  try {
    locked = (await client.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked", [key])).rows[0]?.locked === true;
    if (!locked) throw fail("La serie fiscal está procesando otra operación. Volvé a verificar en unos segundos.");
    return await action();
  } finally {
    try { if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [key]); client.release(); }
    catch (error) { client.release(error as Error); }
  }
}
const invoiceReference = (value: unknown) => { try { return typeof value === "string" ? JSON.parse(value) : value; } catch { return null; } };
/** Never acknowledge money just because amounts happen to match. The original
 * request ID, reservation, invoice and frozen payment fields must all match. */
export function acknowledgedPayments(expected: any[], rows: any[], reservationId: string, invoiceId: number) {
  return expected.filter(payment => typeof payment?.paymentRequestId === "string" && String(payment.reservationId) === reservationId && rows.some(row =>
    row.payment_request_id === payment.paymentRequestId && String(row.reservation_id) === reservationId && row.status !== "anulado" &&
    Number.isFinite(Number(payment.amount)) && Math.round(Number(row.amount) * 100) === Math.round(Number(payment.amount) * 100) &&
    row.method === payment.method && String(row.date) === payment.date &&
    String(row.reference ?? "") === String(payment.reference ?? "") && String(row.notes ?? "") === String(payment.notes ?? "") &&
    Number(invoiceReference(row.invoice_ref)?.id) === invoiceId)).map(payment => payment.paymentRequestId);
}
export async function receptionOperationStatus(operation: BillingOperation) {
  const invoice = (await db.execute(operation.invoice_id
    ? sql`SELECT * FROM sales_invoices WHERE id=${operation.invoice_id} AND reserva_id=${operation.owner_id}`
    : sql`SELECT * FROM sales_invoices WHERE reserva_id=${operation.owner_id} AND credit_reapplication_intent->>'operationId'=${operation.operation_id} ORDER BY id DESC LIMIT 1`)).rows[0] as any;
  const recovery = operation.request_snapshot?.prefacturaRecovery;
  const expected = Array.isArray(recovery?.payments) ? recovery.payments : [];
  const ids = expected.map((row: any) => row.paymentRequestId).filter((id: any) => typeof id === "string");
  const payments = ids.length ? (await db.execute(sql`SELECT * FROM payments WHERE reservation_id=${operation.owner_id} AND payment_request_id IN (${sql.join(ids.map((id: string) => sql`${id}`), sql`,`)})`)).rows : [];
  const acknowledged = invoice ? acknowledgedPayments(expected, payments, operation.owner_id, Number(invoice.id)) : [];
  const safeToCorrect = recovery?.version === 2 && ["prepared", "blocked"].includes(operation.stage) && !operation.invoice_id && !invoice && payments.length === 0;
  const canVerifyRejection = operation.stage === "rejected" && invoice?.estado === "autorizacion_pendiente" && !invoice.cae;
  const intent = invoice?.credit_reapplication_intent;
  const ccDone = operation.request_snapshot?.reservationSettlementMethod !== "cuenta_corriente" && operation.request_snapshot?.cashFormaPago !== "cuenta_corriente" || intent?.settlement?.status === "completed";
  const creditsDone = !(operation.request_snapshot?.creditReapplications?.length || operation.request_snapshot?.ordinaryAdvanceApplications?.length) || intent?.status === "completed";
  const issued = ["emitida", "parcial"].includes(String(invoice?.estado));
  const financiallyComplete = issued && acknowledged.length === expected.length && ccDone && creditsDone;
  return {
    operationId: operation.operation_id, stage: issued ? "authorized" : operation.stage, safeToCorrect, canVerifyRejection,
    acknowledgedPaymentIds: acknowledged, financiallyComplete, code: operation.error_code,
    message: operation.error_code === "BILLING_NUMBER_CONFLICT" ? `La serie ${operation.fiscal_identity.type}, PV ${operation.fiscal_identity.pointOfSale}, número ${operation.request_snapshot?._numberAttempt ?? "propuesto"}, está ocupada por otro registro. No se solicitó autorización. Administración debe revisar la numeración.` : null,
    invoice: issued ? { id: invoice.id, tipoComprobante: invoice.tipo_comprobante, puntoVenta: invoice.punto_venta, numero: invoice.numero, montoTotal: invoice.monto_total, cae: invoice.cae, paymentId: invoice.payment_id } : null,
    attempt: recovery?.version === 2 ? { invoiceRequest: operation.request_snapshot,
      invoice: issued && ccDone && creditsDone ? { id: invoice.id, tipoComprobante: invoice.tipo_comprobante, puntoVenta: invoice.punto_venta, numero: invoice.numero, montoTotal: invoice.monto_total, cae: invoice.cae, paymentId: invoice.payment_id } : null,
      payments: expected, checkoutRequested: recovery.checkoutRequested === true, acknowledgedPaymentIds: acknowledged } : null,
  };
}

export function registerReceptionOperationRoutes(app: Express) {
  app.get("/api/billing/reservations/:reservationId/pending-operation", requireAuth, requirePermission("sidebar:/reservations"), async (req, res) => {
    try {
      // Read-only discovery never queues on a financial lock or holds a pool
      // connection while another request is waiting for ARCA. Correction
      // rechecks this evidence under the write locks before changing anything.
      const result = await (async () => {
        const rows = (await db.execute(sql`SELECT * FROM billing_operations WHERE owner_type='reservation' AND owner_id=${req.params.reservationId} AND stage<>'corrected' ORDER BY created_at DESC LIMIT 20`)).rows as BillingOperation[];
        for (const operation of rows) {
          const status = await receptionOperationStatus(operation);
          if (status.attempt && !status.financiallyComplete) return status;
        }
        return null;
      })();
      res.json({ pending: result });
    } catch { res.status(503).json({ error: "No se pudo consultar el intento pendiente. Conservá la pantalla y volvé a intentar." }); }
  });

  app.get("/api/billing/reservations/:reservationId/operations/:operationId/reception-status", requireAuth, requirePermission("sidebar:/reservations"), async (req, res) => {
    try {
      const status = await (async () => {
        const operation = (await db.execute(sql`SELECT * FROM billing_operations WHERE operation_id=${req.params.operationId} AND owner_type='reservation' AND owner_id=${req.params.reservationId}`)).rows[0] as BillingOperation;
        return operation ? receptionOperationStatus(operation) : null;
      })();
      res.json(status || { safeToCorrect: false, stage: "legacy_unknown", acknowledgedPaymentIds: [], attempt: null });
    } catch { res.status(503).json({ error: "No se pudo verificar la operación. No se modificó el intento." }); }
  });

  app.post("/api/billing/reservations/:reservationId/operations/:operationId/correct-reception", requireAuth, requirePermission("sidebar:/reservations"), async (req, res) => {
    try {
      const result = await withReservationFinancialLock(req.params.reservationId, async () => {
        const operation = (await db.execute(sql`SELECT * FROM billing_operations WHERE operation_id=${req.params.operationId} AND owner_type='reservation' AND owner_id=${req.params.reservationId}`)).rows[0] as BillingOperation;
        if (!operation) throw fail("El intento es anterior a estos controles. Requiere revisión; no se descarta automáticamente.");
        if (operation.stage === "corrected") return { corrected: true, request: operation.request_snapshot };
        const identity = operation.fiscal_identity;
        return withSeriesLock(`funding-fiscal:${identity.environment}:${identity.issuer}:${identity.type}:${identity.pointOfSale}`, async () => {
          const status = await receptionOperationStatus(operation);
          if (!status.safeToCorrect && !status.canVerifyRejection) throw fail("El resultado fiscal no permite descartar el intento. Completá la misma operación o pedí una conciliación.");
          const invoice = operation.invoice_id ? (await db.execute(sql`SELECT * FROM sales_invoices WHERE id=${operation.invoice_id}`)).rows[0] as any : null;
          if (invoice) {
            const intent = invoice.credit_reapplication_intent;
            if (invoice.cae || invoice.modo_ficticio || invoice.estado !== "autorizacion_pendiente" || intent?.status === "completed" || intent?.settlement?.status === "completed" || invoice.group_id || invoice.spa_account_id || invoice.restaurant_order_id) throw fail("Hay anticipos u otros vínculos que requieren conciliación. Conservamos el intento.");
            const config = await getBillingConfig();
            if (config.arcaAmbiente !== identity.environment || String(config.arcaCuit || config.cuit).replace(/\D/g, "") !== identity.issuer) throw fail("La configuración fiscal cambió. La revisión debe usar el ambiente y emisor originales.");
            const { getTokenAuth } = await import("./wsaaClient");
            const { feCompConsultar } = await import("./wsfevClient");
            const { token, sign } = await getTokenAuth(config.arcaCert!, config.arcaKey!, identity.environment as any);
            const document = resolveFiscalRecipientDocument({ cuit: invoice.cliente_cuit, dni: invoice.cliente_dni, documentType: invoice.cliente_document_type });
            const authorized = await feCompConsultar({ tipo: identity.type, puntoVenta: identity.pointOfSale, numero: Number(invoice.numero), cuitEmisor: identity.issuer, token, sign }, identity.environment as any,
              { total: Number(invoice.monto_total), fecha: String(invoice.fecha_emision).replaceAll("-", ""), docTipo: document.tipo, docNro: document.numero });
            if (authorized) {
              return db.transaction(async tx => {
                const updated = await tx.execute(sql`UPDATE sales_invoices SET cae=${authorized.cae},cae_fecha_vto=${authorized.caeFechaVto.toISOString().slice(0,10)},estado='emitida',modo_ficticio=false,reconciliation_status='pendiente',reconciliation_error=NULL,reconciliation_updated_at=now() WHERE id=${invoice.id} AND estado='autorizacion_pendiente' AND cae IS NULL RETURNING id`);
                if (!updated.rows.length) throw fail("El comprobante cambió durante la verificación. Actualizá la pantalla.");
                await tx.execute(sql`UPDATE billing_operations SET stage='authorized',error_code=NULL,updated_at=now() WHERE operation_id=${operation.operation_id}`);
                await tx.execute(sql`INSERT INTO audit_logs(user_id,action,module,entity_type,entity_id,description,details,timestamp) VALUES(${req.user?.id || null},'update','billing','billing_operation',${operation.operation_id},'Autorización existente verificada sin nueva emisión',${JSON.stringify({ operationId: operation.operation_id, invoiceId: invoice.id, requestHash: operation.payload_hash })},now())`);
                return { recovered: true };
              });
            }
          }
          return db.transaction(async tx => {
            const current = (await tx.execute(sql`SELECT * FROM billing_operations WHERE operation_id=${operation.operation_id} FOR UPDATE`)).rows[0] as BillingOperation;
            if (current.stage !== operation.stage || current.invoice_id !== operation.invoice_id) throw fail("La operación cambió. Actualizá la pantalla.");
            // Recheck all financial links before deleting an unissued local draft.
            if (invoice) {
              const payments = (await tx.execute(sql`SELECT invoice_ref,invoice_link_failed FROM payments WHERE reservation_id=${operation.owner_id} AND status<>'anulado' FOR UPDATE`)).rows as any[];
              if (payments.some(payment => payment.invoice_link_failed || Number(invoiceReference(payment.invoice_ref)?.id) === Number(invoice.id))) throw fail("Hay pagos vinculados a este borrador. Conservamos el intento para conciliación.");
              const linked = await tx.execute(sql`SELECT 1 FROM folio_movements WHERE source_type IN ('invoice','comprobante') AND source_id=${String(invoice.id)}
                UNION ALL SELECT 1 FROM sales_invoices WHERE nota_credito_id=${invoice.id}
                UNION ALL SELECT 1 FROM cash_movements WHERE source_type='comprobante' AND source_id=${String(invoice.id)}
                UNION ALL SELECT 1 FROM account_movements WHERE reference=${String(invoice.tipo_comprobante) + " " + String(invoice.punto_venta).padStart(4,"0") + "-" + String(invoice.numero).padStart(8,"0")} LIMIT 1`);
              if (linked.rows.length) throw fail("Hay movimientos relacionados. Conservamos el borrador para conciliación.");
              await tx.execute(sql`UPDATE billing_operations SET request_snapshot=jsonb_set(request_snapshot,'{discardedDraft}',${JSON.stringify(invoice)}::jsonb),invoice_id=NULL WHERE operation_id=${operation.operation_id}`);
              await tx.execute(sql`DELETE FROM sales_invoices WHERE id=${invoice.id} AND estado='autorizacion_pendiente' AND cae IS NULL`);
            }
            await tx.execute(sql`UPDATE billing_operations SET stage='corrected',updated_at=now() WHERE operation_id=${operation.operation_id}`);
            await tx.execute(sql`INSERT INTO audit_logs(user_id,action,module,entity_type,entity_id,description,details,timestamp)
              VALUES(${req.user?.id || null},'update','billing','billing_operation',${operation.operation_id},'Intento fiscal corregido sin emitir ni cobrar',${JSON.stringify({ operationId: operation.operation_id, priorStage: operation.stage, invoiceId: operation.invoice_id, requestHash: operation.payload_hash, arcaNotAuthorized: !!invoice })},now())`);
            return { corrected: true, request: operation.request_snapshot };
          });
        });
      });
      res.json(result);
    } catch (error: any) { res.status(error?.statusCode || 502).json({ error: error?.message || "No se pudo verificar la corrección. Conservamos el intento." }); }
  });
}
