import { describe, expect, it } from "vitest";
import { exposeInvoiceReconciliation } from "../billing/reconciliationPresentation";

describe("estado visible de conciliación de facturas", () => {
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