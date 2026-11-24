import { cancelledReceptionCollection, CANCELLED_COLLECTION_ROLES } from "./cancelledReceptionCollection";
import { voidReservationPaymentWithLedger } from "../reservationPaymentVoid";
import { canCloseCancelledReceptionOperation } from "./cancelledReceptionOperation";
import { resolveFiscalRecipientDocument } from "./fiscalDocument";
import { prepareExcessReservationCollection } from "./excessReservationCollection";
import {reservationCollectionReceipts,generateReservationCollectionReceiptPdf} from './reservationCollectionReceipt';
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
    // An advance may have subsequently been applied to another document.
    // Its original payment key and immutable monetary fields still prove receipt.
    (payment.unlinkedAdvance === true || Number(invoiceReference(row.invoice_ref)?.id) === invoiceId))).map(payment => payment.paymentRequestId);
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
  const paymentConflicts = expected.filter((payment: any) => !acknowledged.includes(payment.paymentRequestId) && payments.some((saved: any) => saved.payment_request_id === payment.paymentRequestId)).map((payment: any) => payment.paymentRequestId);
  const archived = operation.stage === "corrected" && ["BILLING_REJECTED_DRAFT_RETIRED", "BILLING_UNSENT_DRAFT_RETIRED"].includes(String(operation.error_code));
  const safeToCorrect = recovery?.version === 2 && (["prepared", "blocked"].includes(operation.stage) || archived) && !operation.invoice_id && !invoice && payments.length === 0;
  const canRetryNumberConflict = recovery?.version === 2 && operation.stage === "blocked" && operation.error_code === "BILLING_NUMBER_CONFLICT" && !operation.invoice_id && !invoice && payments.length === 0;
  const conflict = canRetryNumberConflict && Number.isSafeInteger(operation.request_snapshot?._numberAttempt)
    ? (await db.execute(sql`SELECT id FROM sales_invoices WHERE tipo_comprobante=${operation.fiscal_identity.type} AND punto_venta=${operation.fiscal_identity.pointOfSale} AND numero=${operation.request_snapshot._numberAttempt} LIMIT 1`)).rows[0] as any
    : null;
  const canVerifyRejection = operation.stage === "rejected" && invoice?.estado === "autorizacion_pendiente" && !invoice.cae;
  const intent = invoice?.credit_reapplication_intent;
  const ccDone = operation.request_snapshot?.reservationSettlementMethod !== "cuenta_corriente" && operation.request_snapshot?.cashFormaPago !== "cuenta_corriente" || intent?.settlement?.status === "completed";
  const creditsDone = !(operation.request_snapshot?.creditReapplications?.length || operation.request_snapshot?.ordinaryAdvanceApplications?.length) || intent?.status === "completed";
  const issued = ["emitida", "parcial"].includes(String(invoice?.estado));
  const canCloseCancelled = await canCloseCancelledReceptionOperation(db, operation, invoice);
  const collectionCorrectionCompleted = operation.stage === 'corrected' && operation.error_code === 'BILLING_CANCELLED_COLLECTION_REVERSED';
  const cancelledCollection = collectionCorrectionCompleted ? null : await cancelledReceptionCollection(db, operation, invoice);
  const departure = recovery?.checkoutDebtAccount && recovery.checkoutRequested
    ? (await db.execute(sql`SELECT status FROM reservations WHERE id=${operation.owner_id}`)).rows[0] as any : null;
  const debt = recovery?.checkoutDebtAccount;
  // Reopening a stay does not undo its already committed account transfer.
  // Prove that exact departure by its payment key, linked account movement and
  // atomic checkout audit. Matching amounts or the current room status alone
  // must never authorize dropping an unfinished recovery attempt.
  // Later reversals affect the live balance, not the historical completion of
  // that departure. Its original ledger rows and audit must still match.
  const completedDeparture = departure && departure.status !== 'checked_out' &&
    typeof debt?.operationId === 'string' && typeof debt?.entityId === 'string' &&
    ['guest','company','agency'].includes(debt?.entityType) && Number.isFinite(Number(debt.maximumBalance)) && Number(debt.maximumBalance) > 0
    ? (await db.execute(sql`SELECT p.id FROM payments p JOIN account_movements m ON m.payment_id=p.id
      WHERE p.reservation_id=${operation.owner_id} AND p.payment_request_id=${debt.operationId}
        AND p.method='cuenta_corriente'
        AND p.amount>0 AND p.amount<=${String(debt.maximumBalance)}::numeric
        AND p.reference=${`checkout-cc:${operation.owner_id}:${debt.operationId}`}
        AND m.reservation_id=p.reservation_id AND m.entity_type=${debt.entityType} AND m.entity_id=${debt.entityId}
        AND m.type='cargo' AND m.amount=p.amount AND m.reference=p.reference
        AND EXISTS(SELECT 1 FROM audit_logs a WHERE a.entity_type='reservation' AND a.entity_id=p.reservation_id
          AND a.action='update' AND a.module='reservations'
          AND a.details::jsonb->>'operationId'=${debt.operationId} AND a.details::jsonb->>'paymentId'=p.id
          AND a.details::jsonb->>'amount'=p.amount::text
          AND a.details::jsonb->>'accountEntityType'=${debt.entityType} AND a.details::jsonb->>'accountEntityId'=${debt.entityId})
      LIMIT 1`)).rows.length > 0 : false;
  const financiallyComplete = issued && acknowledged.length === expected.length && ccDone && creditsDone && (!departure || departure.status === 'checked_out' || completedDeparture);
  return {
    operationId: operation.operation_id, stage: invoice?.estado === "anulada" ? "cancelled" : issued ? "authorized" : operation.stage, safeToCorrect, canVerifyRejection, canCloseCancelled, canRetryNumberConflict,
    acknowledgedPaymentIds: acknowledged, paymentConflicts, financiallyComplete,
    departureReopened: completedDeparture && departure?.status === 'checked_in',
    cancelledCollection, collectionCorrectionCompleted, code: operation.error_code,
    paymentConflictMessage: paymentConflicts.length ? "El cobro de este intento ya existe, pero fue modificado o requiere conciliación. Administración debe revisar el pago vinculado; no se volverá a cobrar ni a cambiar su forma de pago. El check-out se gestiona por separado desde la reserva, trasladando el saldo actual a Cuenta Corriente si corresponde." : null,
    message: invoice?.estado === "anulada" ? `La factura ${invoice.tipo_comprobante} ${invoice.punto_venta}-${invoice.numero} de este intento está anulada. ${canCloseCancelled ? "Podés cerrar el intento anterior sin emitir ni cobrar y volver a revisar la cuenta vigente." : "Su anulación o sus cobros requieren conciliación antes de cerrar el intento."}` : operation.error_code === "BILLING_NUMBER_CONFLICT" ? `La serie ${operation.fiscal_identity.type}, PV ${operation.fiscal_identity.pointOfSale}, número ${operation.request_snapshot?._numberAttempt ?? "propuesto"}${conflict ? `, está ocupada por el comprobante interno #${conflict.id}` : ", necesita volver a verificarse"}. Al completar la operación se consultará ARCA y se recuperará el borrador anterior si hay evidencia suficiente, conservando los importes y pagos originales.` : archived ? "El borrador anterior fue archivado después de verificar que ARCA no lo autorizó. Revisá sus datos antes de preparar un nuevo intento." : null,
    invoice: issued ? { id: invoice.id, tipoComprobante: invoice.tipo_comprobante, puntoVenta: invoice.punto_venta, numero: invoice.numero, montoTotal: invoice.monto_total, cae: invoice.cae, paymentId: invoice.payment_id } : null,
    attempt: recovery?.version === 2 ? { invoiceRequest: operation.request_snapshot,
      invoice: issued && ccDone && creditsDone ? { id: invoice.id, tipoComprobante: invoice.tipo_comprobante, puntoVenta: invoice.punto_venta, numero: invoice.numero, montoTotal: invoice.monto_total, cae: invoice.cae, paymentId: invoice.payment_id } : null,
      payments: expected, checkoutRequested: recovery.checkoutRequested === true, checkoutDebtAccount: recovery.checkoutDebtAccount, acknowledgedPaymentIds: acknowledged } : null,
  };
}

export function registerReceptionOperationRoutes(app: Express) {
  app.post("/api/billing/reservations/:reservationId/operations/:operationId/cancel-collection", requireAuth, requirePermission("sidebar:/reservations"), async (req,res) => {
    if (!CANCELLED_COLLECTION_ROLES.includes(String(req.user?.role))) return res.status(403).json({error:"La anulación del cobro requiere un supervisor de recepción."});
    const reason = String(req.body?.reason || "").trim(), fingerprint = req.body?.fingerprint;
    if (req.body?.acknowledge !== true || typeof fingerprint !== 'string' || reason.length < 5 || reason.length > 500)
      return res.status(400).json({error:"Confirmá el importe y el motivo de la anulación del cobro."});
    try {
      const result = await withReservationFinancialLock(req.params.reservationId, () => db.transaction(async tx => {
        const operation = (await tx.execute(sql`SELECT * FROM billing_operations WHERE operation_id=${req.params.operationId} AND owner_type='reservation' AND owner_id=${req.params.reservationId} FOR UPDATE`)).rows[0] as BillingOperation;
        if (!operation) throw fail("No se encontró el intento original. Actualizá la prefactura.");
        if (operation.stage === 'corrected') {
          const prior = (await tx.execute(sql`SELECT details FROM audit_logs WHERE entity_type='billing_operation' AND entity_id=${operation.operation_id} AND description='Cobro anulado para refacturar una factura cancelada' ORDER BY timestamp DESC LIMIT 1`)).rows[0] as any;
          let details = prior?.details; if (typeof details === 'string') details = JSON.parse(details);
          if (operation.error_code !== 'BILLING_CANCELLED_COLLECTION_REVERSED' || details?.fingerprint !== fingerprint || details?.reason !== reason) throw fail("El intento ya fue corregido con otros datos. Actualizá la pantalla.");
          return details.result;
        }
        const invoice = (await tx.execute(sql`SELECT * FROM sales_invoices WHERE id=${operation.invoice_id} AND reserva_id=${operation.owner_id} FOR UPDATE`)).rows[0] as any;
        const plan = await cancelledReceptionCollection(tx,operation,invoice);
        if (!plan || plan.fingerprint !== fingerprint) throw fail("Cambió la factura, su NC o el cobro. Actualizá antes de confirmar.");
        const registry = (await tx.execute(sql`SELECT to_regclass('payment_funding.scopes') AS name`)).rows[0] as any;
        if (registry?.name && (await tx.execute(sql`SELECT 1 FROM payment_funding.scopes WHERE kind='reservation' AND id=${operation.owner_id}`)).rows.length) throw fail("Esta reserva usa financiación completa. Corregí el cobro desde ese circuito.");
        const operator = req.user?.id || req.user?.username || 'sistema';
        for (const payment of plan.payments) await voidReservationPaymentWithLedger(tx,payment.id,operator,reason);
        const result = {corrected:true,closedCancelled:true,collectionReversed:true,voidedPaymentIds:plan.payments.map(p=>p.id),amount:plan.total};
        await tx.execute(sql`UPDATE billing_operations SET stage='corrected',error_code='BILLING_CANCELLED_COLLECTION_REVERSED',updated_at=now() WHERE operation_id=${operation.operation_id}`);
        await tx.execute(sql`INSERT INTO audit_logs(user_id,action,module,entity_type,entity_id,description,details,timestamp)
          VALUES(${req.user?.id || null},'update','billing','billing_operation',${operation.operation_id},'Cobro anulado para refacturar una factura cancelada',${JSON.stringify({fingerprint,reason,invoiceId:invoice.id,priorStage:operation.stage,payments:plan.payments,result})},now())`);
        await tx.execute(sql`INSERT INTO reservation_changelog(reservation_id,operador,tipo,descripcion) VALUES(${operation.owner_id},${operator},'pago',${`Cobro de ${plan.invoiceLabel} anulado para refacturar · $${plan.total.toFixed(2)} · ${reason}. Operación: ${operation.operation_id}`})`);
        return result;
      }));
      res.json(result);
    } catch(error:any) { res.status(error?.statusCode || 409).json({error:error?.message || 'No se pudo anular el cobro. Actualizá la pantalla.'}); }
  });

  app.get('/api/reservations/:reservationId/collection-receipts',requireAuth,requirePermission('sidebar:/reservations'),async(req,res)=>{
    res.setHeader('Cache-Control','private, no-store');
    try{const receipts=await reservationCollectionReceipts(req.params.reservationId);res.json(receipts.map(r=>({operationId:r.operationId,total:r.total,date:r.date,paymentIds:r.payments.map(p=>p.id)})));}
    catch{res.status(503).json({error:'No se pudieron consultar los recibos de cobro.'});}
  });
  app.get('/api/reservations/:reservationId/collection-receipts/:operationId/pdf',requireAuth,requirePermission('sidebar:/reservations'),async(req,res)=>{
    res.setHeader('Cache-Control','private, no-store');
    try{
      const [receipt]=await reservationCollectionReceipts(req.params.reservationId,req.params.operationId);
      if(!receipt)return res.status(409).json({error:'El cobro completo no está registrado o alguno de sus pagos cambió. Revisá la operación antes de imprimir.'});
      const config=await getBillingConfig();const pdf=await generateReservationCollectionReceiptPdf(receipt,config.razonSocial || 'Maran Suites & Towers');
      res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`inline; filename="Recibo_cobro_${receipt.operationId.replace(/[^a-zA-Z0-9-]/g,'')}.pdf"`);res.send(pdf);
    }catch{res.status(503).json({error:'No se pudo generar el recibo. No se modificó el cobro.'});}
  });
  app.post('/api/billing/reservations/:reservationId/prepare-excess-collection', requireAuth, requirePermission('sidebar:/reservations'), async (req,res) => {
    if (req.body?.acknowledge !== true) return res.status(400).json({error:'Confirmá el aviso del cobro excedente.'});
    try { return res.json(await prepareExcessReservationCollection(req.params.reservationId, req.body.attempt, req.user?.id)); }
    catch (error:any) { return res.status(error.statusCode || 500).json({error:error.message || 'No se pudo preparar el cobro. Conservamos el intento.'}); }
  });
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
        if (operation.stage === "corrected") return { corrected: true, closedCancelled: operation.error_code === "BILLING_CANCELLED_OPERATION_CLOSED", request: operation.request_snapshot };
        const identity = operation.fiscal_identity;
        return withSeriesLock(`funding-fiscal:${identity.environment}:${identity.issuer}:${identity.type}:${identity.pointOfSale}`, async () => {
          const status = await receptionOperationStatus(operation);
          if (status.canCloseCancelled) {
            return db.transaction(async tx => {
              const current = (await tx.execute(sql`SELECT * FROM billing_operations WHERE operation_id=${operation.operation_id} FOR UPDATE`)).rows[0] as BillingOperation;
              if (current?.stage === "corrected" && current.error_code === "BILLING_CANCELLED_OPERATION_CLOSED") return { corrected: true, closedCancelled: true };
              if (!current || current.owner_id !== operation.owner_id || current.owner_type !== "reservation") throw fail("La operación cambió. Actualizá la pantalla.");
              const cancelled = (await tx.execute(current.invoice_id
                ? sql`SELECT * FROM sales_invoices WHERE id=${current.invoice_id} AND reserva_id=${current.owner_id} FOR UPDATE`
                : sql`SELECT * FROM sales_invoices WHERE reserva_id=${current.owner_id} AND credit_reapplication_intent->>'operationId'=${current.operation_id} ORDER BY id DESC LIMIT 1 FOR UPDATE`)).rows[0] as any;
              if (!await canCloseCancelledReceptionOperation(tx, current, cancelled, true)) throw fail("La anulación cambió o requiere conciliación. Conservamos el intento.");
              await tx.execute(sql`UPDATE billing_operations SET stage='corrected',error_code='BILLING_CANCELLED_OPERATION_CLOSED',updated_at=now() WHERE operation_id=${current.operation_id}`);
              await tx.execute(sql`INSERT INTO audit_logs(user_id,action,module,entity_type,entity_id,description,details,timestamp)
                VALUES(${req.user?.id || null},'update','billing','billing_operation',${current.operation_id},'Intento anterior cerrado por factura totalmente anulada; sin emisión ni cobro',${JSON.stringify({ operationId: current.operation_id, invoiceId: cancelled.id, requestHash: current.payload_hash, priorStage: current.stage })},now())`);
              return { corrected: true, closedCancelled: true };
            });
          }
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
