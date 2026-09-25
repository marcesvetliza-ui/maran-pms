/**
 * Pago parcial al cargar una factura de compra: se puede pagar una parte
 * con una forma de pago real y dejar el resto con saldo pendiente en
 * cuenta corriente (estado "parcial"), en vez de todo-o-nada. Ese saldo se
 * puede terminar de cancelar después con la Orden de Pago manual, igual
 * que una factura común. Ver server/paymentOrder.ts.
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
    [`Proveedor parcial ${suffix}`, `30${suffix.replaceAll("-", "").slice(0, 9)}`],
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

suite("PostgreSQL real: pago parcial al cargar la factura de Compras", () => {
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

  it("mitad transferencia, mitad cuenta corriente: queda parcial con el saldo correcto", async () => {
    if (!pool) return;
    const suffix = randomUUID();
    const supplierId = await makeSupplier(suffix);
    let invoiceId: number | undefined;
    try {
      const created = await request("POST", "/api/purchase-invoices", {
        tipoComprobante: "FACT-A", supplierId,
        numeroComprobante: `PARCIAL-${suffix}`, fechaEmision: "2026-09-23",
        montoNeto: "100.00", montoIva21: "21.00",
        formaPago: "transferencia", montoPagadoAhora: "60.50",
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      invoiceId = Number(created.body.id);
      expect(created.body.estado).toBe("parcial");
      expect(created.body.saldo_pendiente).toBe("60.50");

      const opItem = await pool.query(
        "SELECT importe_cancelado FROM payment_order_items WHERE invoice_id = $1", [invoiceId],
      );
      expect(opItem.rows).toHaveLength(1);
      expect(opItem.rows[0].importe_cancelado).toBe("60.50");

      // Aparece como pendiente en la cuenta corriente del proveedor, por el saldo (no el total).
      const cc = await request("GET", `/api/accounting-suppliers/${supplierId}/cuenta-corriente`);
      expect(cc.body.facturasPendientes.map((f: any) => f.id)).toContain(invoiceId);
      const suppliers = await request("GET", "/api/accounting-suppliers");
      const row = suppliers.body.find((s: any) => s.id === supplierId);
      expect(Number(row.saldo_cc)).toBeCloseTo(60.5, 2);
    } finally {
      await cleanupInvoice(invoiceId);
      await pool.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplierId]);
    }
  });

  it("el saldo restante de una factura parcial se puede terminar de cancelar con una OP manual", async () => {
    if (!pool) return;
    const suffix = randomUUID();
    const supplierId = await makeSupplier(suffix);
    let invoiceId: number | undefined;
    try {
      const created = await request("POST", "/api/purchase-invoices", {
        tipoComprobante: "FACT-A", supplierId,
        numeroComprobante: `RESTO-${suffix}`, fechaEmision: "2026-09-23",
        montoNeto: "100.00", formaPago: "efectivo", montoPagadoAhora: "40.00",
      });
      expect(created.status).toBe(201);
      invoiceId = Number(created.body.id);
      expect(created.body.estado).toBe("parcial");

      const op = await request("POST", "/api/payment-orders", {
        supplierId, facturaIds: [invoiceId], fecha: "2026-09-23", formaPago: "transferencia",
      });
      expect(op.status, JSON.stringify(op.body)).toBe(201);

      const invoiceRow = await pool.query("SELECT estado, saldo_pendiente FROM purchase_invoices WHERE id = $1", [invoiceId]);
      expect(invoiceRow.rows[0]).toMatchObject({ estado: "pagado", saldo_pendiente: "0.00" });

      const items = await pool.query("SELECT importe_cancelado FROM payment_order_items WHERE invoice_id = $1 ORDER BY id", [invoiceId]);
      expect(items.rows).toHaveLength(2);
      expect(items.rows[1].importe_cancelado).toBe("60.00");
    } finally {
      await cleanupInvoice(invoiceId);
      await pool.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplierId]);
    }
  });

  it("rechaza un monto a pagar ahora mayor al total del comprobante", async () => {
    if (!pool) return;
    const suffix = randomUUID();
    const supplierId = await makeSupplier(suffix);
    try {
      const created = await request("POST", "/api/purchase-invoices", {
        tipoComprobante: "FACT-A", supplierId,
        numeroComprobante: `EXCESO-${suffix}`, fechaEmision: "2026-09-23",
        montoNeto: "100.00", formaPago: "efectivo", montoPagadoAhora: "150.00",
      });
      expect(created.status).toBe(400);
      expect((await pool.query("SELECT id FROM purchase_invoices WHERE numero_comprobante = $1", [`EXCESO-${suffix}`])).rowCount).toBe(0);
    } finally {
      await pool.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplierId]);
    }
  });

  it("rechaza un monto a pagar ahora de $0 o negativo", async () => {
    if (!pool) return;
    const suffix = randomUUID();
    const supplierId = await makeSupplier(suffix);
    try {
      const created = await request("POST", "/api/purchase-invoices", {
        tipoComprobante: "FACT-A", supplierId,
        numeroComprobante: `CERO-${suffix}`, fechaEmision: "2026-09-23",
        montoNeto: "100.00", formaPago: "efectivo", montoPagadoAhora: "0",
      });
      expect(created.status).toBe(400);
    } finally {
      await pool.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplierId]);
    }
  });
});
