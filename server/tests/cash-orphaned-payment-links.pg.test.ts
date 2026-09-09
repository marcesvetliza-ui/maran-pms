import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: (_roles: string[]) => (req: any, _res: any, next: () => void) => {
    req.user = { id: "cash-orphan-audit-test", username: "tester", role: "admin" };
    next();
  },
}));

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const testPool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 })
  : null;
let server: http.Server | null = null;
let baseUrl = "";

async function getAudit() {
  const response = await fetch(`${baseUrl}/api/admin/cash/orphaned-payment-links`);
  return { status: response.status, body: await response.json() as Array<Record<string, unknown>> };
}

runIfDatabaseIsConfigured("PostgreSQL real: auditoría de vínculos huérfanos de Caja", () => {
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

  it("detecta y distingue vínculos huérfanos de reservas, grupos y SPA sin modificar Caja", async () => {
    if (!testPool) throw new Error("DATABASE_URL no configurada");
    const suffix = randomUUID();
    const reservationMovementId = `orphan-reservation-${suffix}`;
    const groupMovementId = `orphan-group-${suffix}`;
    const validPaymentId = `valid-payment-${suffix}`;
    const validMovementId = `valid-movement-${suffix}`;
    const validSpaPaymentId = `valid-spa-payment-${suffix}`;
    const validSpaMovementId = `valid-spa-movement-${suffix}`;
    const spaAccountMovementId = `orphan-spa-account-${suffix}`;
    const spaInvoiceMovementId = `orphan-spa-invoice-${suffix}`;
    const reservationId = `orphan-audit-res-${suffix}`;
    const shiftId = `orphan-audit-shift-${suffix}`;
    const orphanReservationPaymentId = `missing-reservation-payment-${suffix}`;
    const orphanGroupPaymentId = `missing-group-payment-${suffix}`;
    const orphanSpaAccountPaymentId = `missing-spa-account-payment-${suffix}`;
    const orphanSpaInvoicePaymentId = `missing-spa-invoice-payment-${suffix}`;

    try {
      await testPool.query(
        `INSERT INTO reservations
          (id, reservation_code, guest_id, room_type_id, room_id, check_in_date, check_out_date, status, created_at)
         VALUES ($1, $2, $3, $4, $5, '2026-09-01', '2026-09-02', 'confirmed', NOW())`,
        [reservationId, `AUD-${suffix}`, `guest-${suffix}`, `type-${suffix}`, `room-${suffix}`],
      );
      await testPool.query(
        `INSERT INTO payments (id, reservation_id, amount, method, date, status)
         VALUES ($1, $2, '10.00', 'efectivo', '2026-09-01', 'active')`,
        [validPaymentId, reservationId],
      );
      await testPool.query(
        `INSERT INTO spa_payments (id, account_id, amount, method, created_at, status)
         VALUES ($1, $2, '15.00', 'cash', NOW(), 'active')`,
        [validSpaPaymentId, `spa-account-${suffix}`],
      );
      await testPool.query(
        `INSERT INTO cash_shifts (id, area, shift_number, opened_at, status)
         VALUES ($1, 'reception', 991515, NOW(), 'open')`,
        [shiftId],
      );
      await testPool.query(
        `INSERT INTO cash_movements
          (id, shift_id, area, source_type, source_id, source_label, payment_method, amount, movement_type, payment_id)
         VALUES
          ($1, $4, 'reception', 'reservation', $5, 'Reserva huérfana', 'efectivo', '25.00', 'income', $2),
          ($3, $4, 'reception', 'group_payment', 'missing-group', 'Grupo huérfano', 'transferencia', '40.00', 'income', $6),
          ($7, $4, 'reception', 'reservation', $5, 'Reserva válida', 'efectivo', '10.00', 'income', $8),
          ($9, $4, 'spa', 'spa_account', 'missing-spa-account', 'SPA huérfano', 'cash', '20.00', 'income', $10),
          ($11, $4, 'spa', 'comprobante', 'missing-invoice', 'Comprobante SPA huérfano', 'credit_card', '30.00', 'income', $12),
          ($13, $4, 'spa', 'spa_account', 'valid-spa-account', 'SPA válido', 'cash', '15.00', 'income', $14)`,
        [
          reservationMovementId,
          orphanReservationPaymentId,
          groupMovementId,
          shiftId,
          reservationId,
          orphanGroupPaymentId,
          validMovementId,
          validPaymentId,
          spaAccountMovementId,
          orphanSpaAccountPaymentId,
          spaInvoiceMovementId,
          orphanSpaInvoicePaymentId,
          validSpaMovementId,
          validSpaPaymentId,
        ],
      );

      const audit = await getAudit();
      expect(audit.status).toBe(200);
      expect(audit.body).toEqual(expect.arrayContaining([
        expect.objectContaining({
          movementId: reservationMovementId,
          paymentId: orphanReservationPaymentId,
          paymentType: "reservation",
          sourceType: "reservation",
        }),
        expect.objectContaining({
          movementId: groupMovementId,
          paymentId: orphanGroupPaymentId,
          paymentType: "group",
          sourceType: "group_payment",
        }),
        expect.objectContaining({
          movementId: spaAccountMovementId,
          paymentId: orphanSpaAccountPaymentId,
          paymentType: "spa",
          sourceType: "spa_account",
        }),
        expect.objectContaining({
          movementId: spaInvoiceMovementId,
          paymentId: orphanSpaInvoicePaymentId,
          paymentType: "spa",
          sourceType: "comprobante",
        }),
      ]));
      expect(audit.body).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ movementId: validMovementId }),
        expect.objectContaining({ movementId: validSpaMovementId }),
      ]));

      const remaining = await testPool.query(
        "SELECT id, payment_id FROM cash_movements WHERE id = ANY($1::varchar[]) ORDER BY id",
        [[reservationMovementId, groupMovementId, validMovementId, spaAccountMovementId, spaInvoiceMovementId, validSpaMovementId]],
      );
      expect(remaining.rows).toHaveLength(6);
    } finally {
      await testPool.query(
        "DELETE FROM cash_movements WHERE id = ANY($1::varchar[])",
        [[reservationMovementId, groupMovementId, validMovementId, spaAccountMovementId, spaInvoiceMovementId, validSpaMovementId]],
      );
      await testPool.query("DELETE FROM spa_payments WHERE id = $1", [validSpaPaymentId]);
      await testPool.query("DELETE FROM payments WHERE id = $1", [validPaymentId]);
      await testPool.query("DELETE FROM reservations WHERE id = $1", [reservationId]);
      await testPool.query("DELETE FROM cash_shifts WHERE id = $1", [shiftId]);
    }
  });
});