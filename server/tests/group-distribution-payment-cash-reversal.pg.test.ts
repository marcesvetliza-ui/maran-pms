import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verifyFinancialSchema } from "../migrate";

/**
 * End-to-end Postgres companion to group-master-payment-cash-reversal.pg.test.ts
 * (task #415, following up on task #411/#414's Folio Maestro coverage). That
 * suite only exercises the master_folio destination. The same DELETE handler
 * and registerGroupPaymentCashMovements() helper also back the
 * group_distribution destination — a direct "Pago Grupal" distributed across
 * rooms, reached via POST /api/groups/:groupId/payment. Nothing proved
 * against a real database that a direct Pago Grupal's cash_movements row is
 * inserted with anulado=false and then really flips to anulado=true when
 * that payment is reversed through DELETE master-payments — this suite
 * closes that gap.
 */

vi.mock("../auth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = { username: "cajera-pg-tester" };
    next();
  },
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;

type Fixture = {
  groupId: string;
  reservationId: string;
};

const testPool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 4,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 1_000,
    })
  : null;

let baseUrl = "";
let httpServer: http.Server | null = null;

async function startApp() {
  const { registerGroupsRoutes } = await import("../routes/groups");
  const app = express();
  app.use(express.json());
  registerGroupsRoutes(app);

  httpServer = await new Promise<http.Server>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("No se pudo obtener el puerto del servidor de prueba");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function stopApp() {
  if (!httpServer) return;
  await new Promise<void>((resolve, reject) => {
    httpServer!.close((error) => (error ? reject(error) : resolve()));
  });
  httpServer = null;
}

async function createFixture(): Promise<Fixture> {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");

  const suffix = randomUUID();
  const fixture: Fixture = {
    groupId: `pg-distribution-cash-group-${suffix}`,
    reservationId: `pg-distribution-cash-reservation-${suffix}`,
  };

  await testPool.query(
    `INSERT INTO groups
      (id, group_code, name, check_in_date, check_out_date, status, master_folio_config, created_at)
     VALUES ($1, $2, $3, DATE '2026-08-26', DATE '2026-08-27', 'confirmed', 'accommodation', NOW())`,
    [fixture.groupId, `PGDIST-${suffix}`, "Prueba de anulación de caja en Pago Grupal directo"],
  );
  // A real, active reservation (not group_charges) is required here: the
  // group_distribution destination allocates the payment across active
  // rooms, unlike master_folio which can settle non-room-tied balances.
  // guest_id/room_type_id/room_id have no FK constraints at the DB level, so
  // fixture-only ids are safe — enrichReservations() and the payment route's
  // guest/room lookups are LEFT JOINs that tolerate missing rows.
  await testPool.query(
    `INSERT INTO reservations
      (id, reservation_code, guest_id, room_type_id, room_id, check_in_date, check_out_date,
       total_room_amount, status, created_at)
     VALUES ($1, $2, $3, $4, $5, DATE '2026-08-26', DATE '2026-08-27', '150.00', 'confirmed', NOW())`,
    [
      fixture.reservationId,
      `PGDIST-RES-${suffix}`,
      `pg-distribution-guest-${suffix}`,
      `pg-distribution-room-type-${suffix}`,
      `pg-distribution-room-${suffix}`,
    ],
  );
  await testPool.query(
    `INSERT INTO group_reservation_links (id, group_id, reservation_id) VALUES ($1, $2, $3)`,
    [`pg-distribution-link-${suffix}`, fixture.groupId, fixture.reservationId],
  );

  return fixture;
}

async function cleanupFixture(fixture: Fixture, groupPaymentId: string | null) {
  if (!testPool) return;
  if (groupPaymentId) {
    await testPool.query("DELETE FROM cash_movements WHERE payment_id = $1", [groupPaymentId]);
    await testPool.query("DELETE FROM payments WHERE group_payment_id = $1", [groupPaymentId]);
    await testPool.query("DELETE FROM group_payments WHERE id = $1", [groupPaymentId]);
  }
  await testPool.query("DELETE FROM payments WHERE reservation_id = $1", [fixture.reservationId]);
  await testPool.query("DELETE FROM group_reservation_links WHERE reservation_id = $1", [fixture.reservationId]);
  await testPool.query("DELETE FROM reservations WHERE id = $1", [fixture.reservationId]);
  await testPool.query("DELETE FROM groups WHERE id = $1", [fixture.groupId]);
}

async function postGroupDistributionPayment(fixture: Fixture) {
  const response = await fetch(`${baseUrl}/api/groups/${fixture.groupId}/payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paymentRows: [{ method: "efectivo", amount: "150.00" }],
      distribution: "equal",
      closeAllRooms: false,
    }),
  });
  return { status: response.status, body: (await response.json()) as any };
}

async function deleteMasterPayment(groupId: string, paymentId: string) {
  const response = await fetch(`${baseUrl}/api/groups/${groupId}/master-payments/${paymentId}`, {
    method: "DELETE",
  });
  return { status: response.status, body: (await response.json()) as any };
}

async function readCashMovements(groupPaymentId: string) {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  const result = await testPool.query(
    `SELECT payment_id, source_type, source_id, payment_method, amount, movement_type,
            anulado, anulado_por, anulado_at, motivo_anulacion
     FROM cash_movements
     WHERE payment_id = $1`,
    [groupPaymentId],
  );
  return result.rows;
}

async function readGroupPayment(groupPaymentId: string) {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  const result = await testPool.query(
    "SELECT id, destination FROM group_payments WHERE id = $1",
    [groupPaymentId],
  );
  return result.rows;
}

async function readReservationPayments(reservationId: string) {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  const result = await testPool.query(
    "SELECT id, group_payment_id FROM payments WHERE reservation_id = $1",
    [reservationId],
  );
  return result.rows;
}

runIfDatabaseIsConfigured("PostgreSQL real: Caja stops showing income when a direct Pago Grupal is reversed", () => {
  beforeAll(async () => {
    if (!testPool) return;
    const financialSchema = await verifyFinancialSchema();
    expect(
      financialSchema,
      "La base de datos debe tener todas las columnas e índices requeridos por cobros grupales y Caja.",
    ).toMatchObject({
      ready: true,
      missingColumns: [],
      missingIndexes: [],
    });
    await startApp();
  });

  afterAll(async () => {
    await stopApp();
    await testPool?.end();
    const { pool } = await import("../db");
    await pool.end();
  });

  it("records a real cash_movements income row for a direct Pago Grupal and anulas it end-to-end on reversal", async () => {
    const fixture = await createFixture();
    let groupPaymentId: string | null = null;
    try {
      const posted = await postGroupDistributionPayment(fixture);
      expect(posted.status).toBe(200);
      expect(posted.body.success).toBe(true);
      groupPaymentId = posted.body.groupPaymentId;
      expect(groupPaymentId).toBeTruthy();

      const [groupPaymentRow] = await readGroupPayment(groupPaymentId!);
      expect(groupPaymentRow).toMatchObject({ id: groupPaymentId, destination: "group_distribution" });

      const reservationPayments = await readReservationPayments(fixture.reservationId);
      expect(reservationPayments).toHaveLength(1);
      expect(reservationPayments[0]).toMatchObject({ group_payment_id: groupPaymentId });

      const beforeDelete = await readCashMovements(groupPaymentId!);
      expect(beforeDelete).toHaveLength(1);
      expect(beforeDelete[0]).toMatchObject({
        payment_id: groupPaymentId,
        source_type: "group_payment",
        source_id: fixture.groupId,
        payment_method: "efectivo",
        amount: "150.00",
        movement_type: "income",
        anulado: false,
        anulado_por: null,
        anulado_at: null,
      });

      const deleted = await deleteMasterPayment(fixture.groupId, groupPaymentId!);
      expect(deleted.status).toBe(200);
      expect(deleted.body.success).toBe(true);

      const groupPaymentAfterDelete = await readGroupPayment(groupPaymentId!);
      expect(groupPaymentAfterDelete).toEqual([]);

      const reservationPaymentsAfterDelete = await readReservationPayments(fixture.reservationId);
      expect(reservationPaymentsAfterDelete).toEqual([]);

      const afterDelete = await readCashMovements(groupPaymentId!);
      expect(afterDelete).toHaveLength(1);
      expect(afterDelete[0]).toMatchObject({
        payment_id: groupPaymentId,
        amount: "150.00",
        anulado: true,
        anulado_por: "cajera-pg-tester",
      });
      expect(afterDelete[0].anulado_at).toBeInstanceOf(Date);
      expect(typeof afterDelete[0].motivo_anulacion).toBe("string");
      expect(afterDelete[0].motivo_anulacion.length).toBeGreaterThan(0);
    } finally {
      await cleanupFixture(fixture, groupPaymentId);
    }
  }, 15_000);
});
