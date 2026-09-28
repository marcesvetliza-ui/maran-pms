import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: (_roles: string[]) => (req: any, _res: any, next: () => void) => {
    req.user = { id: "cash-dup-audit-test", username: "tester-admin", role: "admin" };
    next();
  },
}));

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const testPool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 })
  : null;
let server: http.Server | null = null;
let baseUrl = "";

async function getDuplicates() {
  const response = await fetch(`${baseUrl}/api/admin/cash/duplicate-payment-links`);
  return { status: response.status, body: await response.json() as Array<Record<string, unknown>> };
}

async function resolveDuplicate(movementId: string, motivo?: string) {
  const response = await fetch(`${baseUrl}/api/admin/cash/movements/${movementId}/resolve-duplicate-link`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(motivo === undefined ? {} : { motivo }),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

runIfDatabaseIsConfigured("PostgreSQL real: vínculos duplicados de Caja", () => {
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

  it("agrupa movimientos duplicados por pago, deja el correcto anulado y silencioso, y nunca toca el pago real", async () => {
    if (!testPool) throw new Error("DATABASE_URL no configurada");
    const suffix = randomUUID();
    const reservationId = `dup-audit-res-${suffix}`;
    const shiftId = `dup-audit-shift-${suffix}`;
    const paymentId = `dup-payment-${suffix}`;
    const duplicateMovementId = `dup-movement-a-${suffix}`;
    const keeperMovementId = `dup-movement-b-${suffix}`;
    // Non-duplicate control case: must never show up in the audit list.
    const singlePaymentId = `single-payment-${suffix}`;
    const singleMovementId = `single-movement-${suffix}`;

    try {
      // The database this test runs against is normally healthy (no legacy
      // duplicates), so cash_movements_reservation_payment_id_unique is
      // very likely already present — exactly the state the migration
      // leaves a clean database in. Drop it before deliberately inserting a
      // duplicate below, or the insert itself is rejected before the test
      // ever gets to exercise the repair tool. Restored unconditionally in
      // `finally`.
      await testPool.query("DROP INDEX IF EXISTS cash_movements_reservation_payment_id_unique");

      await testPool.query(
        `INSERT INTO reservations
          (id, reservation_code, guest_id, room_type_id, room_id, check_in_date, check_out_date, status, created_at)
         VALUES ($1, $2, $3, $4, $5, '2026-09-01', '2026-09-02', 'confirmed', NOW())`,
        [reservationId, `DUP-${suffix}`, `guest-${suffix}`, `type-${suffix}`, `room-${suffix}`],
      );
      await testPool.query(
        `INSERT INTO payments (id, reservation_id, amount, method, date, status)
         VALUES ($1, $2, '50.00', 'efectivo', '2026-09-01', 'active'),
                ($3, $2, '30.00', 'efectivo', '2026-09-01', 'active')`,
        [paymentId, reservationId, singlePaymentId],
      );
      await testPool.query(
        `INSERT INTO cash_shifts (id, area, shift_number, opened_at, status)
         VALUES ($1, 'reception', 991516, NOW(), 'open')`,
        [shiftId],
      );
      // Two cash_movements accidentally pointing at the SAME reservation payment
      // (the bug), plus one clean, single-linked payment as a control.
      await testPool.query(
        `INSERT INTO cash_movements
          (id, shift_id, area, source_type, source_id, source_label, payment_method, amount, movement_type, registered_by, payment_id)
         VALUES
          ($1, $2, 'reception', 'reservation', $3, 'Pago duplicado A', 'efectivo', '50.00', 'income', 'recepcion1', $4),
          ($5, $2, 'reception', 'reservation', $3, 'Pago duplicado B', 'efectivo', '50.00', 'income', 'recepcion2', $4),
          ($6, $2, 'reception', 'reservation', $3, 'Pago sin duplicar', 'efectivo', '30.00', 'income', 'recepcion1', $7)`,
        [duplicateMovementId, shiftId, reservationId, paymentId, keeperMovementId, singleMovementId, singlePaymentId],
      );

      const before = await getDuplicates();
      expect(before.status).toBe(200);
      const group = before.body.find((g: any) => g.paymentId === paymentId) as any;
      expect(group).toBeDefined();
      expect(group.reservationCode).toBe(`DUP-${suffix}`);
      expect(group.movements.map((m: any) => m.movementId).sort()).toEqual(
        [duplicateMovementId, keeperMovementId].sort(),
      );
      // The clean, single-linked payment must never appear in the audit.
      expect(before.body.find((g: any) => g.paymentId === singlePaymentId)).toBeUndefined();

      // Missing motivo is rejected.
      const missingMotivo = await resolveDuplicate(duplicateMovementId);
      expect(missingMotivo.status).toBe(400);

      // Resolving the single, non-duplicated movement is rejected — nothing
      // to unlink there.
      const notDuplicate = await resolveDuplicate(singleMovementId, "no debería aplicar");
      expect(notDuplicate.status).toBe(400);

      const resolved = await resolveDuplicate(duplicateMovementId, "Carga doble por error de recepción, se conserva el movimiento B");
      expect(resolved.status).toBe(200);
      expect(resolved.body).toMatchObject({
        id: duplicateMovementId,
        anulado: true,
        anuladoPor: "tester-admin",
        paymentId: null,
      });

      // The chosen movement is voided and unlinked...
      const duplicateRow = (await testPool.query(
        "SELECT anulado, motivo_anulacion, anulado_por, payment_id, amount FROM cash_movements WHERE id = $1",
        [duplicateMovementId],
      )).rows[0];
      expect(duplicateRow.anulado).toBe(true);
      expect(duplicateRow.payment_id).toBeNull();
      expect(duplicateRow.motivo_anulacion).toContain("Carga doble");
      expect(parseFloat(duplicateRow.amount)).toBe(50);

      // ...while the OTHER movement (the one kept) and the underlying
      // payment/reservation stay completely untouched — this is the whole
      // point: only the redundant Caja bookkeeping entry gets corrected.
      const keeperRow = (await testPool.query(
        "SELECT anulado, payment_id FROM cash_movements WHERE id = $1",
        [keeperMovementId],
      )).rows[0];
      expect(keeperRow.anulado).toBe(false);
      expect(keeperRow.payment_id).toBe(paymentId);

      const paymentRow = (await testPool.query(
        "SELECT status FROM payments WHERE id = $1",
        [paymentId],
      )).rows[0];
      expect(paymentRow.status).toBe("active");

      // The payment no longer has a duplicate — it must disappear from the
      // audit, and re-resolving it (or the already-voided movement) is
      // rejected.
      const after = await getDuplicates();
      expect(after.body.find((g: any) => g.paymentId === paymentId)).toBeUndefined();

      const alreadyVoided = await resolveDuplicate(duplicateMovementId, "segundo intento");
      expect(alreadyVoided.status).toBe(400);

      const noLongerDuplicate = await resolveDuplicate(keeperMovementId, "ya no hay duplicado que resolver");
      expect(noLongerDuplicate.status).toBe(400);

      // With the duplicate gone, the guarded unique index migration can now
      // create the index it previously had to skip — proving the repair
      // actually unblocks it, not just silences the audit list.
      const { CASH_MOVEMENTS_PAYMENT_ID_UNIQUE_MIGRATION_SQL } = await import("../migrate");
      await testPool.query("DROP INDEX IF EXISTS cash_movements_reservation_payment_id_unique");
      await testPool.query(CASH_MOVEMENTS_PAYMENT_ID_UNIQUE_MIGRATION_SQL);
      const indexRow = (await testPool.query(
        "SELECT to_regclass('cash_movements_reservation_payment_id_unique') AS name",
      )).rows[0];
      expect(indexRow.name).toBe("cash_movements_reservation_payment_id_unique");
    } finally {
      // Drop first (in case the try block failed before reaching its own
      // drop/recreate steps — DROP ... IF EXISTS is a safe no-op either
      // way), delete every row this test created, then recreate the index.
      // Runs regardless of pass/fail so a failed assertion never leaves the
      // shared test database without this integrity guard for whoever runs
      // the suite next.
      await testPool.query("DROP INDEX IF EXISTS cash_movements_reservation_payment_id_unique");
      await testPool.query(
        "DELETE FROM cash_movements WHERE id = ANY($1::varchar[])",
        [[duplicateMovementId, keeperMovementId, singleMovementId]],
      );
      await testPool.query(
        "DELETE FROM payments WHERE id = ANY($1::varchar[])",
        [[paymentId, singlePaymentId]],
      );
      await testPool.query("DELETE FROM reservations WHERE id = $1", [reservationId]);
      await testPool.query("DELETE FROM cash_shifts WHERE id = $1", [shiftId]);
      const { CASH_MOVEMENTS_PAYMENT_ID_UNIQUE_MIGRATION_SQL: restoreIndexSql } = await import("../migrate");
      await testPool.query(restoreIndexSql);
    }
  });
});
