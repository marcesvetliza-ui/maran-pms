import { randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BILLING_OPERATION_SCHEMA_SQL } from "../billing/operationJournal";
import { lastAuthorizedForRequest } from "./helpers/wsfeLastAuthorizedFixture";

const mocks = vi.hoisted(() => ({ point: 9900, environment: "homologacion", role: "admin", authorize: vi.fn(), consult: vi.fn() }));
vi.mock("../billing/billingConfig", () => ({ getBillingConfig: async () => ({ arcaAmbiente: mocks.environment, puntoVenta: mocks.point, puntoVentaHomolog: mocks.point, arcaCuit: "30717698130" }) }));
vi.mock("../billing/wsaaClient", () => ({ getTokenAuth: async () => ({ token: "test", sign: "test" }) }));
vi.mock("../billing/wsfevClient", () => ({ feCAESolicitar: mocks.authorize, feCompConsultar: mocks.consult }));

const suite = process.env.CI === "true" && /(127\.0\.0\.1|localhost):5432\/maran_test$/.test(process.env.DATABASE_URL || "") ? describe : describe.skip;
const pool = suite === describe ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
const originalFetch = global.fetch;
const authorization = { cae: "71234567890123", caeFechaVto: new Date("2026-11-22T15:00:00Z") };
let server: any, base: string;
async function post(path: string, body: unknown = {}) {
  const response = await originalFetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as any };
}
async function fixture(run: (f: any) => Promise<void>) {
  mocks.point = 10000 + Math.floor(Math.random() * 70000);
  const point = mocks.point, operation = randomUUID(), company = randomUUID();
  const name = "Synthetic CC " + company;
  await pool!.query("INSERT INTO companies(id,razon_social,cuil_cuit,condicion_iva) VALUES($1,$2,'30716219867','exento')", [company, name]);
  const request = {
    operationId: operation, tipoComprobante: "FB", recipientMode: "centro_comprobantes", recipientEntity: { type: "company", id: company },
    cliente: { razonSocial: name, cuit: "30716219867", condicionIva: "Exento" },
    cashArea: "recepcion", cashFormaPago: "cuenta_corriente", cashFormaPagoDetalle: [{ method: "cuenta_corriente", amount: 2406000 }],
    puntoVenta: point,
    items: [{ descripcion: "Alojamiento en Hotel Maran", cantidad: 1, precioUnitario: 2406000, alicuotaIva: "21", subtotalNeto: 1988429.75, subtotal: 2406000, catalogItem: { source: "accommodation", id: "alojamiento" } }],
  };
  try { await run({ point, operation, company, request }); }
  finally {
    await pool!.query("DELETE FROM account_movements WHERE entity_id=$1", [company]);
    await pool!.query("DELETE FROM cash_movements WHERE source_type='comprobante' AND source_id IN(SELECT id::text FROM sales_invoices WHERE punto_venta=$1)", [point]);
    await pool!.query("DELETE FROM audit_logs WHERE entity_type='billing_operation' AND entity_id=$1", [operation]);
    await pool!.query("DELETE FROM billing_operations WHERE operation_id=$1 OR invoice_id IN(SELECT id FROM sales_invoices WHERE punto_venta=$2)", [operation,point]);
    await pool!.query("DELETE FROM sales_invoices WHERE punto_venta=$1", [point]);
    await pool!.query("DELETE FROM invoice_counters WHERE punto_venta=$1", [point]);
    await pool!.query("DELETE FROM companies WHERE id=$1", [company]);
  }
}
async function rejectRecipient(f: any) {
  mocks.authorize.mockReset().mockRejectedValue(Object.assign(new Error("ARCA 10015: receptor no registrado en el padrón"), {code:"ARCA_AUTHORIZATION_REJECTED",statusCode:400}));
  expect((await post("/api/billing/invoices", f.request)).status).toBe(400);
  return (await pool!.query("SELECT * FROM sales_invoices WHERE punto_venta=$1", [f.point])).rows[0];
}
suite("center invoice recovers its own ARCA number and registers CC once", () => {
  beforeAll(async () => {
    await pool!.query(BILLING_OPERATION_SCHEMA_SQL);
    await (await import("../permissions")).loadRolePermissionsCache();
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: "center-recovery-test", username: "Synthetic reception", role: mocks.role } as any;
      req.isAuthenticated = () => true; next();
    });
    (await import("../billing/routes")).registerBillingRoutes(app);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  beforeEach(() => {
    mocks.environment = "homologacion"; mocks.role = "admin";
    mocks.authorize.mockReset().mockRejectedValueOnce(new Error("Respuesta de ARCA no recibida"));
    mocks.consult.mockReset().mockResolvedValue(authorization);
    global.fetch = vi.fn(async (_url, init) => new Response(lastAuthorizedForRequest(244, init), { status: 200 })) as any;
  });
  afterAll(async () => {
    global.fetch = originalFetch;
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    await pool?.end();
  });

  it.each([true, false])("recovers the existing 245 without duplicating CC, ARCA had authorized=%s", async authorized => fixture(async f => {
    const failed = await post("/api/billing/invoices", f.request);
    expect(failed.status).toBe(500);
    const invoice = (await pool!.query("SELECT * FROM sales_invoices WHERE punto_venta=$1", [f.point])).rows[0];
    expect(invoice).toMatchObject({ numero: 245, estado: "autorizacion_pendiente", cae: null });
    const newAttempt = await post("/api/billing/invoices", { ...f.request, operationId: randomUUID() });
    expect(newAttempt.status).toBe(409); expect(newAttempt.body.code).toBe("BILLING_CENTER_RECOVERY_REQUIRED");
    expect((await originalFetch(base + `/api/billing/invoices/${invoice.id}/pdf`)).status).toBe(409);
    if (!authorized) { mocks.consult.mockResolvedValue(null); mocks.authorize.mockResolvedValue(authorization); }
    const result = await post(`/api/billing/invoices/${invoice.id}/recover-center`, { items: [], cashFormaPago: "efectivo", montoTotal: 1 });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    expect(result.body).toMatchObject({ id: invoice.id, numero: 245, cae: authorization.cae });
    const replay = await post(`/api/billing/invoices/${invoice.id}/recover-center`);
    expect(replay.status, JSON.stringify(replay.body)).toBe(201);
    expect(replay.body.id).toBe(invoice.id);
    expect(mocks.authorize).toHaveBeenCalledTimes(authorized ? 1 : 2);
    expect(global.fetch).toHaveBeenCalledTimes(1); // only the original last-number lookup
    const accounts = (await pool!.query("SELECT amount,payment_method FROM account_movements WHERE entity_id=$1", [f.company])).rows;
    expect(accounts).toEqual([{ amount: "2406000.00", payment_method: "cuenta_corriente" }]);
    expect((await pool!.query("SELECT id FROM cash_movements WHERE source_type='comprobante' AND source_id=$1", [String(invoice.id)])).rows).toHaveLength(0);
    expect((await pool!.query("SELECT numero,center_settlement_status,reconciliation_status FROM sales_invoices WHERE punto_venta=$1", [f.point])).rows).toEqual([{ numero:245, center_settlement_status:"settled", reconciliation_status:"conciliada" }]);
  }));

  it("handles simultaneous recovery requests without duplicating the invoice or CC", async () => fixture(async f => {
    await post("/api/billing/invoices", f.request);
    const invoice = (await pool!.query("SELECT id FROM sales_invoices WHERE punto_venta=$1", [f.point])).rows[0];
    const results = await Promise.all([post(`/api/billing/invoices/${invoice.id}/recover-center`), post(`/api/billing/invoices/${invoice.id}/recover-center`)]);
    expect(results.some(result => result.status === 201)).toBe(true);
    expect(results.every(result => [201,409].includes(result.status))).toBe(true);
    expect((await pool!.query("SELECT id FROM sales_invoices WHERE punto_venta=$1", [f.point])).rows).toHaveLength(1);
    expect((await pool!.query("SELECT id FROM account_movements WHERE entity_id=$1", [f.company])).rows).toHaveLength(1);
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
  }));

  it("keeps an actual ARCA rejection and its original explanation without reauthorizing or recording debt", async () => fixture(async f => {
    mocks.authorize.mockReset().mockRejectedValue(Object.assign(new Error("ARCA 10016: fecha rechazada"), { code:"ARCA_AUTHORIZATION_REJECTED", statusCode:400 }));
    expect((await post("/api/billing/invoices", f.request)).status).toBe(400);
    const invoice = (await pool!.query("SELECT id FROM sales_invoices WHERE punto_venta=$1", [f.point])).rows[0];
    const result = await post(`/api/billing/invoices/${invoice.id}/recover-center`);
    expect(result.status).toBe(409); expect(result.body.error).toContain("ARCA 10016");
    expect(mocks.authorize).toHaveBeenCalledTimes(1); expect(mocks.consult).not.toHaveBeenCalled();
    expect((await pool!.query("SELECT id FROM account_movements WHERE entity_id=$1", [f.company])).rows).toHaveLength(0);
  }));

  it("does not recover another account, a modified snapshot, a different fiscal environment or an unauthorized role", async () => fixture(async f => {
    await post("/api/billing/invoices", f.request);
    const invoice = (await pool!.query("SELECT id FROM sales_invoices WHERE punto_venta=$1", [f.point])).rows[0];
    mocks.role = "housekeeping";
    expect((await post(`/api/billing/invoices/${invoice.id}/recover-center`)).status).toBe(403);
    mocks.role = "admin"; mocks.environment = "produccion";
    expect((await post(`/api/billing/invoices/${invoice.id}/recover-center`)).status).toBe(409);
    mocks.environment = "homologacion";
    await pool!.query("UPDATE sales_invoices SET group_id='another-owner' WHERE id=$1", [invoice.id]);
    expect((await post(`/api/billing/invoices/${invoice.id}/recover-center`)).status).toBe(409);
    await pool!.query("UPDATE sales_invoices SET group_id=NULL WHERE id=$1", [invoice.id]);
    await pool!.query("UPDATE billing_operations SET request_snapshot=jsonb_set(request_snapshot,'{cashFormaPago}','\"efectivo\"') WHERE operation_id=$1", [f.operation]);
    expect((await post(`/api/billing/invoices/${invoice.id}/recover-center`)).status).toBe(409);
    expect(mocks.consult).not.toHaveBeenCalled(); expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect((await pool!.query("SELECT id FROM account_movements WHERE entity_id=$1", [f.company])).rows).toHaveLength(0);
  }));

  it("closes only a confirmed unissued rejection, preserving audit and allowing ARCA to reuse 245", async () => fixture(async f => {
    const invoice = await rejectRecipient(f);
    const list = await (await originalFetch(base + '/api/billing/invoices?cliente=' + encodeURIComponent(f.request.cliente.razonSocial))).json();
    expect(list.find((row:any)=>row.id===invoice.id).center_rejection_correctable).toBe(true);
    mocks.consult.mockResolvedValue(null);
    const counter = (await pool!.query("SELECT ultimo_numero FROM invoice_counters WHERE punto_venta=$1", [f.point])).rows;
    const result = await post(`/api/billing/invoices/${invoice.id}/correct-rejected-center`);
    expect(result.status,JSON.stringify(result.body)).toBe(200);
    expect((await post(`/api/billing/invoices/${invoice.id}/correct-rejected-center`)).status).toBe(200);
    expect(mocks.consult).toHaveBeenCalledTimes(1); expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.consult).toHaveBeenCalledWith(expect.objectContaining({numero:245,puntoVenta:f.point}), 'homologacion', expect.objectContaining({docTipo:80,docNro:'30716219867',total:2406000}));
    expect((await pool!.query("SELECT * FROM sales_invoices WHERE id=$1", [invoice.id])).rows).toHaveLength(0);
    const operation = (await pool!.query("SELECT * FROM billing_operations WHERE operation_id=$1", [f.operation])).rows[0];
    expect(operation).toMatchObject({stage:"corrected",invoice_id:null});
    expect(operation.request_snapshot.discardedDraft).toMatchObject({id:invoice.id,numero:245,cliente_cuit:"30716219867",cae:null});
    expect((await pool!.query("SELECT id FROM audit_logs WHERE entity_type='billing_operation' AND entity_id=$1", [f.operation])).rows).toHaveLength(1);
    expect((await pool!.query("SELECT ultimo_numero FROM invoice_counters WHERE punto_venta=$1", [f.point])).rows).toEqual(counter);
    expect((await pool!.query("SELECT id FROM account_movements WHERE entity_id=$1", [f.company])).rows).toHaveLength(0);
    expect((await pool!.query("SELECT id FROM cash_movements WHERE source_type='comprobante' AND source_id=$1", [String(invoice.id)])).rows).toHaveLength(0);
    // The operator now corrects the synthetic recipient, not the old fiscal row.
    await pool!.query("UPDATE companies SET cuil_cuit='30717698130' WHERE id=$1", [f.company]);
    mocks.authorize.mockResolvedValue(authorization);
    const next = await post('/api/billing/invoices',{...f.request,operationId:randomUUID(),cliente:{...f.request.cliente,cuit:'30717698130'}});
    expect(next.status,JSON.stringify(next.body)).toBe(201); expect(next.body.numero).toBe(245);
  }));

  it.each(['authorized','unavailable','uncertain'])('keeps the draft when authorization cannot be ruled out: %s',async outcome=>fixture(async f=>{
    let invoice;
    if(outcome==='uncertain') {
      await post('/api/billing/invoices',f.request);
      invoice=(await pool!.query('SELECT * FROM sales_invoices WHERE punto_venta=$1',[f.point])).rows[0];
    } else invoice=await rejectRecipient(f);
    if(outcome==='unavailable')mocks.consult.mockRejectedValue(new Error('Consulta ARCA no disponible'));
    const result=await post(`/api/billing/invoices/${invoice.id}/correct-rejected-center`);
    expect([409,502]).toContain(result.status);
    expect((await pool!.query('SELECT id FROM sales_invoices WHERE id=$1',[invoice.id])).rows).toHaveLength(1);
    expect((await pool!.query('SELECT stage FROM billing_operations WHERE operation_id=$1',[f.operation])).rows[0].stage).toBe(outcome==='uncertain'?'uncertain':'rejected');
    expect((await pool!.query('SELECT id FROM account_movements WHERE entity_id=$1',[f.company])).rows).toHaveLength(0);
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    if(outcome==='uncertain')expect(mocks.consult).not.toHaveBeenCalled();
  }));

  it.each(['account','payment'])('keeps rejected drafts with an existing %s link',async kind=>fixture(async f=>{
    const invoice=await rejectRecipient(f); const payment=randomUUID();
    if(kind==='account')await pool!.query("INSERT INTO account_movements(entity_type,entity_id,date,type,description,amount,reference) VALUES('company',$1,CURRENT_DATE,'cargo','Synthetic linked debt',2406000,$2)",[f.company,`FB-${String(f.point).padStart(4,'0')}-00000245`]);
    else await pool!.query("INSERT INTO payments(id,reservation_id,amount,method,date,invoice_ref) VALUES($1,'synthetic-center',2406000,'transferencia',CURRENT_DATE,$2)",[payment,JSON.stringify({id:invoice.id})]);
    try {
      const result=await post(`/api/billing/invoices/${invoice.id}/correct-rejected-center`);
      expect(result.status).toBe(409);expect(mocks.consult).not.toHaveBeenCalled();
      expect((await pool!.query('SELECT id FROM sales_invoices WHERE id=$1',[invoice.id])).rows).toHaveLength(1);
    } finally {if(kind==='payment')await pool!.query('DELETE FROM payments WHERE id=$1',[payment]);}
  }));

  it('checks permissions and fiscal identity before consulting a rejection',async()=>fixture(async f=>{
    const invoice=await rejectRecipient(f);
    mocks.role='housekeeping';expect((await post(`/api/billing/invoices/${invoice.id}/correct-rejected-center`)).status).toBe(403);
    mocks.role='admin';mocks.environment='produccion';expect((await post(`/api/billing/invoices/${invoice.id}/correct-rejected-center`)).status).toBe(409);
    expect(mocks.consult).not.toHaveBeenCalled();
  }));
  it('serializes concurrent closures and preserves a single audited discarded draft',async()=>fixture(async f=>{
    const invoice=await rejectRecipient(f);mocks.consult.mockResolvedValue(null);
    const results=await Promise.all([post(`/api/billing/invoices/${invoice.id}/correct-rejected-center`),post(`/api/billing/invoices/${invoice.id}/correct-rejected-center`)]);
    expect(results.some(result=>result.status===200)).toBe(true);expect(results.every(result=>[200,409].includes(result.status))).toBe(true);
    expect(mocks.consult).toHaveBeenCalledTimes(1);expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect((await pool!.query("SELECT id FROM audit_logs WHERE entity_type='billing_operation' AND entity_id=$1",[f.operation])).rows).toHaveLength(1);
    expect((await pool!.query('SELECT id FROM sales_invoices WHERE id=$1',[invoice.id])).rows).toHaveLength(0);
  }));
});
