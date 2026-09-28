/**
 * POST /api/purchase-invoices no validaba el tipo de comprobante contra la
 * condición IVA del proveedor — se podía cargar una Factura A de un
 * proveedor Monotributo, algo que AFIP nunca permite (Monotributo solo tiene
 * habilitada la C; la letra A discrimina IVA y solo puede emitirla un
 * Responsable Inscripto). A propósito NO se bloquean los casos ambiguos: un
 * proveedor cargado como Responsable Inscripto o Exento puede legítimamente
 * emitir A, B o C según el concepto real facturado (confirmado con el
 * usuario, ver purchase-invoices.condicion-iva.test.tsx) — solo se bloquean
 * las combinaciones imposibles bajo cualquier interpretación.
 */

import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: (_roles: string[]) => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let server: http.Server;
let baseUrl: string;

async function request(method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}

async function makeSupplier(condicionIva: string): Promise<number> {
  const suffix = randomUUID();
  const result = await pool!.query<{ id: number }>(
    "INSERT INTO accounting_suppliers (razon_social, cuit, condicion_iva) VALUES ($1, $2, $3) RETURNING id",
    [`Proveedor ${condicionIva} ${suffix}`, `30${suffix.replaceAll("-", "").slice(0, 9)}`, condicionIva],
  );
  return result.rows[0].id;
}

function invoicePayload(supplierId: number, tipoComprobante: string) {
  return {
    tipoComprobante, supplierId,
    numeroComprobante: String(10000000 + Math.floor(Math.random() * 89999999)),
    fechaEmision: "2026-09-19", periodo: "09/2026", condicionPago: "cuenta_corriente",
    montoNeto: "100.00", montoIva21: tipoComprobante.endsWith("-A") ? "21.00" : "0", montoTotal: tipoComprobante.endsWith("-A") ? "121.00" : "100.00",
  };
}

suite("PostgreSQL real: comprobante de Compras vs condición IVA del proveedor", () => {
  beforeAll(async () => {
    const { registerRoutes } = await import("../routes");
    const app = express();
    app.use(express.json());
    server = http.createServer(app);
    await registerRoutes(server, app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Sin puerto de prueba");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool?.end();
  });

  it("un proveedor Monotributo no puede emitir Factura A", async () => {
    if (!pool) return;
    const supplierId = await makeSupplier("Monotributo");
    const res = await request("POST", "/api/purchase-invoices", invoicePayload(supplierId, "FACT-A"));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Monotributo/);
    await pool.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplierId]);
  });

  it("un proveedor Monotributo no puede emitir Factura B (solo tiene habilitada la C)", async () => {
    if (!pool) return;
    const supplierId = await makeSupplier("Monotributo");
    const res = await request("POST", "/api/purchase-invoices", invoicePayload(supplierId, "FACT-B"));
    expect(res.status).toBe(400);
    await pool.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplierId]);
  });

  it("un proveedor Monotributo sí puede emitir Factura C", async () => {
    if (!pool) return;
    const supplierId = await makeSupplier("Monotributo");
    const created = await request("POST", "/api/purchase-invoices", invoicePayload(supplierId, "FACT-C"));
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    await pool.query("DELETE FROM purchase_invoices WHERE id = $1", [created.body.id]);
    await pool.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplierId]);
  });

  it("un proveedor Exento no puede emitir Factura A (discrimina IVA, requiere ser Responsable Inscripto)", async () => {
    if (!pool) return;
    const supplierId = await makeSupplier("Exento");
    const res = await request("POST", "/api/purchase-invoices", invoicePayload(supplierId, "FACT-A"));
    expect(res.status).toBe(400);
    await pool.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplierId]);
  });

  it("un proveedor Exento sí puede emitir Factura B (caso ambiguo, no se bloquea)", async () => {
    if (!pool) return;
    const supplierId = await makeSupplier("Exento");
    const created = await request("POST", "/api/purchase-invoices", invoicePayload(supplierId, "FACT-B"));
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    await pool.query("DELETE FROM purchase_invoices WHERE id = $1", [created.body.id]);
    await pool.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplierId]);
  });

  it("un proveedor Responsable Inscripto sí puede emitir Factura A y Factura B", async () => {
    if (!pool) return;
    const supplierId = await makeSupplier("Responsable Inscripto");
    const createdA = await request("POST", "/api/purchase-invoices", invoicePayload(supplierId, "FACT-A"));
    expect(createdA.status, JSON.stringify(createdA.body)).toBe(201);
    const createdB = await request("POST", "/api/purchase-invoices", invoicePayload(supplierId, "FACT-B"));
    expect(createdB.status, JSON.stringify(createdB.body)).toBe(201);
    await pool.query("DELETE FROM purchase_invoices WHERE id = ANY($1::int[])", [[createdA.body.id, createdB.body.id]]);
    await pool.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplierId]);
  });
});
