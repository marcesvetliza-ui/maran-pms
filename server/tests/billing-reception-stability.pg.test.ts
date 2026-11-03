import { randomUUID } from "node:crypto";
import pg from "pg";
import express from "express";
import http from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BILLING_OPERATION_SCHEMA_SQL } from "../billing/operationJournal";
import { lastAuthorizedForRequest } from "./helpers/wsfeLastAuthorizedFixture";
const mocks = vi.hoisted(() => ({ point: 9900, environment: "homologacion", authorize: vi.fn(), consult: vi.fn(), token: vi.fn() }));
vi.mock("../billing/billingConfig", () => ({ getBillingConfig: async () => ({ arcaAmbiente: mocks.environment, puntoVenta: mocks.point, puntoVentaHomolog: mocks.point, arcaCuit: "30717698130" }) }));
vi.mock("../billing/wsaaClient", () => ({ getTokenAuth: mocks.token }));
vi.mock("../billing/wsfevClient", () => ({ feCAESolicitar: mocks.authorize, feCompConsultar: mocks.consult }));
vi.mock("../auth", () => ({ requireAuth: (req: any, _res: any, next: any) => { req.user = { role: "admin" }; next(); }, requirePermission: () => (_req: any, _res: any, next: any) => next() }));
const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let emitirFactura: typeof import("../billing/invoiceService").emitirFactura;
let server: http.Server; let base: string;
const originalFetch = global.fetch;
const authorization = { cae: "71234567890123", caeFechaVto: new Date("2026-11-13T15:00:00Z") };
async function fixture(run: (f: any) => Promise<void>) {
  mocks.point = 10000 + Math.floor(Math.random() * 70000);
  const op = randomUUID(), reservation = randomUUID(), requestId = randomUUID();
  const request = { tipoComprobante: "FB", cliente: { razonSocial: "Cliente prueba", condicionIva: "Consumidor Final" }, items: [{ descripcion: "Alojamiento", cantidad: 1, precioUnitario: 100, alicuotaIva: "no_gravado", subtotalNeto: 0, subtotal: 100 }], reservaId: reservation, puntoVentaOverride: mocks.point, creditOperationId: op,
    prefacturaRecovery: { version: 2, payments: [{ reservationId: reservation, paymentRequestId: requestId, amount: "100.00", method: "efectivo", date: "2026-11-03", reference: null, notes: null }], checkoutRequested: true } };
  const data = { ...request, operationId: op, requestSnapshot: request } as any;
  const point = mocks.point;
  try { await run({ op, reservation, requestId, point, data, request }); }
  finally {
    const rows = (await pool!.query("SELECT id FROM sales_invoices WHERE punto_venta=$1", [point])).rows;
    await pool!.query("DELETE FROM audit_logs WHERE entity_type='billing_operation' AND entity_id=$1", [op]);
    await pool!.query("DELETE FROM billing_operations WHERE operation_id=$1 OR invoice_id=ANY($2::int[])", [op, rows.map(row => row.id)]);
    await pool!.query("DELETE FROM sales_invoices WHERE punto_venta=$1", [point]);
    await pool!.query("DELETE FROM invoice_counters WHERE punto_venta=$1", [point]);
  }
}
async function request(path: string, method = "GET") {
  const result = await originalFetch(base + path, { method, headers: { "Content-Type": "application/json" }, ...(method === "POST" ? { body: "{}" } : {}) });
  return { status: result.status, body: await result.json() as any };
}
suite("Estabilidad de facturación de Recepción con PostgreSQL y ARCA simulado", () => {
  beforeAll(async () => {
    await pool!.query(BILLING_OPERATION_SCHEMA_SQL);
    await pool!.query("CREATE UNIQUE INDEX IF NOT EXISTS invoice_counters_tipo_comprobante_punto_venta_unique ON invoice_counters(tipo_comprobante,punto_venta)");
    await pool!.query("CREATE UNIQUE INDEX IF NOT EXISTS sales_invoices_tipo_comprobante_punto_venta_numero_key ON sales_invoices(tipo_comprobante,punto_venta,numero)");
    ({ emitirFactura } = await import("../billing/invoiceService"));
    const { registerReceptionOperationRoutes } = await import("../billing/receptionOperations");
    const app = express(); app.use(express.json()); registerReceptionOperationRoutes(app);
    server = http.createServer(app); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  }, 60000);
  beforeEach(() => {
    mocks.environment = "homologacion"; mocks.authorize.mockReset().mockResolvedValue(authorization); mocks.consult.mockReset().mockResolvedValue(null); mocks.token.mockReset().mockResolvedValue({ token: "mock", sign: "mock" });
    global.fetch = vi.fn(async (_url, init) => new Response(lastAuthorizedForRequest(0, init), { status: 200 })) as any;
  });
  afterAll(async () => { global.fetch = originalFetch; if (server) await new Promise<void>(resolve => server.close(() => resolve())); await pool?.end(); });

  it("un punto inválido no pide token, número, borrador ni autorización", async () => fixture(async f => {
    await expect(emitirFactura({ ...f.data, puntoVentaOverride: f.point + 1 })).rejects.toMatchObject({ code: "BILLING_PREFLIGHT_REJECTED" });
    expect(mocks.token).not.toHaveBeenCalled(); expect(mocks.authorize).not.toHaveBeenCalled();
    expect((await pool!.query("SELECT id FROM sales_invoices WHERE punto_venta=$1", [f.point])).rows).toHaveLength(0);
    expect((await pool!.query("SELECT id FROM invoice_counters WHERE punto_venta=$1", [f.point])).rows).toHaveLength(0);
  }));

  it("una numeración ocupada por datos ficticios se explica sin borrar ni autorizar", async () => fixture(async f => {
    await pool!.query("INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,modo_ficticio) VALUES('FB',$1,1,'2026-11-03','Prueba','Consumidor Final',0,100,true)", [f.point]);
    await expect(emitirFactura(f.data)).rejects.toMatchObject({ code: "BILLING_NUMBER_CONFLICT", authorizationRequested: false });
    expect(mocks.authorize).not.toHaveBeenCalled(); expect(mocks.consult).not.toHaveBeenCalled();
    expect((await pool!.query("SELECT id FROM sales_invoices WHERE punto_venta=$1", [f.point])).rows).toHaveLength(1);
    expect((await pool!.query("SELECT id FROM invoice_counters WHERE punto_venta=$1", [f.point])).rows).toHaveLength(0);
  }));

  it("conserva el borrador antes de ARCA y recupera una respuesta perdida sin segunda autorización", async () => fixture(async f => {
    mocks.authorize.mockImplementationOnce(async () => {
      const operation = (await pool!.query("SELECT * FROM billing_operations WHERE operation_id=$1", [f.op])).rows[0];
      expect(operation.stage).toBe("submitting"); expect(operation.invoice_id).toBeTruthy();
      expect((await pool!.query("SELECT fiscal_identity FROM sales_invoices WHERE id=$1", [operation.invoice_id])).rows[0].fiscal_identity).toMatchObject({ environment: "homologacion", pointOfSale: f.point });
      throw new Error("Respuesta perdida después de autorizar");
    });
    await expect(emitirFactura(f.data)).rejects.toThrow("Respuesta perdida");
    expect((await pool!.query("SELECT stage FROM billing_operations WHERE operation_id=$1", [f.op])).rows[0].stage).toBe("uncertain");
    mocks.consult.mockResolvedValueOnce(authorization);
    const result = await emitirFactura(f.data);
    expect(result.cae).toBe(authorization.cae); expect(mocks.authorize).toHaveBeenCalledTimes(1); expect(mocks.consult).toHaveBeenCalledTimes(1);
    expect((await pool!.query("SELECT id FROM sales_invoices WHERE punto_venta=$1", [f.point])).rows).toHaveLength(1);
    expect((await request(`/api/billing/reservations/${f.reservation}/pending-operation`)).body.pending.attempt.invoiceRequest.creditOperationId).toBe(f.op);
  }));

  it("doble clic y reintento producen una sola factura", async () => fixture(async f => {
    mocks.authorize.mockImplementationOnce(async () => { await new Promise(resolve => setTimeout(resolve, 40)); return authorization; });
    const results = await Promise.allSettled([emitirFactura(f.data), emitirFactura(f.data)]);
    expect(results.some(result => result.status === "fulfilled")).toBe(true);
    await emitirFactura(f.data);
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect((await pool!.query("SELECT id FROM sales_invoices WHERE punto_venta=$1", [f.point])).rows).toHaveLength(1);
  }));

  it("no reutiliza la operación con otros datos ni con otro ambiente", async () => fixture(async f => {
    await emitirFactura(f.data);
    await expect(emitirFactura({ ...f.data, requestSnapshot: { ...f.request, cliente: { razonSocial: "Otro" } } })).rejects.toMatchObject({ code: "BILLING_OPERATION_MISMATCH" });
    mocks.environment = "produccion";
    await expect(emitirFactura(f.data)).rejects.toMatchObject({ code: "BILLING_IDENTITY_CHANGED" });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
  }));

  it("la corrección de un intento que no salió a ARCA es explícita y no emite ni cobra", async () => fixture(async f => {
    await expect(emitirFactura({ ...f.data, puntoVentaOverride: f.point + 1 })).rejects.toThrow();
    const status = await request(`/api/billing/reservations/${f.reservation}/operations/${f.op}/reception-status`);
    expect(status.body.safeToCorrect).toBe(true);
    expect((await request(`/api/billing/reservations/${f.reservation}/operations/${f.op}/correct-reception`, "POST")).body.corrected).toBe(true);
    expect(mocks.authorize).not.toHaveBeenCalled(); expect(mocks.consult).not.toHaveBeenCalled();
    expect((await request(`/api/billing/reservations/${f.reservation}/pending-operation`)).body.pending).toBeNull();
  }));

  it("un rechazo confirmado solo se corrige después de consultar ARCA y conserva evidencia", async () => fixture(async f => {
    mocks.authorize.mockRejectedValueOnce(Object.assign(new Error("Rechazo confirmado"), { code: "ARCA_AUTHORIZATION_REJECTED", statusCode: 400 }));
    await expect(emitirFactura(f.data)).rejects.toThrow("Rechazo confirmado");
    await expect(emitirFactura(f.data)).rejects.toMatchObject({ code: "BILLING_CORRECTION_REQUIRED" });
    const corrected = await request(`/api/billing/reservations/${f.reservation}/operations/${f.op}/correct-reception`, "POST");
    expect(corrected.status, JSON.stringify(corrected.body)).toBe(200); expect(mocks.consult).toHaveBeenCalledTimes(1); expect(mocks.authorize).toHaveBeenCalledTimes(1);
    const journal = (await pool!.query("SELECT * FROM billing_operations WHERE operation_id=$1", [f.op])).rows[0];
    expect(journal.stage).toBe("corrected"); expect(journal.request_snapshot.discardedDraft.estado).toBe("autorizacion_pendiente");
    expect((await pool!.query("SELECT id FROM sales_invoices WHERE punto_venta=$1", [f.point])).rows).toHaveLength(0);
  }));

  it("no descarta incertidumbre, autorización confirmada ni un intento histórico desconocido", async () => fixture(async f => {
    mocks.authorize.mockRejectedValueOnce(new Error("Timeout")); await expect(emitirFactura(f.data)).rejects.toThrow();
    expect((await request(`/api/billing/reservations/${f.reservation}/operations/${f.op}/correct-reception`, "POST")).status).toBe(409);
    expect((await request(`/api/billing/reservations/${f.reservation}/operations/${randomUUID()}/reception-status`)).body.safeToCorrect).toBe(false);
    expect(mocks.consult).not.toHaveBeenCalled();
  }));

  it("si la verificación encuentra un CAE coincidente, recupera la factura y conserva el intento", async () => fixture(async f => {
    mocks.authorize.mockRejectedValueOnce(Object.assign(new Error("Rechazo informado"), { code: "ARCA_AUTHORIZATION_REJECTED", statusCode: 400 }));
    await expect(emitirFactura(f.data)).rejects.toThrow();
    const original = (await pool!.query("SELECT invoice_id FROM billing_operations WHERE operation_id=$1", [f.op])).rows[0].invoice_id;
    mocks.consult.mockResolvedValueOnce(authorization);
    const result = await request(`/api/billing/reservations/${f.reservation}/operations/${f.op}/correct-reception`, "POST");
    expect(result.status).toBe(200); expect(result.body).toMatchObject({ recovered: true });
    expect((await pool!.query("SELECT id,estado,cae FROM sales_invoices WHERE punto_venta=$1", [f.point])).rows).toEqual([{ id: original, estado: "emitida", cae: authorization.cae }]);
    expect((await pool!.query("SELECT stage FROM billing_operations WHERE operation_id=$1", [f.op])).rows[0].stage).toBe("authorized");
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
  }));

  it("una respuesta de consulta contradictoria conserva borrador y operación", async () => fixture(async f => {
    mocks.authorize.mockRejectedValueOnce(Object.assign(new Error("Rechazo informado"), { code: "ARCA_AUTHORIZATION_REJECTED", statusCode: 400 }));
    await expect(emitirFactura(f.data)).rejects.toThrow();
    mocks.consult.mockRejectedValueOnce(new Error("ARCA: el comprobante consultado no coincide"));
    expect((await request(`/api/billing/reservations/${f.reservation}/operations/${f.op}/correct-reception`, "POST")).status).toBe(502);
    expect((await pool!.query("SELECT estado FROM sales_invoices WHERE punto_venta=$1", [f.point])).rows).toEqual([{ estado: "autorizacion_pendiente" }]);
    expect((await pool!.query("SELECT stage FROM billing_operations WHERE operation_id=$1", [f.op])).rows[0].stage).toBe("rejected");
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
  }));
});
