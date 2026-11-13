import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { lastAuthorizedForRequest } from "./helpers/wsfeLastAuthorizedFixture";

const mocks = vi.hoisted(() => ({ point: 5, last: 253, authorize: vi.fn(), consult: vi.fn() }));
vi.mock("../billing/billingConfig", () => ({ getBillingConfig: async () => ({ arcaAmbiente: "homologacion", puntoVentaHomolog: mocks.point, arcaCuit: "30717698130" }) }));
vi.mock("../billing/wsaaClient", () => ({ getTokenAuth: async () => ({ token: "synthetic", sign: "synthetic" }) }));
vi.mock("../billing/wsfevClient", () => ({ feCAESolicitar: mocks.authorize, feCompConsultar: mocks.consult }));
const url = process.env.DATABASE_URL;
const enabled = !!url && ["127.0.0.1", "localhost"].includes(new URL(url).hostname) && /test/i.test(new URL(url).pathname);
const suite = enabled ? describe : describe.skip;
const pool = enabled ? new pg.Pool({ connectionString: url }) : null;
const originalFetch = global.fetch;
const authorization = { cae: "71234567890123", caeFechaVto: new Date("2026-11-23T15:00:00Z") };
let emit: typeof import("../billing/invoiceService").emitirFactura;

async function fixture(run: (f: any) => Promise<void>, reservation = false) {
  mocks.point = 10000 + Math.floor(Math.random() * 70000);
  const point = mocks.point, oldOperation = randomUUID(), newOperation = randomUUID(), reservationId = randomUUID();
  const request = { tipoComprobante: "FB", cliente: { razonSocial: "Receptor sintético", cuit: "30717698130", condicionIva: "Consumidor Final" },
    items: [{ descripcion: "Venta sintética", cantidad: 1, precioUnitario: 146400, alicuotaIva: "21", subtotalNeto: 120991.74, subtotal: 146400 }],
    puntoVentaOverride: point, ...(reservation ? { reservaId: reservationId, prefacturaRecovery: { version: 2, payments: [], checkoutRequested: false } } : { recipientMode: "centro_comprobantes", cashArea: "recepcion" }),
    cashFormaPago: "efectivo", cashFormaPagoDetalle: [{ method: "efectivo", amount: 146400 }] };
  const data = { ...request, ...(!reservation ? { centerSettlementArea: "recepcion" } : {}), operationId: oldOperation, requestSnapshot: request } as any;
  mocks.authorize.mockRejectedValueOnce(Object.assign(new Error("ARCA 10015: receptor no registrado"), { code: "ARCA_AUTHORIZATION_REJECTED", statusCode: 400 }));
  try {
    await expect(emit(data)).rejects.toMatchObject({ code: "ARCA_AUTHORIZATION_REJECTED" });
    const invoice = (await pool!.query("SELECT * FROM sales_invoices WHERE punto_venta=$1", [point])).rows[0];
    const nextRequest = { ...request, reservaId: randomUUID(), cliente: { ...request.cliente, razonSocial: "Otra reserva sintética" },
      prefacturaRecovery: { version: 2, payments: [], checkoutRequested: false } };
    const next = { ...nextRequest, operationId: newOperation, requestSnapshot: nextRequest } as any;
    await run({ point, invoice, oldOperation, newOperation, next, data, reservationId });
  } finally {
    const operations = (await pool!.query("SELECT operation_id FROM billing_operations WHERE fiscal_identity->>'pointOfSale'=$1", [String(point)])).rows.map(r => r.operation_id);
    await pool!.query("DELETE FROM audit_logs WHERE entity_type='billing_operation' AND entity_id=ANY($1)", [operations]);
    await pool!.query("DELETE FROM billing_operations WHERE fiscal_identity->>'pointOfSale'=$1", [String(point)]);
    await pool!.query("DELETE FROM sales_invoices WHERE punto_venta=$1", [point]);
    await pool!.query("DELETE FROM invoice_counters WHERE punto_venta=$1", [point]);
  }
}

suite("Recuperación segura de la serie después de un borrador retenido", () => {
  beforeAll(async () => { ({ emitirFactura: emit } = await import("../billing/invoiceService")); });
  beforeEach(() => {
    mocks.last = 253; mocks.authorize.mockReset().mockResolvedValue(authorization); mocks.consult.mockReset().mockResolvedValue(null);
    global.fetch = vi.fn(async (_url, init) => new Response(lastAuthorizedForRequest(mocks.last, init), { status: 200 })) as any;
  });
  afterAll(async () => { global.fetch = originalFetch; await pool?.end(); });

  it.each([false, true])("una reserva nueva puede usar 254 tras verificar y archivar el rechazado (reserva original=%s)", async reservation => fixture(async f => {
    const result = await emit(f.next);
    expect(result.numero).toBe(254); expect(result.id).not.toBe(f.invoice.id);
    expect(result.reservaId).toBe(f.next.reservaId);
    expect((await pool!.query("SELECT id FROM sales_invoices WHERE id=$1", [f.invoice.id])).rows).toHaveLength(0);
    const journal = (await pool!.query("SELECT * FROM billing_operations WHERE operation_id=$1", [f.oldOperation])).rows[0];
    expect(journal.stage).toBe("corrected"); expect(journal.invoice_id).toBeNull();
    expect(journal.request_snapshot.discardedDraft).toMatchObject({ id: f.invoice.id, numero: 254, cae: null });
    if (reservation) {
      const { receptionOperationStatus } = await import("../billing/receptionOperations");
      expect(await receptionOperationStatus(journal)).toMatchObject({ stage: "corrected", safeToCorrect: true, canRetryNumberConflict: false });
    }
    expect((await pool!.query("SELECT id FROM audit_logs WHERE entity_id=$1 AND entity_type='billing_operation'", [f.oldOperation])).rows).toHaveLength(1);
    expect((await pool!.query("SELECT ultimo_numero FROM invoice_counters WHERE punto_venta=$1", [f.point])).rows[0].ultimo_numero).toBe(254);
    expect(mocks.consult).toHaveBeenCalledWith(expect.objectContaining({ numero: 254, puntoVenta: f.point }), "homologacion",
      expect.objectContaining({ total: 146400, docTipo: 80, docNro: "30717698130" }));
    await expect(emit(f.data)).rejects.toMatchObject({ code: "BILLING_CORRECTION_REQUIRED" });
    expect((await pool!.query("SELECT id FROM cash_movements WHERE source_id=$1 AND source_type='comprobante'", [String(f.invoice.id)])).rows).toHaveLength(0);
    expect((await pool!.query("SELECT id FROM payments WHERE reservation_id=ANY($1)", [[f.reservationId, f.next.reservaId]])).rows).toHaveLength(0);
    const replay = await emit(f.next); expect(replay.id).toBe(result.id); expect(mocks.authorize).toHaveBeenCalledTimes(2);
  }, reservation));

  it("archiva un borrador interrumpido antes de submitting, después de consultar ARCA", async () => fixture(async f => {
    await pool!.query("UPDATE billing_operations SET stage='numbered',error_code=NULL WHERE operation_id=$1", [f.oldOperation]);
    await pool!.query("UPDATE sales_invoices SET reconciliation_error=NULL WHERE id=$1", [f.invoice.id]);
    expect((await emit(f.next)).numero).toBe(254);
    expect((await pool!.query("SELECT error_code FROM billing_operations WHERE operation_id=$1", [f.oldOperation])).rows[0].error_code).toBe("BILLING_UNSENT_DRAFT_RETIRED");
  }));

  it("recupera el hueco histórico entre la inserción del borrador y su vínculo al journal", async () => fixture(async f => {
    await pool!.query("UPDATE billing_operations SET stage='prepared',invoice_id=NULL,error_code=NULL WHERE operation_id=$1", [f.oldOperation]);
    await pool!.query("UPDATE sales_invoices SET reconciliation_error=NULL WHERE id=$1", [f.invoice.id]);
    expect((await emit(f.next)).numero).toBe(254);
    const operation = (await pool!.query("SELECT * FROM billing_operations WHERE operation_id=$1", [f.oldOperation])).rows[0];
    expect(operation.error_code).toBe("BILLING_UNSENT_DRAFT_RETIRED");
    expect(operation.request_snapshot.discardedDraft.id).toBe(f.invoice.id);
  }));

  it("una falla al vincular el journal revierte también el borrador nuevo y permite reintentar", async () => fixture(async f => {
    const trigger = `draft_link_${randomUUID().replaceAll("-", "")}`;
    await pool!.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation_id='${f.newOperation}' AND NEW.stage='numbered' THEN RAISE EXCEPTION 'synthetic journal failure'; END IF; RETURN NEW; END $$`);
    await pool!.query(`CREATE TRIGGER ${trigger} BEFORE UPDATE ON billing_operations FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
    try {
      await expect(emit(f.next)).rejects.toThrow();
      expect((await pool!.query("SELECT id FROM sales_invoices WHERE punto_venta=$1", [f.point])).rows).toHaveLength(0);
      expect((await pool!.query("SELECT stage,invoice_id FROM billing_operations WHERE operation_id=$1", [f.newOperation])).rows[0]).toEqual({ stage: "prepared", invoice_id: null });
      expect(mocks.authorize).toHaveBeenCalledTimes(1);
    } finally { await pool!.query(`DROP TRIGGER ${trigger} ON billing_operations`); await pool!.query(`DROP FUNCTION ${trigger}()`); }
    expect((await emit(f.next)).numero).toBe(254);
  }));

  it.each(["uncertain", "submitting"])("conserva un resultado %s no encontrado, pero permite verificar otra vez el mismo pedido bloqueado", async stage => fixture(async f => {
    await pool!.query("UPDATE billing_operations SET stage=$2,error_code='ARCA_RESULT_UNCERTAIN' WHERE operation_id=$1", [f.oldOperation, stage]);
    for (let i = 0; i < 2; i++) await expect(emit(f.next)).rejects.toMatchObject({ code: "BILLING_NUMBER_CONFLICT", conflictInvoiceId: f.invoice.id });
    const { receptionOperationStatus } = await import("../billing/receptionOperations");
    const blocked = (await pool!.query("SELECT * FROM billing_operations WHERE operation_id=$1", [f.newOperation])).rows[0];
    expect(await receptionOperationStatus(blocked)).toMatchObject({ stage: "blocked", canRetryNumberConflict: true, message: expect.stringContaining(`#${f.invoice.id}`) });
    await expect(emit({ ...f.next, requestSnapshot: { ...f.next.requestSnapshot, cashFormaPago: "transferencia" } })).rejects.toMatchObject({ code: "BILLING_OPERATION_MISMATCH" });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect((await pool!.query("SELECT * FROM sales_invoices WHERE id=$1", [f.invoice.id])).rows[0]).toEqual(f.invoice);
    // A later lookup can confirm the ORIGINAL authorization. Never adopt it
    // as the new customer's invoice, and never request it a second time.
    mocks.consult.mockImplementationOnce(async () => { mocks.last = 254; return authorization; });
    const result = await emit(f.next);
    expect(result.numero).toBe(255); expect(result.id).not.toBe(f.invoice.id);
    const original = (await pool!.query("SELECT estado,cae,reconciliation_status FROM sales_invoices WHERE id=$1", [f.invoice.id])).rows[0];
    expect(original).toEqual({ estado: "emitida", cae: authorization.cae, reconciliation_status: "pendiente" });
    expect(mocks.authorize).toHaveBeenCalledTimes(2);
    expect((await emit(f.next)).id).toBe(result.id); expect(mocks.authorize).toHaveBeenCalledTimes(2);
  }));

  it("si la consulta contradice la última numeración, conserva el CAE original y no salta al 255", async () => fixture(async f => {
    mocks.consult.mockResolvedValue(authorization); // last-authorized still says 253
    await expect(emit(f.next)).rejects.toMatchObject({ code: "BILLING_NUMBER_CONFLICT" });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect((await pool!.query("SELECT cae FROM sales_invoices WHERE id=$1", [f.invoice.id])).rows[0].cae).toBe(authorization.cae);
    expect((await pool!.query("SELECT ultimo_numero FROM invoice_counters WHERE punto_venta=$1", [f.point])).rows[0].ultimo_numero).toBe(254);
  }));

  it.each(["payment", "cash", "account"])("no archiva un rechazo con un vínculo de %s", async kind => fixture(async f => {
    const id = randomUUID();
    try {
      if (kind === "payment") await pool!.query("INSERT INTO payments(id,reservation_id,amount,method,date,invoice_ref) VALUES($1,'synthetic',146400,'efectivo',CURRENT_DATE,$2)", [id, JSON.stringify({ id: f.invoice.id })]);
      if (kind === "cash") await pool!.query("INSERT INTO cash_movements(id,area,source_type,source_id,payment_method,amount) VALUES($1,'recepcion','comprobante',$2,'efectivo',146400)", [id, String(f.invoice.id)]);
      if (kind === "account") await pool!.query("INSERT INTO account_movements(entity_type,entity_id,date,type,description,amount,reference) VALUES('guest',$1,CURRENT_DATE,'cargo','Synthetic',146400,$2)", [id, `FB-${String(f.point).padStart(4, "0")}-00000254`]);
      await expect(emit(f.next)).rejects.toMatchObject({ code: "BILLING_NUMBER_CONFLICT" });
      expect((await pool!.query("SELECT * FROM sales_invoices WHERE id=$1", [f.invoice.id])).rows[0]).toEqual(f.invoice);
      expect((await pool!.query("SELECT stage FROM billing_operations WHERE operation_id=$1", [f.oldOperation])).rows[0].stage).toBe("rejected");
      expect(mocks.authorize).toHaveBeenCalledTimes(1);
    } finally {
      await pool!.query("DELETE FROM payments WHERE id=$1", [id]); await pool!.query("DELETE FROM cash_movements WHERE id=$1", [id]);
      await pool!.query("DELETE FROM account_movements WHERE entity_id=$1", [id]);
    }
  }));

  it("no confunde una coincidencia parcial de invoice_ref con un pago del borrador", async () => fixture(async f => {
    const id = randomUUID(), reference = JSON.stringify({ id: Number(f.invoice.id) + 100000, notes: `Referencia ${f.invoice.id}` });
    await pool!.query("INSERT INTO payments(id,reservation_id,amount,method,date,invoice_ref) VALUES($1,'synthetic',5,'efectivo',CURRENT_DATE,$2)", [id, reference]);
    try {
      expect((await emit(f.next)).numero).toBe(254);
      expect((await pool!.query("SELECT invoice_ref FROM payments WHERE id=$1", [id])).rows[0].invoice_ref).toBe(reference);
    } finally { await pool!.query("DELETE FROM payments WHERE id=$1", [id]); }
  }));

  it.each(["issuer", "environment", "snapshot", "ficticio"])("no consulta ni altera un borrador con evidencia incorrecta: %s", async kind => fixture(async f => {
    if (kind === "issuer" || kind === "environment") await pool!.query("UPDATE sales_invoices SET fiscal_identity=jsonb_set(fiscal_identity,ARRAY[$2],to_jsonb($3::text)) WHERE id=$1", [f.invoice.id, kind, kind === "issuer" ? "99999999999" : "produccion"]);
    if (kind === "snapshot") await pool!.query("UPDATE billing_operations SET request_snapshot=jsonb_set(request_snapshot,'{cliente,razonSocial}','\"Otra persona\"') WHERE operation_id=$1", [f.oldOperation]);
    if (kind === "ficticio") await pool!.query("UPDATE sales_invoices SET modo_ficticio=true WHERE id=$1", [f.invoice.id]);
    await expect(emit(f.next)).rejects.toMatchObject({ code: "BILLING_NUMBER_CONFLICT" });
    expect(mocks.consult).not.toHaveBeenCalled(); expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect((await pool!.query("SELECT id FROM sales_invoices WHERE id=$1", [f.invoice.id])).rows).toHaveLength(1);
  }));

  it("mantiene la serie y el borrador cuando ARCA no responde a la consulta", async () => fixture(async f => {
    mocks.consult.mockRejectedValue(new Error("Consulta agotó tiempo"));
    await expect(emit(f.next)).rejects.toMatchObject({ code: "BILLING_NUMBER_CONFLICT" });
    expect((await pool!.query("SELECT * FROM sales_invoices WHERE id=$1", [f.invoice.id])).rows[0]).toEqual(f.invoice);
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
  }));

  it("no espera sobre una reserva que está procesando otra operación financiera", async () => fixture(async f => {
    const c = await pool!.connect();
    try {
      await c.query("SELECT pg_advisory_lock(hashtext($1))", [`folio-invoice:${f.reservationId}`]);
      await expect(emit(f.next)).rejects.toMatchObject({ code: "BILLING_NUMBER_CONFLICT" });
      expect(mocks.consult).not.toHaveBeenCalled();
    } finally { await c.query("SELECT pg_advisory_unlock(hashtext($1))", [`folio-invoice:${f.reservationId}`]); c.release(); }
    expect((await emit(f.next)).numero).toBe(254);
  }, true));

  it("la eliminación y la auditoría son atómicas ante una falla al auditar", async () => fixture(async f => {
    const trigger = `series_recovery_${randomUUID().replaceAll("-", "")}`;
    await pool!.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='${f.oldOperation}' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
    await pool!.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
    try {
      await expect(emit(f.next)).rejects.toThrow();
      expect((await pool!.query("SELECT * FROM sales_invoices WHERE id=$1", [f.invoice.id])).rows[0]).toEqual(f.invoice);
      expect((await pool!.query("SELECT stage,invoice_id FROM billing_operations WHERE operation_id=$1", [f.oldOperation])).rows[0]).toEqual({ stage: "rejected", invoice_id: f.invoice.id });
      expect(mocks.authorize).toHaveBeenCalledTimes(1);
    } finally { await pool!.query(`DROP TRIGGER ${trigger} ON audit_logs`); await pool!.query(`DROP FUNCTION ${trigger}()`); }
  }));

  it("dos reservas concurrentes archivan una sola vez y usan 254 y 255 sin duplicar CAE", async () => fixture(async f => {
    mocks.authorize.mockImplementation(async request => {
      mocks.last = request.numero;
      await new Promise(resolve => setTimeout(resolve, 20));
      return authorization;
    });
    const secondRequest = { ...f.next.requestSnapshot, reservaId: randomUUID() };
    const second = { ...secondRequest, operationId: randomUUID(), requestSnapshot: secondRequest };
    const inputs = [f.next, second];
    const replies = await Promise.allSettled(inputs.map(input => emit(input)));
    expect(replies.filter(reply => reply.status === "fulfilled")).toHaveLength(1);
    const retry = replies.findIndex(reply => reply.status === "rejected");
    expect((await emit(inputs[retry])).numero).toBe(255);
    expect((await pool!.query("SELECT numero FROM sales_invoices WHERE punto_venta=$1 ORDER BY numero", [f.point])).rows).toEqual([{ numero: 254 }, { numero: 255 }]);
    expect((await pool!.query("SELECT id FROM audit_logs WHERE entity_id=$1 AND entity_type='billing_operation'", [f.oldOperation])).rows).toHaveLength(1);
    expect(mocks.authorize).toHaveBeenCalledTimes(3);
  }));
});
