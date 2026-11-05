import { describe, it, expect, vi } from "vitest";
vi.mock("../db", () => ({ db: { execute: vi.fn() }, pool: {} }));
import { db } from "../db";
import { acknowledgedPayments, receptionOperationStatus } from "../billing/receptionOperations";
const payment = { paymentRequestId: "request-1", reservationId: "r1", amount: "100.00", method: "efectivo", date: "2026-11-03", reference: null, notes: null };
const saved = { payment_request_id: "request-1", reservation_id: "r1", amount: "100", method: "efectivo", date: "2026-11-03", reference: null, notes: null, status: "active", invoice_ref: JSON.stringify({ id: 77 }) };
describe("Pagos recuperados con evidencia exacta", () => {
  it("reconoce el pago guardado y permite omitir el reenvío desde otra sesión", () => {
    expect(acknowledgedPayments([payment], [saved], "r1", 77)).toEqual(["request-1"]);
  });
  it.each([{ invoice_ref: JSON.stringify({ id: 78 }) }, { payment_request_id: "other" }, { reservation_id: "r2" }, { amount: "99" }, { method: "transferencia" }, { date: "2026-11-04" }, { notes: "retención" }, { status: "anulado" }, { invoice_ref: "inválido" }])("no infiere un pago por coincidencia de importe: %s", change => {
    expect(acknowledgedPayments([payment], [{ ...saved, ...change }], "r1", 77)).toEqual([]);
  });
});

describe("Discovery of issued invoices after a partial credit note", () => {
  const operation: any = { operation_id: "op", owner_id: "r1", invoice_id: 125, stage: "authorized", request_snapshot: {
    cashFormaPago: "cuenta_corriente", prefacturaRecovery: { version: 2, payments: [], checkoutRequested: true }
  } };
  it("does not resurrect a completed CC settlement as pending after a partial NC", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [{ id: 125, estado: "parcial", credit_reapplication_intent: { status: "completed", settlement: { status: "completed" } } }] } as any);
    expect(await receptionOperationStatus(operation)).toMatchObject({ stage: "authorized", financiallyComplete: true, invoice: { id: 125 }, attempt: { invoice: { id: 125 } } });
  });
  it("keeps an unfinished CC settlement pending even when invoice is issued", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [{ id: 125, estado: "parcial", credit_reapplication_intent: { status: "completed", settlement: { status: "pending" } } }] } as any);
    expect(await receptionOperationStatus(operation)).toMatchObject({ financiallyComplete: false, attempt: { invoice: null } });
  });
});
