import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: (_roles: string[]) => (req: any, _res: any, next: () => void) => {
    req.user = { id: "fiscal-report-test", username: "tester-admin", role: "admin" };
    next();
  },
}));

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const testPool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 })
  : null;
let server: http.Server | null = null;
let baseUrl = "";

runIfDatabaseIsConfigured("GET /api/account-movements/report — filtro fiscal de Cuentas Corrientes", () => {
  beforeAll(async () => {
    const { registerRoutes } = await import("../routes");
    const app = express();
    app.use(express.json());
    server = http.createServer(app);
    await registerRoutes(server, app);
    await new Promise<void>((resolve, reject) => {
      server!.listen(0, "127.0.0.1", resolve);
      server!.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No se obtuvo puerto de prueba");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server?.close((error) => error ? reject(error) : resolve()) || resolve(),
    );
    await testPool?.end();
    const { pool } = await import("../db");
    await pool.end();
  });

  it("excluye cargos de estadía y de cierre, y conserva los movimientos fiscales (reaplicación de factura, cobros)", async () => {
    if (!testPool) throw new Error("DATABASE_URL no configurada");
    const suffix = randomUUID();
    const companyId = `fiscal-report-company-${suffix}`;
    const razonSocial = `Empresa Reporte Fiscal ${suffix}`;

    const stayChargeId = randomUUID();
    const cierreChargeId = randomUUID();
    const invoiceReapplicationId = randomUUID();
    const cashCollectionId = randomUUID();
    const voidedCollectionId = randomUUID();
    const voidReversalId = randomUUID();

    try {
      await testPool.query(
        `INSERT INTO companies (id, razon_social, cuil_cuit, is_active)
         VALUES ($1, $2, '20-12345678-9', 'true')`,
        [companyId, razonSocial],
      );

      // Reservation-stay ledger charge — the auto-generated "Estadía ... — Hab. ..."
      // entry created when a CC payment posts. Must be excluded.
      await testPool.query(
        `INSERT INTO account_movements (id, entity_type, entity_id, date, type, description, amount)
         VALUES ($1, 'company', $2, '2026-09-01', 'cargo', 'Estadía RES-0001 — Hab. 101', '100.00')`,
        [stayChargeId, companyId],
      );

      // Forced night-audit closure adjustment — must be excluded.
      await testPool.query(
        `INSERT INTO account_movements (id, entity_type, entity_id, date, type, description, amount)
         VALUES ($1, 'company', $2, '2026-09-02', 'cargo', 'Saldo por estadía RES-0001 — Hab. 101 (cierre con deuda)', '50.00')`,
        [cierreChargeId, companyId],
      );

      // Invoice-credit reapplication charge — a real factura behind it. Must stay.
      await testPool.query(
        `INSERT INTO account_movements (id, entity_type, entity_id, date, type, description, amount, reference)
         VALUES ($1, 'company', $2, '2026-09-03', 'cargo', 'FA reaplicación abc-123', '30.00', 'FA-0001-00001234')`,
        [invoiceReapplicationId, companyId],
      );

      // A real cash collection against the account — must stay.
      await testPool.query(
        `INSERT INTO account_movements (id, entity_type, entity_id, date, type, description, amount, reference)
         VALUES ($1, 'company', $2, '2026-09-04', 'pago', $3, '-30.00', 'Caja: xyz')`,
        [cashCollectionId, companyId, `Cobro en caja — ${razonSocial}`],
      );

      await testPool.query(
        `INSERT INTO account_movements
         (id, entity_type, entity_id, date, type, description, amount, voided, voided_at, voided_by, void_reason)
         VALUES ($1, 'company', $2, '2026-09-05', 'pago', 'Cobro directo anulado', '-20.00',
                 true, NOW(), 'tester-admin', 'Error de carga')`,
        [voidedCollectionId, companyId],
      );
      await testPool.query(
        `INSERT INTO account_movements
         (id, entity_type, entity_id, date, type, description, amount, reversal_of_movement_id)
         VALUES ($1, 'company', $2, '2026-09-06', 'ajuste', 'Anulación de recibo', '20.00', $3)`,
        [voidReversalId, companyId, voidedCollectionId],
      );

      const response = await fetch(`${baseUrl}/api/account-movements/report?from=2026-09-01&to=2026-09-30`);
      expect(response.status).toBe(200);
      const body = await response.json() as Array<Record<string, unknown>>;
      const ids = body.filter(m => (m as any).entityId === companyId).map(m => m.id);

      expect(ids).not.toContain(stayChargeId);
      expect(ids).not.toContain(cierreChargeId);
      expect(ids).toContain(invoiceReapplicationId);
      expect(ids).toContain(cashCollectionId);
      expect(ids).not.toContain(voidedCollectionId);
      expect(ids).not.toContain(voidReversalId);
    } finally {
      await testPool.query(
        "DELETE FROM account_movements WHERE id = ANY($1::varchar[])",
        [[stayChargeId, cierreChargeId, invoiceReapplicationId, cashCollectionId, voidReversalId, voidedCollectionId]],
      );
      await testPool.query("DELETE FROM companies WHERE id = $1", [companyId]);
    }
  });
});
