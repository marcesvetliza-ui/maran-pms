import { describe, expect, it } from 'vitest';
import { exposeInvoiceReconciliation } from '../billing/reconciliationPresentation';
const items=[{descripcion:'Prueba',cantidad:1,precioUnitario:41500}];
const identity={environment:'homologacion',issuer:'30717698130',type:'FB',pointOfSale:5,operationId:'op'};
function fixture() { return { id:1410,tipo_comprobante:'FB',punto_venta:5,numero:187,estado:'emitida',modo_ficticio:false,cae:'86451063656236',items,fiscal_identity:identity,reconciliation_status:'pendiente',
  _direct_invoice_operation:{invoiceId:1410,ownerType:'direct',ownerId:'direct',stage:'authorized',identity,request:{_numberAttempt:187,tipoComprobante:'FB',cliente:{razonSocial:'Prueba'},items}} }; }
describe('Presentación de factura directa sin liquidación solicitada',()=>{
 it('requiere el journal autorizado y retira su snapshot de la respuesta pública sin modificar el registro',()=>{
  const original=fixture();const result=exposeInvoiceReconciliation(original);
  expect(result.reconciliation_status).toBe('conciliada');expect(original.reconciliation_status).toBe('pendiente');
  expect(result).not.toHaveProperty('_direct_invoice_operation');
 });
 it.each(['reserva_id','payment_id','group_id','spa_account_id','restaurant_order_id','folio_id','cash_forma_pago','source_charge_ids','credit_reapplication_intent','center_settlement_status'])('conserva pendientes con vínculo %s',key=>{
  expect(exposeInvoiceReconciliation({...fixture(),[key]:'pendiente'}).reconciliation_status).toBe('pendiente');
 });
 it.each(['cashArea','cashFormaPago','recipientMode','creditReapplications','ordinaryAdvanceApplications','reservationSettlementMethod','prefacturaRecovery','unknownIntent'])('no oculta intención operativa %s',key=>{
  const row=fixture();(row._direct_invoice_operation.request as any)[key]='solicitado';expect(exposeInvoiceReconciliation(row).reconciliation_status).toBe('pendiente');
 });
 it.each(['uncertain','submitting','numbered','rejected'])('no normaliza journal %s',stage=>{
  const row=fixture();row._direct_invoice_operation.stage=stage;expect(exposeInvoiceReconciliation(row).reconciliation_status).toBe('pendiente');
 });
 it('CAE solo, identidad cambiada, items distintos o error no prueban conciliación',()=>{
  const missing=fixture();delete (missing as any)._direct_invoice_operation;
  const changed=fixture();changed.fiscal_identity={...identity,environment:'produccion'};
  const different=fixture();different.items=[{...items[0],precioUnitario:1}];
  for(const row of [missing,changed,different,{...fixture(),reconciliation_error:'error'},{...fixture(),estado:'autorizacion_pendiente'}])expect(exposeInvoiceReconciliation(row).reconciliation_status).toBe('pendiente');
 });
});
