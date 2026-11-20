import { describe, it, expect, vi } from "vitest";
vi.mock("../db", () => ({ db: { execute: vi.fn() }, pool: {} }));
import { db } from "../db";
import { acknowledgedPayments, receptionOperationStatus } from "../billing/receptionOperations";
const payment = { paymentRequestId: "request-1", reservationId: "r1", amount: "100.00", method: "efectivo", date: "2026-11-03", reference: null, notes: null };
const saved = { payment_request_id: "request-1", reservation_id: "r1", amount: "100", method: "efectivo", date: "2026-11-03", reference: null, notes: null, status: "active", invoice_ref: JSON.stringify({ id: 77 }) };
describe("Pagos recuperados con evidencia exacta", () => {
  it.each([null, JSON.stringify({id:88})])('reconoce un anticipo original aunque luego se haya aplicado a otro comprobante: %s',invoice_ref=>{
    expect(acknowledgedPayments([{...payment,unlinkedAdvance:true}],[{...saved,invoice_ref}], 'r1',77)).toEqual(['request-1']);
    expect(acknowledgedPayments([{...payment,unlinkedAdvance:true}],[{...saved,amount:'99',invoice_ref}], 'r1',77)).toEqual([]);
  });
  it("reconoce el pago guardado y permite omitir el reenvío desde otra sesión", () => {
    expect(acknowledgedPayments([payment], [saved], "r1", 77)).toEqual(["request-1"]);
  });
  it.each([{ invoice_ref: JSON.stringify({ id: 78 }) }, { payment_request_id: "other" }, { reservation_id: "r2" }, { amount: "99" }, { method: "transferencia" }, { date: "2026-11-04" }, { notes: "retención" }, { status: "anulado" }, { invoice_ref: "inválido" }])("no infiere un pago por coincidencia de importe: %s", change => {
    expect(acknowledgedPayments([payment], [{ ...saved, ...change }], "r1", 77)).toEqual([]);
  });
});

describe("Discovery of issued invoices after a partial credit note", () => {
  const reopenedOperation: any = { operation_id: 'issued-stay', owner_id: 'r1', owner_type: 'reservation', invoice_id: 125, stage: 'authorized', request_snapshot: {
    cashFormaPago: 'cuenta_corriente', prefacturaRecovery: { version: 2, payments: [], checkoutRequested: true,
      checkoutDebtAccount: {operationId:'departure-1',entityType:'agency',entityId:'agency-1',maximumBalance:7500} }
  } };
  it.each([true,false])('only releases a reopened departure recovery with exact durable transfer evidence (%s)',async committed=>{
    vi.mocked(db.execute).mockReset()
      .mockResolvedValueOnce({rows:[{id:125,estado:'emitida',credit_reapplication_intent:{status:'completed',settlement:{status:'completed'}}}]} as any)
      .mockResolvedValueOnce({rows:[{status:'checked_in'}]} as any)
      .mockResolvedValueOnce({rows:committed?[{id:'original-transfer'}]:[]} as any);
    const result=await receptionOperationStatus(reopenedOperation);
    expect(result).toMatchObject({financiallyComplete:committed,departureReopened:committed,invoice:{id:125}});
    expect(vi.mocked(db.execute)).toHaveBeenCalledTimes(3);
  });
  it('does not release an unfinished invoice settlement even after its departure was committed',async()=>{
    vi.mocked(db.execute).mockReset()
      .mockResolvedValueOnce({rows:[{id:125,estado:'emitida',credit_reapplication_intent:{status:'completed',settlement:{status:'pending'}}}]} as any)
      .mockResolvedValueOnce({rows:[{status:'checked_in'}]} as any)
      .mockResolvedValueOnce({rows:[{id:'original-transfer'}]} as any);
    expect(await receptionOperationStatus(reopenedOperation)).toMatchObject({financiallyComplete:false,attempt:{invoice:null}});
  });
  it('explains a modified receipt without acknowledging it or allowing a second collection',async()=>{
    vi.mocked(db.execute).mockResolvedValueOnce({rows:[{id:77,estado:'emitida'}]} as any).mockResolvedValueOnce({rows:[{...saved,method:'transferencia'}]} as any);
    const result=await receptionOperationStatus({operation_id:'original',owner_id:'r1',invoice_id:77,stage:'authorized',request_snapshot:{prefacturaRecovery:{version:2,payments:[payment],checkoutRequested:false}}} as any);
    expect(result).toMatchObject({stage:'authorized',financiallyComplete:false,acknowledgedPaymentIds:[],paymentConflicts:['request-1'],paymentConflictMessage:expect.stringContaining('check-out se gestiona por separado')});
  });
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
