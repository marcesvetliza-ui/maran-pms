import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as any[],
}));

vi.mock("../db", () => ({
  db: {
    execute: vi.fn(async () => ({ rows: state.rows })),
  },
}));

const { assertGroupPaymentInvoiceEligibility, assertGroupPaymentInvoiceScope, assertMasterFacturaTAllowed } = await import("../billing/groupInvoiceScope");

describe("legacy group-payment invoice eligibility", () => {
  beforeEach(() => {
    state.rows = [];
  });

  it("rejects a fiscal claim linked only through the legacy group_payments.invoice_id", async () => {
    // The query resolves this row as active when the historical invoice is
    // reachable by gp.invoice_id even though it has no group_payment_id.
    state.rows = [{
      amount: "100.00",
      invoice_id: 91,
      has_active_claim: true,
    }];

    await expect(assertGroupPaymentInvoiceEligibility("group-1", "payment-1", 100))
      .rejects.toMatchObject({ status: 409 });
  });

  it("rejects manual linking when the emitted invoice has no group scope", () => {
    expect(() => assertGroupPaymentInvoiceScope(
      { id: 91, groupId: null, groupPaymentId: null },
      { id: "payment-1" },
      "group-1",
    )).toThrowError(expect.objectContaining({ statusCode: 409 }));
  });

  it("rejects Factura T on a Folio Maestro payment when the master folio also covers extras (config=all)", () => {
    expect(() => assertMasterFacturaTAllowed("factura_t", "all"))
      .toThrowError(expect.objectContaining({ statusCode: 400 }));
  });

  it("allows Factura T on a Folio Maestro payment when the master folio is accommodation-only", () => {
    expect(() => assertMasterFacturaTAllowed("factura_t", "accommodation")).not.toThrow();
  });

  it("does not restrict non-Factura T receipt types regardless of master folio config", () => {
    expect(() => assertMasterFacturaTAllowed("factura_b", "all")).not.toThrow();
    expect(() => assertMasterFacturaTAllowed(undefined, "all")).not.toThrow();
  });
});