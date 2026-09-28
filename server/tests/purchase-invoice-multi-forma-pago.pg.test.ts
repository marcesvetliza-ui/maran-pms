/**
 * Al cargar una factura de Compras con forma de pago real (no Cuenta
 * Corriente) solo se podía elegir UNA — no se podía combinar, por ejemplo,
 * parte efectivo y parte transferencia en el mismo pago, aunque Ventas sí lo
 * permite. Este test prueba la combinación con Postgres real: que la OP
 * generada reparte el monto correcto en cada columna (efectivo/dep_bancario)
 * y que el asiento contable queda balanceado — transferencia no tiene
 * columna propia en payment_orders, así que su parte solo queda bien
 * acreditada si el asiento la trata como "lo que sobra", no solo cuando es
 * la única forma de pago (ver generarAsientoOP en server/accounting.ts).
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
    [`Proveedor multipago ${suffix}`, `30${suffix.replaceAll("-", "").slice(0, 9)}`],
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

suite("PostgreSQL real: combinar formas de pago al cargar una factura de Compras", () => {
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

  it("parte efectivo + parte transferencia paga el total y el asiento queda balanceado", async () => {
    if (!pool) return;
    const suffix = randomUUID();
    const supplierId = await makeSupplier(suffix);
    let invoiceId: number | undefined;
    try {
      const created = await request("POST", "/api/purchase-invoices", {
        tipoComprobante: "FACT-A", supplierId,
        numeroComprobante: `MULTI-${suffix}`, fechaEmision: "2026-09-23",
        montoNeto: "100.00", montoIva21: "21.00",
        formasPago: [
          { formaPago: "efectivo", monto: "50.00" },
          { formaPago: "transferencia", monto: "71.00" },
        ],
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      invoiceId = Number(created.body.id);
      expect(created.body.estado).toBe("pagado");

      const opItem = await pool.query(
        "SELECT payment_order_id, importe_cancelado FROM payment_order_items WHERE invoice_id = $1", [invoiceId],
      );
      expect(opItem.rows).toHaveLength(1);
      expect(opItem.rows[0].importe_cancelado).toBe("121.00");

      const op = await pool.query(
        "SELECT forma_pago, efectivo, dep_bancario, cheques, total_abonado, asiento_id FROM payment_orders WHERE id = $1",
        [opItem.rows[0].payment_order_id],
      );
      expect(op.rows[0]).toMatchObject({
        efectivo: "50.00", dep_bancario: "0.00", cheques: "0.00", total_abonado: "121.00",
      });
      expect(op.rows[0].forma_pago).toContain("efectivo");
      expect(op.rows[0].forma_pago).toContain("transferencia");

      // El asiento debe quedar balanceado: Debe Proveedores 121, Haber Caja
      // 50 (efectivo) + Haber Banco 71 (transferencia, sin columna propia —
      // tiene que quedar acreditada igual como "resto").
      const lines = await pool.query<{ codigo: string; debe: string; haber: string }>(
        `SELECT aa.codigo, ael.debe, ael.haber FROM accounting_entry_lines ael
         JOIN accounting_accounts aa ON aa.id = ael.account_id
         WHERE ael.entry_id = $1`, [op.rows[0].asiento_id],
      );
      expect(lines.rows).toEqual(expect.arrayContaining([
        { codigo: "2.1.1.01", debe: "121.00", haber: "0.00" },
        { codigo: "1.1.1.01", debe: "0.00", haber: "50.00" },
        { codigo: "1.1.1.02", debe: "0.00", haber: "71.00" },
      ]));
      const totalDebe = lines.rows.reduce((s, l) => s + Number(l.debe), 0);
      const totalHaber = lines.rows.reduce((s, l) => s + Number(l.haber), 0);
      expect(totalDebe).toBeCloseTo(totalHaber, 2);
    } finally {
      await cleanupInvoice(invoiceId);
      await pool.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplierId]);
    }
  });

  it("rechaza una fila de forma de pago con método inválido o monto inválido", async () => {
    if (!pool) return;
    const suffix = randomUUID();
    const supplierId = await makeSupplier(suffix);
    try {
      const rejected = await request("POST", "/api/purchase-invoices", {
        tipoComprobante: "FACT-A", supplierId,
        numeroComprobante: `INVALIDO-${suffix}`, fechaEmision: "2026-09-23",
        montoNeto: "100.00",
        formasPago: [{ formaPago: "bitcoin", monto: "100.00" }],
      });
      expect(rejected.status).toBe(400);
      expect((await pool.query("SELECT id FROM purchase_invoices WHERE numero_comprobante = $1", [`INVALIDO-${suffix}`])).rowCount).toBe(0);
    } finally {
      await pool.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplierId]);
    }
  });
});
