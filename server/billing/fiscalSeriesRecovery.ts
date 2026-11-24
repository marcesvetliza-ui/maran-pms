import { sql } from "drizzle-orm";
import type { db } from "../db";
import { hasFinancialScopeLock } from "../nightlyPricingGuard";
import { operationOwner, operationSnapshot, payloadHash, type BillingOperation, type FiscalIdentity } from "./operationJournal";
import { resolveFiscalRecipientDocument } from "./fiscalDocument";
import type { FECAEResult } from "./wsfevClient";

type Database = Omit<typeof db, "$client">;
type Lookup = (invoice: any, expected: { total: number; fecha: string; docTipo: number; docNro: string }) => Promise<FECAEResult | null>;
export type SeriesRecovery = { outcome: "retired" | "authorized" | "review"; invoiceId: number; reason?: string };
const saleTypes = new Set(["FA", "FB", "FC", "FM", "FMB", "FT"]);

/** A number match is never ownership proof. Only a complete immutable journal
 * belonging to this exact invoice/environment/issuer can be recovered. */
function provenDraft(invoice: any, operation: BillingOperation | undefined, identity: FiscalIdentity) {
  const stored = invoice?.fiscal_identity;
  const request = operationSnapshot(operation?.request_snapshot || {});
  // Older versions committed the draft before recording invoice_id. An exact
  // prepared journal/number match proves this crash preceded any sending stage.
  const unlinkedPreparation = operation?.stage === "prepared" && operation.invoice_id === null &&
    Number(operation.request_snapshot?._numberAttempt) === Number(invoice?.numero);
  const owner = operationOwner({ reservaId: invoice?.reserva_id, groupId: invoice?.group_id,
    spaAccountId: invoice?.spa_account_id, paymentId: invoice?.payment_id, restaurantOrderId: invoice?.restaurant_order_id });
  return !!operation && saleTypes.has(invoice?.tipo_comprobante) && invoice.estado === "autorizacion_pendiente" &&
    invoice.modo_ficticio === false && !invoice.cae && (operation.invoice_id === Number(invoice.id) || unlinkedPreparation) &&
    stored?.operationId === operation.operation_id && operation.owner_type === owner.type && operation.owner_id === owner.id &&
    [['reservaId','reserva_id'],['groupId','group_id'],['spaAccountId','spa_account_id'],['restaurantOrderId','restaurant_order_id'],['paymentId','payment_id']]
      .every(([key,column]) => request[key] === undefined || String(request[key] ?? '') === String(invoice[column] ?? '')) &&
    (["numbered", "submitting", "uncertain", "rejected"].includes(operation.stage) || unlinkedPreparation) &&
    ["environment", "issuer", "type", "pointOfSale"].every(key => stored[key] === (identity as any)[key] && (operation.fiscal_identity as any)?.[key] === stored[key]) &&
    stored.type === invoice.tipo_comprobante && stored.pointOfSale === Number(invoice.punto_venta) &&
    (!invoice.center_settlement_area || request.recipientMode === "centro_comprobantes" && request.cashArea === invoice.center_settlement_area &&
      String(request.recipientEntity?.type || "") === String(invoice.recipient_entity_type || "") &&
      String(request.recipientEntity?.id || "") === String(invoice.recipient_entity_id || "")) &&
    request.tipoComprobante === invoice.tipo_comprobante &&
    Number(request.puntoVentaOverride ?? request.puntoVenta ?? stored.pointOfSale) === stored.pointOfSale &&
    payloadHash(request) === operation.payload_hash && Array.isArray(request.items) && request.items.length > 0 &&
    request.items.every((item: any) => Number.isFinite(Number(item.subtotal))) &&
    Number.isFinite(Number(invoice.monto_total)) &&
    request.items.reduce((sum: number, item: any) => sum + Math.round(Number(item.subtotal) * 100), 0) === Math.round(Number(invoice.monto_total) * 100) &&
    payloadHash(request.items) === payloadHash(invoice.items) &&
    String(request.cashFormaPago || "") === String(invoice.cash_forma_pago || "") &&
    payloadHash(request.cashFormaPagoDetalle ?? null) === payloadHash(invoice.cash_forma_pago_detalle ?? null) &&
    payloadHash(request.sourceChargeIds ?? null) === payloadHash(invoice.source_charge_ids ?? null) &&
    payloadHash(request.sourceChargeAmounts ?? null) === payloadHash(invoice.source_charge_amounts ?? null) &&
    ["razonSocial", "cuit", "dni", "documentType", "condicionIva", "domicilio"].every((key, i) =>
      String(request.cliente?.[key] || "") === String(invoice[["cliente_razon_social", "cliente_cuit", "cliente_dni", "cliente_document_type", "cliente_condicion_iva", "cliente_domicilio"][i]] || ""));
}

async function hasLinks(tx: Pick<Database, "execute">, invoice: any) {
  if (Number(invoice.monto_acreditado || 0) !== 0 || invoice.payment_id || invoice.group_payment_id || invoice.folio_id ||
    invoice.group_payment_intent || invoice.center_settlement_status && invoice.center_settlement_status !== "pending" ||
    invoice.credit_reapplication_intent?.status === "completed" || invoice.credit_reapplication_intent?.settlement?.status === "completed") return true;
  const id = Number(invoice.id), textId = String(id);
  const label = `${invoice.tipo_comprobante}-${String(invoice.punto_venta).padStart(4, "0")}-${String(invoice.numero).padStart(8, "0")}`;
  const legacy = `${invoice.tipo_comprobante}-${String(invoice.numero).padStart(8, "0")}`;
  const linked = await tx.execute(sql`
    SELECT 1 FROM cash_movements WHERE source_type IN ('comprobante','invoice','credit_note') AND source_id=${textId}
    UNION ALL SELECT 1 FROM folio_movements WHERE source_type IN ('invoice','comprobante','credit_note') AND source_id=${textId}
    UNION ALL SELECT 1 FROM sales_invoices WHERE nota_credito_id=${id}
    UNION ALL SELECT 1 FROM group_payments WHERE invoice_id=${id}
    UNION ALL SELECT 1 FROM group_invoices WHERE sales_invoice_id=${id}
    UNION ALL SELECT 1 FROM spa_treatment_sales WHERE sales_invoice_id=${id}
    UNION ALL SELECT 1 FROM spa_accounts WHERE invoice_id=${id} OR nc_id=${id}
    UNION ALL SELECT 1 FROM events WHERE invoice_id=${id} OR nc_id=${id}
    UNION ALL SELECT 1 FROM event_tables WHERE invoice_id=${id} OR nc_id=${id}
    UNION ALL SELECT 1 FROM restaurant_reservation_advances WHERE invoice_id=${id}
    UNION ALL SELECT 1 FROM gift_vouchers WHERE sale_invoice_id=${id}
    UNION ALL SELECT 1 FROM cc_invoice_tracking WHERE sales_invoice_id=${id}
    UNION ALL SELECT 1 FROM account_movements WHERE reference IN (${label},${legacy},${label.replace("-", " ")},${`invoice:${id}:${invoice.tipo_comprobante}:${invoice.punto_venta}:${invoice.numero}`}) LIMIT 1`);
  if (linked.rows.length) return true;
  const payments = await tx.execute(sql`SELECT invoice_ref FROM payments WHERE invoice_ref LIKE ${`%${id}%`}`);
  return payments.rows.some((row: any) => {
    try { return Number(JSON.parse(row.invoice_ref)?.id) === id; } catch { return true; }
  });
}

/** Caller already owns the fiscal series lock and connection. This function
 * only CONSULTS ARCA: never requests a CAE, collects money or moves a counter. */
export async function recoverOccupiedFiscalNumber(database: Database, invoiceId: number, identity: FiscalIdentity,
  lookup: Lookup, triggerOperationId?: string): Promise<SeriesRecovery> {
  const review = (reason: string): SeriesRecovery => ({ outcome: "review", invoiceId, reason });
  return database.transaction(async (tx): Promise<SeriesRecovery> => {
    // A different reservation may currently be collecting or editing its folio.
    // Try, never queue: the caller can already own another financial scope.
    const initial = (await tx.execute(sql`SELECT * FROM sales_invoices WHERE id=${invoiceId}`)).rows[0] as any;
    if (!initial) return { outcome: "retired", invoiceId };
    const keys: string[] = [];
    if (initial.reserva_id) {
      const groups = await tx.execute(sql`SELECT group_id FROM group_reservation_links WHERE reservation_id=${initial.reserva_id}`);
      for (const group of groups.rows as any[]) keys.push(`group-invoice:${group.group_id}`);
      keys.push(`folio-invoice:${initial.reserva_id}`);
    }
    if (initial.group_id) keys.push(`group-invoice:${initial.group_id}`);
    if (initial.spa_account_id) keys.push(`spa-invoice:${initial.spa_account_id}`);
    if (initial.restaurant_order_id) keys.push(`restaurant-invoice:${initial.restaurant_order_id}`);
    for (const key of [...new Set(keys)].sort()) {
      if (hasFinancialScopeLock(key)) continue;
      const lock = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(hashtext(${key})) AS locked`);
      if ((lock.rows[0] as any)?.locked !== true) return review("La cuenta de origen está procesando otra operación.");
    }
    // These owners also use row locks for payments/edits. Never wait while
    // holding the fiscal series: a busy source is retried on the next request.
    if (initial.restaurant_order_id && !(await tx.execute(sql`SELECT id FROM restaurant_orders WHERE id=${initial.restaurant_order_id} FOR UPDATE NOWAIT`)).rows.length)
      return review("No se encontró el pedido de restaurante original.");
    if (initial.spa_account_id && !(await tx.execute(sql`SELECT id FROM spa_accounts WHERE id=${initial.spa_account_id} FOR UPDATE NOWAIT`)).rows.length)
      return review("No se encontró la cuenta SPA original.");
    if (initial.group_id && !(await tx.execute(sql`SELECT id FROM groups WHERE id=${initial.group_id} FOR UPDATE NOWAIT`)).rows.length)
      return review("No se encontró el grupo original.");
    const invoice = (await tx.execute(sql`SELECT * FROM sales_invoices WHERE id=${invoiceId} FOR UPDATE NOWAIT`)).rows[0] as any;
    if (!invoice) return { outcome: "retired", invoiceId };
    if (['reserva_id','group_id','spa_account_id','restaurant_order_id'].some(key => invoice[key] !== initial[key]))
      return review("La cuenta de origen cambió durante la verificación.");
    const operation = (await tx.execute(sql`SELECT * FROM billing_operations WHERE operation_id=${invoice.fiscal_identity?.operationId || ""} FOR UPDATE NOWAIT`)).rows[0] as BillingOperation | undefined;
    if (!provenDraft(invoice, operation, identity)) return review("No hay evidencia completa del intento original.");
    const document = resolveFiscalRecipientDocument({ cuit: invoice.cliente_cuit, dni: invoice.cliente_dni, documentType: invoice.cliente_document_type });
    let authorized: FECAEResult | null;
    try {
      authorized = await lookup(invoice, { total: Number(invoice.monto_total), fecha: String(invoice.fecha_emision).replaceAll("-", ""), docTipo: document.tipo, docNro: document.numero });
    } catch { return review("ARCA todavía no permite verificar el resultado del intento original."); }
    if (authorized) {
      await tx.execute(sql`UPDATE sales_invoices SET cae=${authorized.cae},cae_fecha_vto=${authorized.caeFechaVto.toISOString().slice(0, 10)},
        estado='emitida',reconciliation_status='pendiente',reconciliation_error=NULL,reconciliation_updated_at=now() WHERE id=${invoiceId}`);
      await tx.execute(sql`UPDATE billing_operations SET stage='authorized',error_code=NULL,updated_at=now() WHERE operation_id=${operation!.operation_id}`);
      await audit(tx, operation!, invoice, triggerOperationId, "authorized");
      return { outcome: "authorized", invoiceId };
    }
    const rejected = operation!.stage === "rejected" && operation!.error_code === "ARCA_AUTHORIZATION_REJECTED";
    // Historical negative-total drafts could be marked uncertain by older
    // parsers. ARCA cannot authorize a negative total (10065); only an exact
    // immutable match AND an explicit missing-voucher lookup permit retirement.
    const impossibleNegativeTotal = Number(invoice.monto_total) < 0;
    // "numbered" is committed before "submitting", which is itself committed
    // before any authorization call. All other crash states remain uncertain.
    if (!rejected && !impossibleNegativeTotal && !["numbered", "prepared"].includes(operation!.stage)) return review("El resultado sigue incierto. Recuperá la autorización del comprobante original.");
    if (await hasLinks(tx, invoice)) return review("El intento original tiene vínculos económicos que requieren conciliación.");
    const marker = (rejected || impossibleNegativeTotal) && invoice.center_settlement_area ? "ARCA_REJECTED_CENTER_CORRECTED"
      : rejected || impossibleNegativeTotal ? "BILLING_REJECTED_DRAFT_RETIRED" : "BILLING_UNSENT_DRAFT_RETIRED";
    await tx.execute(sql`UPDATE billing_operations SET request_snapshot=jsonb_set(request_snapshot,'{discardedDraft}',${JSON.stringify(invoice)}::jsonb),
      invoice_id=NULL,stage='corrected',error_code=${marker},updated_at=now() WHERE operation_id=${operation!.operation_id}`);
    await audit(tx, operation!, invoice, triggerOperationId, "retired");
    await tx.execute(sql`DELETE FROM sales_invoices WHERE id=${invoiceId} AND estado='autorizacion_pendiente' AND cae IS NULL`);
    return { outcome: "retired", invoiceId };
  }).catch(error => {
    // Drizzle wraps PostgreSQL errors; the transaction has rolled back here.
    if (error?.code === '55P03' || error?.cause?.code === '55P03') return review("La cuenta de origen está procesando otra operación.");
    throw error;
  });
}

async function audit(tx: Pick<Database, "execute">, operation: BillingOperation, invoice: any, triggerOperationId: string | undefined, outcome: string) {
  await tx.execute(sql`INSERT INTO audit_logs(user_name,action,module,entity_type,entity_id,description,details,timestamp)
    VALUES('Sistema','update','billing','billing_operation',${operation.operation_id},
    ${outcome === "retired" ? "Borrador no autorizado verificado y archivado al recuperar numeración; sin emisión ni cobro" : "CAE original recuperado al verificar numeración; sin nueva emisión ni cobro"},
    ${JSON.stringify({ invoiceId: invoice.id, original: invoice, operationId: operation.operation_id, triggerOperationId,
      requestHash: operation.payload_hash, priorStage: operation.stage, arcaNotAuthorized: outcome === "retired", outcome })},now())`);
}
