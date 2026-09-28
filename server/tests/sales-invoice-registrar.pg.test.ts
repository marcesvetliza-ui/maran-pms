/**
 * "Registrar" un comprobante de venta emitido fuera del sistema (p. ej. una
 * Factura T sin reserva asociada) — POST /api/billing/invoices/registrar.
 * No llama a ARCA ni pide CAE: es copiar a mano lo que ya dice un
 * comprobante hecho afuera, contra un Punto de Venta manual (ver
 * server/billing/routes.ts). Confirmado con el usuario: debe ser un
 * formulario simple, sin tocar el flujo de emisión real existente.
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

function numeroUnico() {
  return String(Math.floor(Math.random() * 900000) + 100000);
}

async function request(method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as any };
}

suite("PostgreSQL real: registrar un comprobante de venta emitido afuera", () => {
  let manualPvNumero: number;
  let electronicoPvNumero: number;

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

    const manual = await pool!.query("SELECT numero FROM pos_configs WHERE tipo = 'manual' AND activo = true LIMIT 1");
    manualPvNumero = manual.rows[0].numero;
    const electronico = await pool!.query("SELECT numero FROM pos_configs WHERE tipo = 'electronico' AND activo = true LIMIT 1");
    electronicoPvNumero = electronico.rows[0].numero;
  });

  afterAll(async () => {
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool?.end();
  });

  it("crea el comprobante sin CAE, en modoFicticio false y estado registrada, contra un PV manual", async () => {
    if (!pool) return;
    const suffix = randomUUID().replace(/-/g, "").slice(0, 6);
    const numero = numeroUnico();
    let invoiceId: number | undefined;
    try {
      const created = await request("POST", "/api/billing/invoices/registrar", {
        tipoComprobante: "FB",
        puntoVenta: manualPvNumero,
        numero,
        fechaEmision: "2026-09-24",
        cliente: { razonSocial: `Cliente Registro ${suffix}`, condicionIva: "Consumidor Final" },
        items: [{ descripcion: "Servicio de hotelería", cantidad: 1, precioUnitario: 1000, subtotal: 1000, alicuotaIva: "21" }],
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      invoiceId = Number(created.body.id);
      expect(created.body.estado).toBe("registrada");
      expect(created.body.cae).toBeNull();
      expect(created.body.modoFicticio).toBe(false);
      expect(created.body.montoTotal).toBe("1000.00");

      const persisted = await pool.query(
        "SELECT tipo_comprobante, punto_venta, numero, cae, estado, monto_neto, monto_iva21 FROM sales_invoices WHERE id = $1",
        [invoiceId],
      );
      expect(persisted.rows[0]).toMatchObject({
        tipo_comprobante: "FB", punto_venta: manualPvNumero, numero: Number(numero), cae: null, estado: "registrada",
      });
      expect(Number(persisted.rows[0].monto_iva21)).toBeCloseTo(173.55, 2);
    } finally {
      if (invoiceId) await pool.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
    }
  });

  it("rechaza un Punto de Venta que no es manual", async () => {
    if (!pool || !electronicoPvNumero) return;
    const suffix = randomUUID().replace(/-/g, "").slice(0, 6);
    const created = await request("POST", "/api/billing/invoices/registrar", {
      tipoComprobante: "FB",
      puntoVenta: electronicoPvNumero,
      numero: numeroUnico(),
      fechaEmision: "2026-09-24",
      cliente: { razonSocial: `Cliente Registro ${suffix}`, condicionIva: "Consumidor Final" },
      items: [{ descripcion: "Servicio", cantidad: 1, precioUnitario: 1000, subtotal: 1000, alicuotaIva: "21" }],
    });
    expect(created.status).toBe(400);
    expect(created.body.error).toMatch(/Punto de Venta/);
  });

  it("rechaza un número de comprobante duplicado para el mismo tipo y Punto de Venta", async () => {
    if (!pool) return;
    const suffix = randomUUID().replace(/-/g, "").slice(0, 6);
    const numero = numeroUnico();
    let invoiceId: number | undefined;
    try {
      const payload = {
        tipoComprobante: "FB",
        puntoVenta: manualPvNumero,
        numero,
        fechaEmision: "2026-09-24",
        cliente: { razonSocial: `Cliente Registro ${suffix}`, condicionIva: "Consumidor Final" },
        items: [{ descripcion: "Servicio", cantidad: 1, precioUnitario: 1000, subtotal: 1000, alicuotaIva: "21" }],
      };
      const first = await request("POST", "/api/billing/invoices/registrar", payload);
      expect(first.status).toBe(201);
      invoiceId = Number(first.body.id);

      const second = await request("POST", "/api/billing/invoices/registrar", payload);
      expect(second.status).toBe(400);
      expect(second.body.error).toMatch(/Ya hay un comprobante registrado/);
    } finally {
      if (invoiceId) await pool.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
    }
  });

  it("una Factura T no discrimina IVA: todo el importe queda como no gravado", async () => {
    if (!pool) return;
    const suffix = randomUUID().replace(/-/g, "").slice(0, 6);
    let invoiceId: number | undefined;
    try {
      const created = await request("POST", "/api/billing/invoices/registrar", {
        tipoComprobante: "FT",
        puntoVenta: manualPvNumero,
        numero: numeroUnico(),
        fechaEmision: "2026-09-24",
        cliente: { razonSocial: `Guest Extranjero ${suffix}`, condicionIva: "Consumidor Final", cuit: "AB123456" },
        items: [{ descripcion: "Alojamiento", cantidad: 1, precioUnitario: 1000, subtotal: 1000, alicuotaIva: "no_gravado" }],
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      invoiceId = Number(created.body.id);
      expect(created.body.montoNoGravado).toBe("1000.00");
      expect(created.body.montoIva21).toBe("0.00");
      expect(created.body.montoTotal).toBe("1000.00");
    } finally {
      if (invoiceId) await pool.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
    }
  });
});
