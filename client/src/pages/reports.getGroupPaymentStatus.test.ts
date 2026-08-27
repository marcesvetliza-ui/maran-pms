import { describe, expect, it } from "vitest";
import { getGroupPaymentStatus, GROUP_PAYMENT_STATUS_LABELS } from "./reports";

/**
 * Regression guard for Reportes › Grupos "Pagos de Grupos" (task #417).
 * getGroupPaymentStatus is the single source of truth shared by the
 * groupPaymentsStatusFilter dropdown and the CSV export's "Comprobante"
 * column — see the comment above its definition in reports.tsx. If this
 * priority logic ever changes silently, both the on-screen filter and the
 * exported file would show the wrong status with no test to catch it.
 */
describe("getGroupPaymentStatus", () => {
  it("is pendiente when neither invoiceRef nor invoiceNcRef is set", () => {
    expect(getGroupPaymentStatus({})).toBe("pendiente");
    expect(getGroupPaymentStatus({ invoiceRef: null, invoiceNcRef: null })).toBe("pendiente");
    expect(getGroupPaymentStatus({ invoiceRef: "", invoiceNcRef: "" })).toBe("pendiente");
  });

  it("is facturado once invoiceRef is set and no credit note has been issued", () => {
    expect(getGroupPaymentStatus({ invoiceRef: JSON.stringify({ cae: "123" }), invoiceNcRef: null })).toBe("facturado");
  });

  it("is anulado once invoiceNcRef is set, regardless of invoiceRef", () => {
    expect(getGroupPaymentStatus({ invoiceRef: JSON.stringify({ cae: "123" }), invoiceNcRef: JSON.stringify({ cae: "nc-1" }) })).toBe("anulado");
  });

  it("prioritizes anulado over facturado even if invoiceRef looks freshly re-emitted", () => {
    // A payment can be re-invoiced after its NC, but until invoiceNcRef is
    // explicitly cleared by that re-emission flow, anulado must still win —
    // otherwise a reversed invoice would silently read as billed again.
    const gp = { invoiceRef: JSON.stringify({ cae: "re-emitted" }), invoiceNcRef: JSON.stringify({ cae: "nc-1" }) };
    expect(getGroupPaymentStatus(gp)).toBe("anulado");
  });

  it("treats a credit note with no invoiceRef as anulado, not pendiente", () => {
    // Should not normally happen (an NC implies a prior invoice), but the
    // derivation must stay defensive: any invoiceNcRef means anulado.
    expect(getGroupPaymentStatus({ invoiceRef: null, invoiceNcRef: JSON.stringify({ cae: "nc-1" }) })).toBe("anulado");
  });

  it("exposes exactly the three statuses the filter dropdown and CSV export rely on", () => {
    expect(Object.keys(GROUP_PAYMENT_STATUS_LABELS).sort()).toEqual(["anulado", "facturado", "pendiente"]);
    expect(GROUP_PAYMENT_STATUS_LABELS[getGroupPaymentStatus({})]).toBe("Pendiente");
    expect(GROUP_PAYMENT_STATUS_LABELS[getGroupPaymentStatus({ invoiceRef: "x" })]).toBe("Facturado");
    expect(GROUP_PAYMENT_STATUS_LABELS[getGroupPaymentStatus({ invoiceNcRef: "x" })]).toBe("Anulado");
  });
});
