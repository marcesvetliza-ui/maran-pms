/** Independent review reproducers. Synthetic Unix-socket DB only; no ARCA calls. */
import { afterAll, afterEach, expect, it, vi } from "vitest";

const control = vi.hoisted(() => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  return { arrivals: 0, gate, release };
});
vi.mock("../db", async () => {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ host: "/tmp/folio-funding-isolated/socket", port: 55439,
    user: "runner", password: "", database: "folio_funding_synthetic", max: 2,
    connectionTimeoutMillis: 250, options: "-c search_path=funding_demo,public" });
  return { pool, db: { execute: async () => {
    control.arrivals++;
    if (control.arrivals === 2) control.release();
    await control.gate;
    return pool.query("SELECT 1 AS ultimo_numero");
  } } };
});
vi.mock("../billing/billingConfig", () => ({ getBillingConfig: async () => ({
  arcaAmbiente: "homologacion", arcaCuit: "20111111112", puntoVentaHomolog: 99,
  arcaCert: "synthetic", arcaKey: "synthetic",
}) }));
vi.mock("../billing/wsaaClient", () => ({ getTokenAuth: async () => ({ token: "synthetic", sign: "synthetic" }) }));
vi.mock("../db-storage", () => ({ getArgentinaToday: () => "2026-10-15" }));
vi.mock("../migrate", () => ({ assertFinancialSchemaReady: async () => {} }));
const nativeFetch = global.fetch;
afterEach(() => { global.fetch = nativeFetch; });
afterAll(async () => { const { pool } = await import("../db"); await pool.end(); });

it("REPRO: a standard FECompConsultar ResultGet response is not recognized by the recovery parser", async () => {
  const { feCompConsultar } = await import("../billing/wsfevClient");
  global.fetch = vi.fn(async () => new Response(`<soap:Envelope><soap:Body><FECompConsultarResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompConsultarResult><ResultGet><Concepto>2</Concepto><DocTipo>96</DocTipo><DocNro>30111222</DocNro><CbteDesde>1</CbteDesde><CbteHasta>1</CbteHasta><CbteFch>20261015</CbteFch><ImpTotal>95000.00</ImpTotal><MonId>PES</MonId><MonCotiz>1</MonCotiz><Resultado>A</Resultado><CodAutorizacion>12345678901234</CodAutorizacion><EmisionTipo>CAE</EmisionTipo><FchVto>20261025</FchVto></ResultGet></FECompConsultarResult></FECompConsultarResponse></soap:Body></soap:Envelope>`, { status: 200 })) as any;
  await expect(feCompConsultar({ tipo: "FB", puntoVenta: 99, numero: 1, cuitEmisor: "20111111112", token: "synthetic", sign: "synthetic" },
    "homologacion", { total: 95000, fecha: "20261015", docTipo: 96, docNro: "30111222" }))
    .rejects.toThrow(/estado verificable/);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

it("REPRO: two legacy emitters can exhaust their own pool while retaining series-lock connections", async () => {
  global.fetch = vi.fn(async () => new Response("<Envelope><CbteNro>0</CbteNro></Envelope>", { status: 200 })) as any;
  const { emitirFactura } = await import("../billing/invoiceService");
  const data = { tipoComprobante: "FB" as const, cliente: { razonSocial: "Sintético", condicionIva: "consumidor_final" },
    items: [{ descripcion: "Servicio", cantidad: 1, precioUnitario: 121, alicuotaIva: "21" as const, subtotalNeto: 100, subtotal: 121 }] };
  const results = await Promise.allSettled([emitirFactura({ ...data, puntoVentaOverride: 90001 }), emitirFactura({ ...data, puntoVentaOverride: 90002 })]);
  expect(control.arrivals).toBe(2);
  const errors = results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map(r => String(r.reason));
  expect(errors.some(message => /timeout exceeded when trying to connect/.test(message))).toBe(true);
  const { pool } = await import("../db");
  expect(pool.waitingCount).toBe(0);
}, 5000);
