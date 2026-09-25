/**
 * Pago automático al cargar una factura de compra: si se elige una forma de
 * pago real (no Cuenta Corriente), se genera la Orden de Pago de esa sola
 * factura en la misma transacción que la crea, queda "pagado" al toque y
 * con su asiento contable real — en vez de quedar pendiente hasta una OP
 * manual aparte (ver server/paymentOrder.ts, usado tanto acá como por
 * POST /api/payment-orders, que ahora corre dentro de una transacción).
 *
 * Las Notas de Crédito quedan afuera del pago automático: reducen lo que se
 * le debe al proveedor, no tiene sentido "pagarlas" solas.
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
  return { status: response.status, body: (await response.json()) as any };
}

async function makeSupplier(suffix: string) {
  const res = await pool!.query<{ id: number }>(
    "INSERT INTO accounting_suppliers (razon_social, cuit, condicion_iva) VALUES ($1, $2, 'responsable_inscripto') RETURNING id",
    [`Proveedor autopago ${suffix}`, `30${suffix.replaceAll("-", "").slice(0, 9)}`],
  );
  return res.rows[0].id;
}

async function cleanupInvoice(invoiceId?: number) {
  if (!invoiceId) return;
  const opItems = await pool!.query<{ payment_order_id: number }>(
    "SELECT payment_order_id FROM payment_order_items WHERE invoice_id = $1", [invoiceId],
  );
  for (const { payment_order_id } of opItems.rows) {
    const op = await pool!.query<{ asiento_id: number | null }>(
      "SELECT asiento_id FROM payment_orders WHERE id = $1", [payment_order_id],
    );
    await pool!.query("DELETE FROM payment_order_items WHERE payment_order_id = $1", [payment_order_id]);
    await pool!.query("DELETE FROM payment_orders WHERE id = $1", [payment_order_id]);
    if (op.rows[0]?.asiento_id) {
      await pool!.query("DELETE FROM accounting_entry_lines WHERE entry_id = $1", [op.rows[0].asiento_id]);
      await pool!.query("DELETE FROM accounting_entries WHERE id = $1", [op.rows[0].asiento_id]);
    }
  }
  const inv = await pool!.query<{ asiento_id: number | null }>(
    "SELECT asiento_id FROM purchase_invoices WHERE id = $1", [invoiceId],
  );
  if (inv.rows[0]?.asiento_id) {
    await pool!.query("DELETE FROM accounting_entry_lines WHERE entry_id = $1", [inv.rows[0].asiento_id]);
    await pool!.query("DELETE FROM accounting_entries WHERE id = $1", [inv.rows[0].asiento_id]);
  }
  await pool!.query("DELETE FROM purchase_invoices WHERE id = $1", [invoiceId]);
}

suite("PostgreSQL real: pago automático al cargar la factura de Compras", () => {
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

  it("con formaPago=efectivo la factura queda pagada de una, con OP y asiento reales", async () => {
    if (!pool) return;
    const suffix = randomUUID();
    const supplierId = await makeSupplier(suffix);
    let invoiceId: number | undefined;
    try {
      const created = await request("POST", "/api/purchase-invoices", {
        tipoComprobante: "FACT-A", supplierId,
        numeroComprobante: `AUTOPAGO-${suffix}`, fechaEmision: "2026-09-23",
        montoNeto: "100.00", montoIva21: "21.00", formaPago: "efectivo",
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      invoiceId = Number(created.body.id);
      expect(created.body.estado).toBe("pagado");
      expect(created.body.orden_pago_id).toBeTruthy();

      const opItem = await pool.query(
        "SELECT payment_order_id, importe_cancelado FROM payment_order_items WHERE invoice_id = $1", [invoiceId],
      );
      expect(opItem.rows).toHaveLength(1);
      expect(opItem.rows[0].importe_cancelado).toBe("121.00");

      const op = await pool.query(
        "SELECT forma_pago, efectivo, dep_bancario, total_facturas, total_abonado, observaciones, asiento_id FROM payment_orders WHERE id = $1",
        [opItem.rows[0].payment_order_id],
      );
      expect(op.rows[0]).toMatchObject({
        forma_pago: "efectivo", efectivo: "121.00", dep_bancario: "0.00", total_facturas: "121.00", total_abonado: "121.00",
      });
      expect(op.rows[0].asiento_id).toBeTruthy();

      const lines = await pool.query<{ codigo: string; debe: string; haber: string }>(
        `SELECT aa.codigo, ael.debe, ael.haber FROM accounting_entry_lines ael
         JOIN accounting_accounts aa ON aa.id = ael.account_id
         WHERE ael.entry_id = $1`, [op.rows[0].asiento_id],
      );
      expect(lines.rows).toEqual(expect.arrayContaining([
        { codigo: "2.1.1.01", debe: "121.00", haber: "0.00" },
        { codigo: "1.1.1.01", debe: "0.00", haber: "121.00" },
      ]));
    } finally {
      await cleanupInvoice(invoiceId);
      await pool.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplierId]);
    }
  });

  it("sin formaPago (o cuenta_corriente) la factura queda pendiente, como hoy", async () => {
    if (!pool) return;
    const suffix = randomUUID();
    const supplierId = await makeSupplier(suffix);
    let invoiceId: number | undefined;
    try {
      const created = await request("POST", "/api/purchase-invoices", {
        tipoComprobante: "FACT-A", supplierId,
        numeroComprobante: `PENDIENTE-${suffix}`, fechaEmision: "2026-09-23",
        montoNeto: "50.00", montoIva21: "10.50",
      });
      expect(created.status).toBe(201);
      invoiceId = Number(created.body.id);
      expect(created.body.estado).toBe("pendiente");
      expect(created.body.orden_pago_id).toBeFalsy();
      expect((await pool.query("SELECT id FROM payment_order_items WHERE invoice_id = $1", [invoiceId])).rowCount).toBe(0);
    } finally {
      await cleanupInvoice(invoiceId);
      await pool.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplierId]);
    }
  });

  it("una Nota de Crédito ignora formaPago y sigue pendiente en cuenta corriente", async () => {
    if (!pool) return;
    const suffix = randomUUID();
    const supplierId = await makeSupplier(suffix);
    let invoiceId: number | undefined;
    try {
      const created = await request("POST", "/api/purchase-invoices", {
        tipoComprobante: "NC-A", supplierId,
        numeroComprobante: `NC-${suffix}`, fechaEmision: "2026-09-23",
        montoNeto: "30.00", montoIva21: "6.30", formaPago: "efectivo",
      });
      expect(created.status).toBe(201);
      invoiceId = Number(created.body.id);
      expect(created.body.estado).toBe("pendiente");
      expect(created.body.condicion_pago).toBe("cuenta_corriente");
      expect((await pool.query("SELECT id FROM payment_order_items WHERE invoice_id = $1", [invoiceId])).rowCount).toBe(0);
    } finally {
      await cleanupInvoice(invoiceId);
      await pool.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplierId]);
    }
  });

  it("POST /api/payment-orders (OP manual) sigue funcionando para varias facturas juntas, ahora atómico", async () => {
    if (!pool) return;
    const suffix = randomUUID();
    const supplierId = await makeSupplier(suffix);
    let invoiceId: number | undefined;
    let opId: number | undefined;
    try {
      const created = await request("POST", "/api/purchase-invoices", {
        tipoComprobante: "FACT-A", supplierId,
        numeroComprobante: `MANUAL-${suffix}`, fechaEmision: "2026-09-23", montoNeto: "100.00",
      });
      expect(created.status).toBe(201);
      invoiceId = Number(created.body.id);
      expect(created.body.estado).toBe("pendiente");

      const op = await request("POST", "/api/payment-orders", {
        supplierId, facturaIds: [invoiceId], fecha: "2026-09-23", formaPago: "transferencia",
      });
      expect(op.status, JSON.stringify(op.body)).toBe(201);
      opId = Number(op.body.id);
      expect((await pool.query("SELECT estado FROM purchase_invoices WHERE id = $1", [invoiceId])).rows[0].estado).toBe("pagado");
      expect(op.body.asiento_id).toBeTruthy();

      const lines = await pool.query<{ codigo: string; debe: string; haber: string }>(
        `SELECT aa.codigo, ael.debe, ael.haber FROM accounting_entry_lines ael
         JOIN accounting_accounts aa ON aa.id = ael.account_id
         WHERE ael.entry_id = $1`, [op.body.asiento_id],
      );
      expect(lines.rows).toEqual(expect.arrayContaining([
        { codigo: "2.1.1.01", debe: "100.00", haber: "0.00" },
        { codigo: "1.1.1.02", debe: "0.00", haber: "100.00" },
      ]));
    } finally {
      if (opId) {
        const opEntry = await pool.query<{ asiento_id: number | null }>("SELECT asiento_id FROM payment_orders WHERE id = $1", [opId]);
        await pool.query("DELETE FROM payment_order_items WHERE payment_order_id = $1", [opId]);
        await pool.query("DELETE FROM payment_orders WHERE id = $1", [opId]);
        if (opEntry.rows[0]?.asiento_id) {
          await pool.query("DELETE FROM accounting_entry_lines WHERE entry_id = $1", [opEntry.rows[0].asiento_id]);
          await pool.query("DELETE FROM accounting_entries WHERE id = $1", [opEntry.rows[0].asiento_id]);
        }
      }
      await cleanupInvoice(invoiceId);
      await pool.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplierId]);
    }
  });
});
