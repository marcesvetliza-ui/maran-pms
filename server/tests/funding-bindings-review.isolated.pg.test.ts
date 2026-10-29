import { lastAuthorizedForRequest } from "./helpers/wsfeLastAuthorizedFixture";
/** Regression tests derived from Codex's independent reproducers.
 * Real PostgreSQL max=2, real legacy emitter, billing config and WSAA cache.
 * Only financial readiness and the remote SOAP service are substituted. */
import { beforeAll, afterAll, afterEach, expect, it, vi } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../../shared/schema";
import { authorizationFixture } from "./helpers/wsfeConsultationFixture";
import { configuredArcaTransport } from "../billing/funding/operational/arcaTransport";

vi.mock("../db", async () => {
  const { default: pg } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const tables = await import("../../shared/schema");
  const pool = new pg.Pool({
    host: "/tmp/folio-funding-isolated/socket", port: 55439, user: "runner", password: "",
    database: "folio_funding_synthetic", max: 2, connectionTimeoutMillis: 250,
    options: "-c search_path=funding_review,public",
  });
  return { pool, db: drizzle(pool, { schema: tables }) };
});
vi.mock("../db-storage", () => ({ getArgentinaToday: () => "2026-10-15" }));
vi.mock("../migrate", () => ({ assertFinancialSchemaReady: () => {} }));
const { pool, db } = await import("../db");
const { emitirFactura } = await import("../billing/invoiceService");
const nativeFetch = global.fetch;
const issuer = "20111111112";
const data = {
  tipoComprobante: "FB" as const,
  cliente: { razonSocial: "Sintético", condicionIva: "consumidor_final" },
  items: [{ descripcion: "Servicio", cantidad: 1, precioUnitario: 121,
    alicuotaIva: "21" as const, subtotalNeto: 100, subtotal: 121 }],
};
const last = new Map<number, number>();
let authorized: number[] = [];
let barrier: (() => Promise<void>) | undefined;
beforeAll(async () => {
  await pool.query("DROP SCHEMA IF EXISTS funding_review CASCADE; CREATE SCHEMA funding_review");
  for (const table of [schema.salesInvoices, schema.billingConfig, schema.invoiceCounters]) {
    const config = getTableConfig(table);
    const columns = config.columns.map(c => `"${c.name}" ${c.getSQLType()}${c.primary ? " PRIMARY KEY" : ""}`);
    await pool.query(`CREATE TABLE funding_review."${config.name}" (${columns.join(",")})`);
  }
  await pool.query(`CREATE UNIQUE INDEX ON funding_review.invoice_counters(tipo_comprobante,punto_venta);
    CREATE UNIQUE INDEX ON funding_review.sales_invoices(tipo_comprobante,punto_venta,numero)`);
  await db.insert(schema.billingConfig).values({
    id: 1, razonSocial: "Sintético", cuit: issuer, arcaAmbiente: "homologacion",
    arcaCuit: issuer, puntoVentaHomolog: 99, arcaCert: "synthetic", arcaKey: "synthetic",
    arcaTaToken: "synthetic", arcaTaSign: "synthetic", arcaTaAmbiente: "homologacion",
    arcaTaExpiry: new Date(Date.now() + 12 * 60 * 60 * 1000),
  });
});
afterEach(() => {
  global.fetch = nativeFetch; vi.restoreAllMocks(); barrier = undefined;
});
afterAll(async () => {
  await pool.query("DROP SCHEMA funding_review CASCADE");
  await pool.end();
});
function soap() {
  authorized = [];
  global.fetch = vi.fn(async (_url, options) => {
    const body = String(options?.body);
    const pv = Number(body.match(/<ar:PtoVta>(\d+)/)?.[1]);
    if (String((options?.headers as any)?.SOAPAction).includes("FECompUltimoAutorizado")) {
      await barrier?.();
      return new Response(lastAuthorizedForRequest(last.get(pv) ?? 0, options));
    }
    // A missing DB cache would try WSAA with invalid synthetic certs and fail.
    expect(body).toContain("<ar:FECAESolicitar>");
    const number = Number(body.match(/<ar:CbteDesde>(\d+)/)?.[1]);
    expect(number).toBe((last.get(pv) ?? 0) + 1);
    last.set(pv, number); authorized.push(pv);
    return new Response(authorizationFixture(pv,number));
  }) as any;
}

it("R4: distinct legacy series complete with every pool slot occupied, including persisted WSAA and draft commits", async () => {
  soap();
  let arrivals = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  barrier = async () => { if (++arrivals === 2) release(); await gate; };
  const connects = vi.spyOn(pool, "connect");
  const results = await Promise.all([
    emitirFactura({ ...data, puntoVentaOverride: 90001, spaAccountId: "synthetic-review-one" }),
    emitirFactura({ ...data, puntoVentaOverride: 90002, spaAccountId: "synthetic-review-two" }),
  ]);
  expect(arrivals).toBe(2);
  expect(results.map(r => r.estado)).toEqual(["emitida", "emitida"]);
  expect(results.every(r => r.cae === "12345678901234" && r.numero === 1)).toBe(true);
  // Two configuration reads + two leases. No nested borrow for WSAA/SQL.
  expect(connects).toHaveBeenCalledTimes(4);
  expect(pool.totalCount).toBe(2); expect(pool.waitingCount).toBe(0); expect(pool.idleCount).toBe(2);
  expect(authorized.sort()).toEqual([90001, 90002]);
}, 5000);

it("R4: same-series contenders fail fast without authorizing, and the released series can emit its next number", async () => {
  soap();
  let entered!: () => void, release!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  barrier = async () => { entered(); await gate; };
  const first = emitirFactura({ ...data, puntoVentaOverride: 90003 });
  await reached;
  try {
    await expect(emitirFactura({ ...data, puntoVentaOverride: 90003 })).rejects.toMatchObject({ statusCode: 409 });
    expect(pool.waitingCount).toBe(0);
  } finally { release(); }
  expect((await first).numero).toBe(1);
  barrier = undefined;
  expect((await emitirFactura({ ...data, puntoVentaOverride: 90003 })).numero).toBe(2);
  expect(authorized).toEqual([90003, 90003]);
  expect(pool.idleCount).toBe(2);
}, 5000);

it("R4: thrown authorization retains its draft but releases the connection and series lock", async () => {
  soap();
  const original = global.fetch;
  global.fetch = vi.fn(async (url, options) => {
    if (String((options?.headers as any)?.SOAPAction).includes("FECAESolicitar"))
      throw new Error("synthetic post-send timeout");
    return original(url, options);
  }) as any;
  await expect(emitirFactura({ ...data, puntoVentaOverride: 90004, spaAccountId: "synthetic-timeout" }))
    .rejects.toThrow("synthetic post-send timeout");
  const row = (await pool.query("SELECT * FROM sales_invoices WHERE punto_venta=90004")).rows[0];
  expect(row.estado).toBe("autorizacion_pendiente");
  expect(row.reconciliation_error).toContain("synthetic post-send timeout");
  // Another session can take the same lock, proving the failed owner released it.
  const c = await pool.connect();
  try {
    expect((await c.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked",
      [`funding-fiscal:homologacion:${issuer}:FB:90004`])).rows[0].locked).toBe(true);
  } finally { c.release(); }
  expect(pool.waitingCount).toBe(0);
});

it("R4: concrete funding numbering reads config and the real WSAA cache on the supplied client, even when the pool is full",async()=>{
  soap();
  const clients=await Promise.all([pool.connect(),pool.connect()]);
  const connects=vi.spyOn(pool,"connect");
  const identity={environment:"homologacion" as const,issuer,tipo:"FB" as const,puntoVenta:99,fecha:"2026-10-15",snapshot:{}};
  try {
    const transport=configuredArcaTransport();
    // Number preparation now commits its own auth transaction before financial
    // numbering; run sequentially here because both use the same WSAA issuer.
    const numbers=[];
    for(const c of clients) numbers.push(await (await transport.prepareNumbering(identity,c))());
    expect(numbers).toEqual([0,0]);
    expect(connects).not.toHaveBeenCalled();
  } finally {clients.forEach(c=>c.release());}
  expect(pool.idleCount).toBe(2);
});
