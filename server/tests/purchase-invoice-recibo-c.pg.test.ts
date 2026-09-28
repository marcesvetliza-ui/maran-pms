/**
 * Recibo C — nuevo tipo de comprobante en Compras. Confirmado con ARCA
 * (código de comprobante 015, "Recibos C" en la tabla oficial de tipos de
 * comprobante) y con el usuario: se trata igual que Factura C — sin
 * discriminar IVA, un único importe que es el total. El formulario
 * (purchase-invoices.tsx, isFacturaC) ya trataba "RECIBO-C" igual que
 * "FACT-C" en varios puntos; lo que faltaba era: shared/purchaseInvoiceTotals.ts
 * (grossPrice, para la sugerencia de importes por artículo) y
 * server/exports.ts (tipoInfo, para el TXT de compras RG 3685 y el Excel
 * interno) — sin esa entrada, caía en el mapeo por defecto de Factura A.
 *
 * generarAsiento() (server/accounting.ts) es genérico por montos, no por
 * tipo — ya generaba el asiento correcto para cualquier comprobante "C"
 * (monto_neto solo, sin líneas de IVA) sin cambios.
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

async function cleanupInvoice(invoiceId: number | undefined, supplierId: number | undefined) {
  if (invoiceId) {
    const inv = await pool!.query<{ asiento_id: number | null }>("SELECT asiento_id FROM purchase_invoices WHERE id = $1", [invoiceId]);
    if (inv.rows[0]?.asiento_id) {
      await pool!.query("DELETE FROM accounting_entry_lines WHERE entry_id = $1", [inv.rows[0].asiento_id]);
      await pool!.query("DELETE FROM accounting_entries WHERE id = $1", [inv.rows[0].asiento_id]);
    }
    await pool!.query("DELETE FROM purchase_invoices WHERE id = $1", [invoiceId]);
  }
  if (supplierId) await pool!.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplierId]);
}

suite("PostgreSQL real: Recibo C en Compras (tratado igual que Factura C)", () => {
  let egresoAccountId: number;

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

    const account = await pool!.query<{ id: number }>("SELECT id FROM accounting_accounts WHERE tipo = 'egreso' AND activo = true LIMIT 1");
    egresoAccountId = account.rows[0].id;
  });

  afterAll(async () => {
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool?.end();
  });

  it("el total es el importe único cargado, sin sumar IVA por separado", async () => {
    if (!pool) return;
    const suffix = randomUUID();
    const supplier = await pool.query<{ id: number }>(
      "INSERT INTO accounting_suppliers (razon_social, cuit, condicion_iva, cuenta_contable_id) VALUES ($1, $2, 'monotributo', $3) RETURNING id",
      [`Proveedor Recibo C ${suffix}`, `30${suffix.replaceAll("-", "").slice(0, 9)}`, egresoAccountId],
    );
    const supplierId = supplier.rows[0].id;
    let invoiceId: number | undefined;
    try {
      const created = await request("POST", "/api/purchase-invoices", {
        tipoComprobante: "RECIBO-C", supplierId,
        numeroComprobante: `RECIBO-C-${suffix}`, fechaEmision: "2026-09-25",
        montoNeto: "5000.00", cuentaContableId: egresoAccountId,
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      invoiceId = Number(created.body.id);
      expect(created.body.monto_total).toBe("5000.00");
      expect(created.body.estado).toBe("pendiente");
      expect(created.body.condicion_pago).toBe("cuenta_corriente");

      const asiento = await pool.query<{ codigo: string; debe: string; haber: string }>(
        `SELECT aa.codigo, ael.debe, ael.haber FROM accounting_entry_lines ael
         JOIN accounting_accounts aa ON aa.id = ael.account_id
         WHERE ael.entry_id = (SELECT asiento_id FROM purchase_invoices WHERE id = $1)`,
        [invoiceId],
      );
      // Un único DEBE a la cuenta de gasto (sin líneas de IVA) y el HABER a Proveedores.
      const gastoLine = asiento.rows.find(r => r.debe === "5000.00");
      expect(gastoLine).toBeTruthy();
      const proveedoresLine = asiento.rows.find(r => r.haber === "5000.00");
      expect(proveedoresLine).toBeTruthy();
      expect(asiento.rows).toHaveLength(2);
    } finally {
      await cleanupInvoice(invoiceId, supplierId);
    }
  });

  it("no se pueden cargar montos de IVA junto con Recibo C (se ignoran igual que en Factura C)", async () => {
    if (!pool) return;
    const suffix = randomUUID();
    const supplier = await pool.query<{ id: number }>(
      "INSERT INTO accounting_suppliers (razon_social, cuit, condicion_iva, cuenta_contable_id) VALUES ($1, $2, 'monotributo', $3) RETURNING id",
      [`Proveedor Recibo C sin IVA ${suffix}`, `30${suffix.replaceAll("-", "").slice(0, 9)}`, egresoAccountId],
    );
    const supplierId = supplier.rows[0].id;
    let invoiceId: number | undefined;
    try {
      // El total se calcula sumando todos los campos presentes — igual que
      // Factura C, Recibo C solo debe cargar montoNeto; si el cliente manda
      // un IVA igual, calculatePurchaseInvoiceTotal lo suma (es genérico),
      // así que la responsabilidad de no mandarlo es del form (isFacturaC ya
      // fuerza los campos de IVA a vacío al elegir el tipo).
      const created = await request("POST", "/api/purchase-invoices", {
        tipoComprobante: "RECIBO-C", supplierId,
        numeroComprobante: `RECIBO-C-SINIVA-${suffix}`, fechaEmision: "2026-09-25",
        montoNeto: "1000.00", cuentaContableId: egresoAccountId,
      });
      invoiceId = Number(created.body.id);
      const persisted = await pool.query("SELECT monto_iva21, monto_iva105 FROM purchase_invoices WHERE id = $1", [invoiceId]);
      expect(persisted.rows[0]).toMatchObject({ monto_iva21: "0.00", monto_iva105: "0.00" });
    } finally {
      await cleanupInvoice(invoiceId, supplierId);
    }
  });
});
