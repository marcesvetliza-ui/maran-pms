/**
 * Un recibo de Cuenta Corriente es el momento en que efectivamente se cobra
 * (si seguía en CC era porque no se había cobrado) — por eso ahora refleja
 * un movimiento real de Caja para la parte cobrada en efectivo/transferencia/
 * etc., y uno informativo para retenciones y compensación (no es plata que
 * entra). Al anularlo, esos movimientos de Caja se anulan también.
 */
import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

suite("PostgreSQL real: recibo de Cuenta Corriente refleja Caja", () => {
  beforeAll(async () => {
    const { registerGuestsRoutes } = await import("../routes/guests");
    const { loadRolePermissionsCache } = await import("../permissions");
    await loadRolePermissionsCache();
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: "cc-receipt-pg", username: "cc-receipt-pg", fullName: "Prueba Recibo CC", role: "admin" };
      req.isAuthenticated = () => true;
      next();
    });
    registerGuestsRoutes(app);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Sin puerto de prueba");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool?.end();
  });

  it("cobro real (efectivo) crea movimiento real de Caja; retención queda informativa; anular revierte ambos", async () => {
    if (!pool) return;
    const razonSocial = `Empresa Recibo CC ${randomUUID()}`;
    const company = await pool.query(
      `INSERT INTO companies (razon_social, cuil_cuit) VALUES ($1, $2) RETURNING id`,
      [razonSocial, "30-11111111-1"],
    );
    const companyId: string = company.rows[0].id;
    let movementId: string | undefined;
    try {
      const created = await request("POST", `/api/companies/${companyId}/account/payment`, {
        payments: [{ method: "efectivo", amount: "1000.00" }],
        retentions: [{ concepto: "IIBB", monto: "100.00" }],
        description: "Recibo de prueba",
        area: "recepcion",
      });
      expect(created.status, JSON.stringify(created.body)).toBe(200);
      movementId = created.body.id;

      const movements = await pool.query(
        `SELECT area, source_type, payment_method, amount, movement_type, anulado
         FROM cash_movements WHERE source_type = 'recibo_cta_cte' AND source_id = $1 ORDER BY payment_method`,
        [movementId],
      );
      expect(movements.rows).toHaveLength(2);
      const efectivo = movements.rows.find((r: any) => r.payment_method === "efectivo");
      const retencion = movements.rows.find((r: any) => r.payment_method === "retencion_iibb");
      expect(efectivo).toMatchObject({ area: "recepcion", movement_type: "income", amount: "1000.00", anulado: false });
      expect(retencion).toMatchObject({ area: "recepcion", movement_type: "informational", amount: "100.00", anulado: false });

      // Anular el recibo también anula lo que reflejó en Caja.
      const voided = await request("POST", `/api/account-movements/${movementId}/void`, { reason: "Prueba de anulación" });
      expect(voided.status, JSON.stringify(voided.body)).toBe(200);

      const movementsAfterVoid = await pool.query(
        `SELECT anulado, motivo_anulacion FROM cash_movements WHERE source_type = 'recibo_cta_cte' AND source_id = $1`,
        [movementId],
      );
      expect(movementsAfterVoid.rows).toHaveLength(2);
      for (const row of movementsAfterVoid.rows) {
        expect(row.anulado).toBe(true);
        expect(row.motivo_anulacion).toBe("Prueba de anulación");
      }
    } finally {
      if (movementId) {
        await pool.query("DELETE FROM cash_movements WHERE source_type = 'recibo_cta_cte' AND source_id = $1", [movementId]);
        await pool.query("DELETE FROM account_movements WHERE id = $1 OR reversal_of_movement_id = $1", [movementId]);
      }
      await pool.query("DELETE FROM companies WHERE id = $1", [companyId]);
    }
  });

  it("compensación queda informativa, no como cobro real", async () => {
    if (!pool) return;
    const razonSocial = `Empresa Compensacion ${randomUUID()}`;
    const company = await pool.query(
      `INSERT INTO companies (razon_social, cuil_cuit) VALUES ($1, $2) RETURNING id`,
      [razonSocial, "30-22222222-2"],
    );
    const companyId: string = company.rows[0].id;
    let movementId: string | undefined;
    try {
      const created = await request("POST", `/api/companies/${companyId}/account/payment`, {
        payments: [{ method: "compensacion", amount: "500.00" }],
        description: "Compensación de prueba",
        area: "restaurant",
      });
      expect(created.status, JSON.stringify(created.body)).toBe(200);
      movementId = created.body.id;

      const movements = await pool.query(
        `SELECT area, payment_method, movement_type FROM cash_movements WHERE source_type = 'recibo_cta_cte' AND source_id = $1`,
        [movementId],
      );
      expect(movements.rows).toEqual([{ area: "restaurant", payment_method: "compensacion", movement_type: "informational" }]);
    } finally {
      if (movementId) {
        await pool.query("DELETE FROM cash_movements WHERE source_type = 'recibo_cta_cte' AND source_id = $1", [movementId]);
        await pool.query("DELETE FROM account_movements WHERE id = $1", [movementId]);
      }
      await pool.query("DELETE FROM companies WHERE id = $1", [companyId]);
    }
  });

  it("rechaza el recibo sin área de Caja", async () => {
    if (!pool) return;
    const razonSocial = `Empresa Sin Area ${randomUUID()}`;
    const company = await pool.query(
      `INSERT INTO companies (razon_social, cuil_cuit) VALUES ($1, $2) RETURNING id`,
      [razonSocial, "30-33333333-3"],
    );
    const companyId: string = company.rows[0].id;
    try {
      const created = await request("POST", `/api/companies/${companyId}/account/payment`, {
        payments: [{ method: "efectivo", amount: "100.00" }],
      });
      expect(created.status).toBe(400);
      expect(created.body.error).toMatch(/área de caja/i);
    } finally {
      await pool.query("DELETE FROM companies WHERE id = $1", [companyId]);
    }
  });
});
