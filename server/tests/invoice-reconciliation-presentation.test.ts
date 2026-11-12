import { describe, expect, it } from "vitest";
import { exposeInvoiceReconciliation } from "../billing/reconciliationPresentation";

describe("estado visible de conciliación de facturas", () => {
  it('offers correction only for a journal-proven rejected center draft',()=>{
    const draft={id:245,center_settlement_area:'recepcion',estado:'autorizacion_pendiente',modo_ficticio:false,cae:null,
      _direct_invoice_operation:{invoiceId:245,ownerType:'direct',ownerId:'direct',stage:'rejected',errorCode:'ARCA_AUTHORIZATION_REJECTED'}};
    expect(exposeInvoiceReconciliation(draft).center_rejection_correctable).toBe(true);
    for(const change of [{cae:'71234567890123'},{modo_ficticio:true},{estado:'emitida'},{_direct_invoice_operation:{...draft._direct_invoice_operation,stage:'uncertain'}}]){
      expect(exposeInvoiceReconciliation({...draft,...change}).center_rejection_correctable).toBe(false);
    }
  });
  it("recognizes the center's committed CC registration, retaining unresolved fiscal and settlement states", () => {
    const completed = { tipo_comprobante:"FB", estado:"emitida", cae:"71234567890123", center_settlement_area:"recepcion", center_settlement_status:"settled", reconciliation_status:"pendiente", reconciliation_error:"Error histórico" };
    expect(exposeInvoiceReconciliation(completed)).toMatchObject({ reconciliation_status:"conciliada", reconciliation_error:null });
    for (const change of [{estado:"autorizacion_pendiente"},{estado:"parcial"},{nota_credito_id:123},{center_settlement_status:"pending"},{cae:null},{tipo_comprobante:"NCB"},{group_id:"group-review"}]) {
      expect(exposeInvoiceReconciliation({...completed,...change}).reconciliation_status).toBe("pendiente");
    }
  });
  it("mantiene pendiente una conciliación actual que todavía no tiene vínculo", () => {
    expect(exposeInvoiceReconciliation({
      reconciliation_status: "pendiente",
      reconciliation_error: "Falta completar el cobro",
      group_payment_intent: { endpoint: "/api/groups/g-1/payment" },
      group_reconciliation_linked: false,
    })).toMatchObject({
      reconciliation_status: "pendiente",
      reconciliation_error: "Falta completar el cobro",
    });
  });

  it("considera conciliada una factura grupal histórica cuyo vínculo ya existe", () => {
    expect(exposeInvoiceReconciliation({
      reconciliation_status: "pendiente",
      reconciliation_error: "Error histórico",
      group_payment_intent: { endpoint: "/api/groups/g-1/payment" },
      group_reconciliation_linked: true,
    })).toMatchObject({
      reconciliation_status: "conciliada",
      reconciliationStatus: "conciliada",
      reconciliation_error: null,
      reconciliationError: null,
    });
  });

  it("no oculta una conciliación fiscal real sólo porque la factura tiene otro vínculo", () => {
    expect(exposeInvoiceReconciliation({
      tipo_comprobante: "NCB",
      reconciliation_status: "pendiente",
      reconciliation_error: "Falta aplicar la NC al folio",
      group_reconciliation_linked: true,
      group_payment_intent: null,
    })).toMatchObject({
      reconciliation_status: "pendiente",
      reconciliation_error: "Falta aplicar la NC al folio",
    });
  });

  it("conserva los estados ya conciliados", () => {
    expect(exposeInvoiceReconciliation({
      reconciliationStatus: "conciliada",
      reconciliationError: null,
    })).toMatchObject({
      reconciliation_status: "conciliada",
      reconciliation_error: null,
    });
  });
});
describe("factura directa vinculada al resumen del grupo", () => {
  const direct = {tipo_comprobante:"FA",estado:"emitida",group_id:"g-1",reconciliation_status:"pendiente",group_payment_intent:null,direct_group_reconciliation_linked:true};
  it("resuelve el pendiente histórico sólo con evidencia del vínculo directo", () => {
    expect(exposeInvoiceReconciliation(direct).reconciliation_status).toBe("conciliada");
    expect(exposeInvoiceReconciliation({...direct,direct_group_reconciliation_linked:false}).reconciliation_status).toBe("pendiente");
  });
  it.each(["NCA","NDA"])("no convierte %s en conciliada por estar vinculada", tipo_comprobante => {
    expect(exposeInvoiceReconciliation({...direct,tipo_comprobante}).reconciliation_status).toBe("pendiente");
  });
  it("no oculta autorización ni cobro pendientes ni acepta un flag textual", () => {
    for (const changes of [{estado:"autorizacion_pendiente"},{group_id:null},{group_payment_intent:{endpoint:"/payment"}},{group_payment_id:"p-1"},{direct_group_reconciliation_linked:"true"}]) {
      expect(exposeInvoiceReconciliation({...direct,...changes}).reconciliation_status).toBe("pendiente");
    }
  });
});
