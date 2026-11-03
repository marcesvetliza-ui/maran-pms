import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BILLING_OPERATION_SCHEMA_SQL } from "../billing/operationJournal";
import { lastAuthorizedForRequest } from "./helpers/wsfeLastAuthorizedFixture";

// A collision no longer deletes another operation's pending draft, nor adopts
// an unrelated authorized invoice on the strength of a matching number/CAE.
const mocks = vi.hoisted(() => ({ point: 99, authorize: vi.fn(), consult: vi.fn() }));
vi.mock("../billing/billingConfig", () => ({ getBillingConfig: async () => ({ arcaAmbiente: "homologacion", puntoVenta: 1, puntoVentaHomolog: mocks.point, arcaCuit: "30717698130" }) }));
vi.mock("../billing/wsaaClient", () => ({ getTokenAuth: async () => ({ token: "mock", sign: "mock" }) }));
vi.mock("../billing/wsfevClient", () => ({ feCAESolicitar: mocks.authorize, feCompConsultar: mocks.consult }));
const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let emit: typeof import("../billing/invoiceService").emitirFactura;
const originalFetch = global.fetch;
suite("Numeración ocupada: no borrar ni adoptar un comprobante ajeno", () => {
  beforeAll(async () => { await pool!.query(BILLING_OPERATION_SCHEMA_SQL); ({ emitirFactura: emit } = await import("../billing/invoiceService")); });
  beforeEach(() => {
    mocks.authorize.mockReset(); mocks.consult.mockReset();
    global.fetch = vi.fn(async (_url, init) => new Response(lastAuthorizedForRequest(0, init), { status: 200 })) as any;
  });
  afterAll(async () => { global.fetch = originalFetch; await pool?.end(); });
  it.each([
    ["autorizacion_pendiente", null], ["autorizacion_pendiente", "71234567890123"],
    ["emitida", "71234567890123"], ["emitida", "70000000000001"],
  ])("bloquea una nueva intención ante un registro %s / %s", async (state, cae) => {
    const point = mocks.point = 10000 + Math.floor(Math.random() * 70000), operation = randomUUID();
    const original = (await pool!.query("INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,estado,cae,modo_ficticio,payment_id) VALUES('FB',$1,1,'2026-11-03','Otro cliente','Consumidor Final',0,100,$2,$3,false,$4) RETURNING id", [point,state,cae,randomUUID()])).rows[0].id;
    try {
      await expect(emit({ operationId: operation, tipoComprobante: "FB", cliente: { razonSocial: "Cliente nuevo", condicionIva: "Consumidor Final" }, items: [{ descripcion: "Alojamiento", cantidad: 1, precioUnitario: 100, alicuotaIva: "no_gravado", subtotalNeto: 0, subtotal: 100 }], puntoVentaOverride: point })).rejects.toMatchObject({ code: "BILLING_NUMBER_CONFLICT", conflictInvoiceId: original });
      expect(mocks.authorize).not.toHaveBeenCalled(); expect(mocks.consult).not.toHaveBeenCalled();
      expect((await pool!.query("SELECT id,estado,cae FROM sales_invoices WHERE punto_venta=$1",[point])).rows).toEqual([{id:original,estado:state,cae}]);
    } finally {
      await pool!.query("DELETE FROM billing_operations WHERE operation_id=$1",[operation]);
      await pool!.query("DELETE FROM sales_invoices WHERE id=$1",[original]);
      await pool!.query("DELETE FROM invoice_counters WHERE punto_venta=$1",[point]);
    }
  });
});
