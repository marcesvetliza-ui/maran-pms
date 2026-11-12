import { operationSnapshot, payloadHash, type BillingOperation } from "./operationJournal";

const fail = (message: string) => Object.assign(new Error(message), { statusCode: 409 });

/** Recover this invoice's immutable request, never the current form or a row
 * that merely shares its number. The normal emitter resumes its own draft. */
function centerInvoiceRequestProof(invoice: any, operation: BillingOperation | undefined) {
  if (!invoice?.center_settlement_area || !["FA", "FB", "FM", "FMB"].includes(invoice.tipo_comprobante)
    || !["autorizacion_pendiente", "emitida"].includes(invoice.estado)
    || invoice.modo_ficticio !== false
    || ["reserva_id", "payment_id", "group_id", "group_payment_id", "spa_account_id", "restaurant_order_id", "folio_id", "group_payment_intent", "credit_reapplication_intent"].some(key => invoice[key] != null)) {
    throw fail("Este comprobante requiere revisión desde su cuenta de origen; no se recupera como venta directa.");
  }
  const identity = invoice.fiscal_identity;
  const request = operationSnapshot(operation?.request_snapshot || {});
  if (!operation || operation.invoice_id !== Number(invoice.id) || operation.owner_type !== "direct" || operation.owner_id !== "direct"
    || identity?.operationId !== operation.operation_id
    || !["homologacion", "produccion"].includes(identity?.environment)
    || ["environment", "issuer", "pointOfSale", "type"].some(key => identity[key] !== (operation.fiscal_identity as any)?.[key])
    || identity.type !== invoice.tipo_comprobante || identity.pointOfSale !== Number(invoice.punto_venta)
    || payloadHash(request) !== operation.payload_hash
    || request.recipientMode !== "centro_comprobantes" || request.cashArea !== invoice.center_settlement_area
    || request.tipoComprobante !== invoice.tipo_comprobante
    || !Array.isArray(request.items) || !request.items.length
    || Math.round(request.items.reduce((sum: number, item: any) => sum + Number(item.subtotal), 0) * 100) !== Math.round(Number(invoice.monto_total) * 100)
    || payloadHash(request.items) !== payloadHash(invoice.items)
    || payloadHash(request.cashFormaPagoDetalle) !== payloadHash(invoice.cash_forma_pago_detalle)
    || String(request.recipientEntity?.type || "") !== String(invoice.recipient_entity_type || "") || String(request.recipientEntity?.id || "") !== String(invoice.recipient_entity_id || "")
    || ["razonSocial", "cuit", "dni", "documentType", "condicionIva", "domicilio"].some((key, i) =>
      String(request.cliente?.[key] || "") !== String(invoice[["cliente_razon_social", "cliente_cuit", "cliente_dni", "cliente_document_type", "cliente_condicion_iva", "cliente_domicilio"][i]] || ""))) {
    throw fail("El intento no tiene evidencia suficiente o sus datos cambiaron. Se conserva para revisión; no se emite ni se cobra.");
  }
  return { ...request, operationId: operation.operation_id };
}

export function centerInvoiceRecoveryRequest(invoice: any, operation: BillingOperation | undefined) {
  const request = centerInvoiceRequestProof(invoice, operation);
  if (operation!.stage === "rejected") throw fail(`ARCA rechazó el intento original: ${invoice.reconciliation_error || "Revisá los datos fiscales antes de corregirlo."}`);
  if (!["prepared", "numbered", "submitting", "uncertain", "authorized"].includes(operation!.stage)) throw fail("El intento necesita una corrección verificada antes de continuar.");
  return request;
}

export function centerRejectedInvoiceRequest(invoice: any, operation: BillingOperation | undefined) {
  const request = centerInvoiceRequestProof(invoice, operation);
  if (operation!.stage !== "rejected" || operation!.error_code !== "ARCA_AUTHORIZATION_REJECTED"
    || invoice.estado !== "autorizacion_pendiente" || invoice.cae || invoice.center_settlement_status !== "pending") {
    throw fail("Sólo se puede cerrar un intento expresamente rechazado por ARCA, sin autorización ni registro económico.");
  }
  return request;
}
