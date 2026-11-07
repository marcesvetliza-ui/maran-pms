import { sql } from 'drizzle-orm';
import { creditTypeForInvoice } from '../../shared/fiscal-document-types';
import { payloadHash } from './operationJournal';

// The journal proves what was requested; absence of a payment on an invoice
// alone never proves that its settlement is complete.
export const directInvoiceOperationProof = sql`(SELECT jsonb_build_object(
  'invoiceId',bo.invoice_id,'ownerType',bo.owner_type,'ownerId',bo.owner_id,'stage',bo.stage,
  'identity',bo.fiscal_identity,'request',bo.request_snapshot)
  FROM billing_operations bo WHERE bo.operation_id=si.fiscal_identity->>'operationId'
  AND bo.invoice_id=si.id LIMIT 1)`;

export function isCompletedBareDirectInvoice(invoice: any, proof: any): boolean {
  if (!proof || proof.ownerType !== 'direct' || proof.ownerId !== 'direct' || proof.stage !== 'authorized' ||
    Number(proof.invoiceId) !== Number(invoice.id) || invoice.estado !== 'emitida' || invoice.modo_ficticio !== false ||
    !/^\d{14}$/.test(String(invoice.cae || '')) || !creditTypeForInvoice(invoice.tipo_comprobante) || invoice.reconciliation_error ||
    ['reserva_id','payment_id','group_id','group_payment_id','group_payment_intent','spa_account_id','restaurant_order_id','folio_id','nota_credito_id',
      'center_settlement_status','center_settlement_area','cash_forma_pago','cash_forma_pago_detalle','credit_reapplication_intent','source_charge_ids','source_charge_amounts']
      .some(key => invoice[key] != null)) return false;
  const identity = invoice.fiscal_identity;
  if (!identity || !['homologacion','produccion'].includes(identity.environment) || identity.type !== invoice.tipo_comprobante ||
    identity.pointOfSale !== Number(invoice.punto_venta) || !identity.operationId ||
    ['environment','issuer','type','pointOfSale'].some(key => identity[key] !== proof.identity?.[key])) return false;
  const request = proof.request;
  if (!request || request.tipoComprobante !== invoice.tipo_comprobante || !Array.isArray(request.items) ||
    !request.items.length || !Array.isArray(invoice.items) || payloadHash(request.items) !== payloadHash(invoice.items)) return false;
  if (request._numberAttempt != null && Number(request._numberAttempt) !== Number(invoice.numero)) return false;
  const bareKeys = new Set(['tipoComprobante','cliente','items','observaciones','puntoVenta','puntoVentaOverride','_numberAttempt']);
  // Do not silently treat a new/unknown operational intent as a bare invoice.
  return Object.entries(request).every(([key,value]) => bareKeys.has(key) || value == null);
}
