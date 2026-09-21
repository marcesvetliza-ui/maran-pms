import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Guards the fix for: "Revisar saldos pendientes" (POST
 * /api/admin/reconcile-checkout-debts) computed the pending balance with its
 * own inline SQL sum of `charges`, which — unlike every other financial view
 * (shared/reservationFolio.ts getOperationalReservationCharges) — did not
 * exclude the negative "Ajuste por NC ... [nc:...]" charge a credit note
 * leaves behind. A checked-out reservation that had a credit note issued
 * against it could get a Cuenta Corriente debt cargo for the wrong amount —
 * smaller than what every other screen (e.g. "Deuda por Huésped") reports
 * for the same reservation. Fixed by reusing getOperationalReservationCharges
 * so this admin tool agrees with the rest of the system on what counts as a
 * real, pending service — never fixing the shared formula itself.
 */

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: (_roles: string[]) => (req: any, _res: any, next: () => void) => {
    req.user = { id: "reconcile-checkout-debts-test", username: "tester-admin", role: "admin" };
    next();
  },
}));

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const testPool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 })
  : null;
let server: http.Server | null = null;
let baseUrl = "";

async function runReconciliation() {
  const response = await fetch(`${baseUrl}/api/admin/reconcile-checkout-debts`, { method: "POST" });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

runIfDatabaseIsConfigured("PostgreSQL real: reconciliación de deudas de checkout", () => {
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

  it("excluye el ajuste de una NC del saldo, respeta pagos anulados, y es idempotente", async () => {
    if (!testPool) throw new Error("DATABASE_URL no configurada");
    const suffix = randomUUID();
    const companyId = `reconcile-checkout-company-${suffix}`;
    const reservationId = `reconcile-checkout-res-${suffix}`;
    const extraChargeId = randomUUID();
    const ncAdjustmentChargeId = randomUUID();
    const voidedPaymentId = randomUUID();

    try {
      await testPool.query(
        `INSERT INTO companies (id, razon_social, cuil_cuit, is_active)
         VALUES ($1, $2, '20-12345678-9', 'true')`,
        [companyId, `Empresa Reconcile Checkout ${suffix}`],
      );
      await testPool.query(
        `INSERT INTO reservations
           (id, reservation_code, guest_id, company_id, room_type_id, room_id,
            check_in_date, check_out_date, nights, total_room_amount, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, '2026-09-01', '2026-09-02', 1, '100000.00', 'checked_out', NOW())`,
        [reservationId, `RCB-${suffix}`, `guest-${suffix}`, companyId, `type-${suffix}`, `room-${suffix}`],
      );

      // A real, still-owed extra charge.
      await testPool.query(
        `INSERT INTO charges (id, reservation_id, description, amount, date, category, status)
         VALUES ($1, $2, 'Cargo extra de prueba', '20000.00', '2026-09-01', 'otros', 'active')`,
        [extraChargeId, reservationId],
      );
      // The compensating charge a credit note leaves behind
      // (reconcileReservationCreditNote in server/billing/routes.ts) — must
      // never count as pending service.
      await testPool.query(
        `INSERT INTO charges (id, reservation_id, description, amount, date, category, status)
         VALUES ($1, $2, 'Ajuste por NC NCB 0001-00000099 — Alojamiento [nc:123:accommodation]', '-30000.00', '2026-09-01', 'adjustment', 'active')`,
        [ncAdjustmentChargeId, reservationId],
      );
      // A voided payment must never reduce the balance either.
      await testPool.query(
        `INSERT INTO payments (id, reservation_id, amount, method, date, status)
         VALUES ($1, $2, '50000.00', 'efectivo', '2026-09-01', 'anulado')`,
        [voidedPaymentId, reservationId],
      );

      const first = await runReconciliation();
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({ created: expect.any(Number) });

      const movements = await testPool.query(
        `SELECT amount, description FROM account_movements
         WHERE reservation_id = $1 AND type = 'cargo' AND description LIKE '%cierre con deuda%'`,
        [reservationId],
      );
      expect(movements.rows).toHaveLength(1);
      // 100.000 (alojamiento) + 20.000 (cargo real) = 120.000 — el ajuste de
      // NC (-30.000) y el pago anulado (50.000) no deben afectar el saldo.
      // Con el bug anterior este monto hubiera dado 90.000 (100.000 + 20.000
      // - 30.000 del ajuste sumado por error).
      expect(parseFloat(movements.rows[0].amount)).toBeCloseTo(120000, 2);

      // Re-running must not create a second cargo for the same reservation.
      const second = await runReconciliation();
      expect(second.status).toBe(200);
      const movementsAfterSecondRun = await testPool.query(
        `SELECT id FROM account_movements
         WHERE reservation_id = $1 AND type = 'cargo' AND description LIKE '%cierre con deuda%'`,
        [reservationId],
      );
      expect(movementsAfterSecondRun.rows).toHaveLength(1);
    } finally {
      await testPool.query("DELETE FROM account_movements WHERE reservation_id = $1", [reservationId]);
      await testPool.query(
        "DELETE FROM charges WHERE id = ANY($1::varchar[])",
        [[extraChargeId, ncAdjustmentChargeId]],
      );
      await testPool.query("DELETE FROM payments WHERE id = $1", [voidedPaymentId]);
      await testPool.query("DELETE FROM reservations WHERE id = $1", [reservationId]);
      await testPool.query("DELETE FROM companies WHERE id = $1", [companyId]);
    }
  });
});
