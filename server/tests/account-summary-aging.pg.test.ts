import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { storage } from "../db-storage";

const configured = Boolean(process.env.DATABASE_URL);
const suite = configured ? describe : describe.skip;
const pool = configured ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 }) : null;

suite("PostgreSQL: getAccountSummary — antigüedad de deuda por cargo pendiente, no por último movimiento", () => {
  afterAll(async () => { await pool?.end(); });

  it("usa la fecha del cargo más viejo aún impago, no la del último movimiento", async () => {
    if (!pool) return;
    const companyId = `aging-co-${randomUUID()}`;
    const oldChargeId = `aging-charge-old-${randomUUID()}`;
    const recentPaymentId = `aging-payment-${randomUUID()}`;
    try {
      await pool.query(
        `INSERT INTO companies (id, razon_social, cuil_cuit, is_active)
         VALUES ($1, 'Aging Test SA', $2, 'true')`,
        [companyId, `20${Date.now()}`],
      );
      // Cargo viejo (90 días atrás), impago.
      await pool.query(
        `INSERT INTO account_movements (id, entity_type, entity_id, date, type, description, amount)
         VALUES ($1, 'company', $2, CURRENT_DATE - INTERVAL '90 days', 'cargo', 'Estadía vieja', '1000')`,
        [oldChargeId, companyId],
      );
      // Pago reciente (5 días atrás) que cubre solo una parte del cargo viejo —
      // el "último movimiento" pasa a ser reciente, pero el cargo sigue sin cubrirse del todo.
      await pool.query(
        `INSERT INTO account_movements (id, entity_type, entity_id, date, type, description, amount)
         VALUES ($1, 'company', $2, CURRENT_DATE - INTERVAL '5 days', 'pago', 'Pago parcial', '-400')`,
        [recentPaymentId, companyId],
      );
      await pool.query(
        `INSERT INTO account_movement_allocations (pago_id, cargo_id, amount) VALUES ($1, $2, '400')`,
        [recentPaymentId, oldChargeId],
      );

      const summary = await storage.getAccountSummary();
      const entry = summary.companies.find(c => c.id === companyId);

      expect(entry).toBeDefined();
      expect(entry!.balance).toBe(600);
      // El último movimiento es el pago reciente, distinto del cargo que sigue impago...
      expect(entry!.lastMovement).not.toBe(entry!.oldestUnpaidDate);
      // ...y la antigüedad de la deuda se mide desde ese cargo viejo, no desde el pago.
      expect(entry!.daysOverdue).toBeGreaterThanOrEqual(89);
      expect(entry!.daysOverdue).toBeLessThanOrEqual(91);
    } finally {
      await pool.query("DELETE FROM account_movement_allocations WHERE cargo_id = $1", [oldChargeId]);
      await pool.query("DELETE FROM account_movements WHERE entity_id = $1 AND entity_type = 'company'", [companyId]);
      await pool.query("DELETE FROM companies WHERE id = $1", [companyId]);
    }
  });

  it("no marca antigüedad cuando el cargo pendiente es reciente", async () => {
    if (!pool) return;
    const companyId = `aging-co-recent-${randomUUID()}`;
    const chargeId = `aging-charge-recent-${randomUUID()}`;
    try {
      await pool.query(
        `INSERT INTO companies (id, razon_social, cuil_cuit, is_active)
         VALUES ($1, 'Aging Recent SA', $2, 'true')`,
        [companyId, `21${Date.now()}`],
      );
      await pool.query(
        `INSERT INTO account_movements (id, entity_type, entity_id, date, type, description, amount)
         VALUES ($1, 'company', $2, CURRENT_DATE - INTERVAL '10 days', 'cargo', 'Estadía reciente', '500')`,
        [chargeId, companyId],
      );

      const summary = await storage.getAccountSummary();
      const entry = summary.companies.find(c => c.id === companyId);

      expect(entry).toBeDefined();
      expect(entry!.balance).toBe(500);
      expect(entry!.daysOverdue).toBeGreaterThanOrEqual(9);
      expect(entry!.daysOverdue).toBeLessThanOrEqual(11);
    } finally {
      await pool.query("DELETE FROM account_movements WHERE entity_id = $1 AND entity_type = 'company'", [companyId]);
      await pool.query("DELETE FROM companies WHERE id = $1", [companyId]);
    }
  });

  it("una empresa Cortada con deuda sigue apareciendo en el resumen", async () => {
    if (!pool) return;
    const companyId = `aging-co-cortada-${randomUUID()}`;
    const chargeId = `aging-charge-cortada-${randomUUID()}`;
    try {
      await pool.query(
        `INSERT INTO companies (id, razon_social, cuil_cuit, is_active)
         VALUES ($1, 'Aging Cortada SA', $2, 'false')`,
        [companyId, `22${Date.now()}`],
      );
      await pool.query(
        `INSERT INTO account_movements (id, entity_type, entity_id, date, type, description, amount)
         VALUES ($1, 'company', $2, CURRENT_DATE - INTERVAL '90 days', 'cargo', 'Estadía impaga', '2000')`,
        [chargeId, companyId],
      );

      const summary = await storage.getAccountSummary();
      const entry = summary.companies.find(c => c.id === companyId);

      expect(entry).toBeDefined();
      expect(entry!.balance).toBe(2000);
    } finally {
      await pool.query("DELETE FROM account_movements WHERE entity_id = $1 AND entity_type = 'company'", [companyId]);
      await pool.query("DELETE FROM companies WHERE id = $1", [companyId]);
    }
  });
});
