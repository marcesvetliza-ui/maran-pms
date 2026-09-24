import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verifyFinancialSchema } from "../migrate";

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: (_roles: string[]) => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));

const runWithPg = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;

runWithPg("registros de gasto de Compras", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    await verifyFinancialSchema();
    const { registerRoutes } = await import("../routes");
    const app = express();
    app.use(express.json());
    server = http.createServer(app);
    await registerRoutes(server, app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Sin puerto de prueba");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    await pool?.end();
    const { pool: appPool } = await import("../db");
    await appPool.end();
  });

  async function request(path: string, method = "GET", body?: unknown) {
    const response = await fetch(baseUrl + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  }

  it.each(["RESUMEN-BANCO", "RETENCION"])("registra %s como gasto sin deuda, asiento ni stock", async type => {
    if (!pool) return;
    const suffix = randomUUID().replaceAll("-", "");
    const code = `4.2.1.08.18.${suffix.slice(0, 7)}`;
    const account = await pool.query<{ id: number }>(
      "INSERT INTO accounting_accounts (codigo, nombre, tipo, activo) VALUES ($1, $2, 'egreso', true) RETURNING id",
      [code, "Gasto prueba"],
    );
    const accountId = account.rows[0].id;
    const supplier = await pool.query<{ id: number }>(
      "INSERT INTO accounting_suppliers (razon_social, cuit, condicion_iva, cuenta_contable_id) VALUES ($1, $2, 'responsable_inscripto', $3) RETURNING id",
      [`Emisor ${suffix}`, `30${suffix.slice(0, 9)}`, accountId],
    );
    const supplierId = supplier.rows[0].id;
    let recordId: number | null = null;
    try {
      const before = await request("/api/reports/estado-resultados?periodo=08/2026");
      expect(before.status).toBe(200);
      const initialExpenses = Number(before.body.gastosOperativos.gastosBancarios);
      const payload = {
        tipoComprobante: type, supplierId, numeroComprobante: `G-${suffix.slice(0, 12)}`,
        fechaEmision: "2026-08-19", montoNeto: "127.45", observaciones: "Cargo mensual",
      };
      expect((await request("/api/purchase-invoices", "POST", { ...payload, stockItems: [{ itemId: "inventado" }] })).status).toBe(400);
      const created = await request("/api/purchase-invoices", "POST", {
        ...payload, cuentaContableId: 999999, condicionPago: "cuenta_corriente",
        retencionIibb: "20", montoIva21: "21",
      });
      expect(created.status).toBe(201);
      recordId = Number(created.body.id);
      expect((await request("/api/purchase-invoices", "POST", payload)).status).toBe(409);

      const stored = await pool.query(
        "SELECT estado, condicion_pago, supplier_id, cuenta_contable_id, monto_total, monto_iva21, retencion_iibb, asiento_id FROM purchase_invoices WHERE id = $1",
        [recordId],
      );
      expect(stored.rows[0]).toMatchObject({
        estado: "registrado", condicion_pago: "registro", supplier_id: supplierId,
        cuenta_contable_id: accountId, monto_total: "127.45", monto_iva21: "0.00",
        retencion_iibb: "0.00", asiento_id: null,
      });
      const stock = await pool.query("SELECT id FROM stock_movements WHERE source_type = 'purchase_invoice' AND source_id = $1", [String(recordId)]);
      const lines = await pool.query("SELECT id FROM purchase_invoice_lines WHERE invoice_id = $1", [recordId]);
      const ledger = await pool.query("SELECT id FROM accounting_entries WHERE origen_tipo = 'purchase_invoice' AND origen_id = $1", [recordId]);
      expect([stock.rowCount, lines.rowCount, ledger.rowCount]).toEqual([0, 0, 0]);
      const debt = await request(`/api/accounting-suppliers/${supplierId}/cuenta-corriente`);
      expect(debt.body.facturasPendientes).toEqual([]);
      const report = await request("/api/reports/estado-resultados?periodo=08/2026");
      expect(report.status).toBe(200);
      expect(Number(report.body.gastosOperativos.gastosBancarios) - initialExpenses).toBeCloseTo(127.45, 2);
      const exportResponse = await fetch(`${baseUrl}/api/exports/libro-iva-compras?periodo=08/2026&tipo=excel`);
      expect(exportResponse.status).toBe(200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(await exportResponse.arrayBuffer()));
      const values = workbook.worksheets[0].getColumn(7).values.map(value => String(value));
      expect(values).not.toContain(payload.numeroComprobante);

      const cancelled = await request(`/api/purchase-invoices/${recordId}`, "DELETE");
      expect(cancelled.status).toBe(200);
      const result = await pool.query("SELECT estado FROM purchase_invoices WHERE id = $1", [recordId]);
      expect(result.rows[0].estado).toBe("anulado");
      const afterCancellation = await request("/api/reports/estado-resultados?periodo=08/2026");
      expect(Number(afterCancellation.body.gastosOperativos.gastosBancarios)).toBeCloseTo(initialExpenses, 2);
    } finally {
      if (recordId) await pool.query("DELETE FROM purchase_invoices WHERE id = $1", [recordId]);
      await pool.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplierId]);
      await pool.query("DELETE FROM accounting_accounts WHERE id = $1", [accountId]);
    }
  });
});
