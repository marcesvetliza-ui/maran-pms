import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: (_roles: string[]) => (req: any, _res: any, next: () => void) => {
    req.user = { id: "cash-recovery-test", username: "tester", fullName: "Tester", role: "admin" };
    next();
  },
}));

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const testPool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 }) : null;
let server: http.Server | null = null;
let baseUrl = "";

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  return { response, body: await response.json() };
}

async function createPayment(method = "cash", groupPaymentId: string | null = null) {
  if (!testPool) throw new Error("DATABASE_URL no configurada");
  const suffix = randomUUID();
  const reservationId = `cash-recovery-res-${suffix}`;
  const paymentId = `cash-recovery-payment-${suffix}`;
  await testPool.query(
    `INSERT INTO reservations
      (id, reservation_code, guest_id, room_type_id, room_id, check_in_date, check_out_date, status, created_at)
     VALUES ($1, $2, $3, $4, $5, '2026-02-10', '2026-02-11', 'confirmed', NOW())`,
    [reservationId, `REC-${suffix}`, `guest-${suffix}`, `type-${suffix}`, `room-${suffix}`],
  );
  await testPool.query(
    `INSERT INTO payments (id, reservation_id, amount, method, date, status, group_payment_id)
     VALUES ($1, $2, '125.00', $3, '2026-02-10', 'active', $4)`,
    [paymentId, reservationId, method, groupPaymentId],
  );
  return { reservationId, paymentId };
}

async function createShift(suffix: string, number: number, openedAt = "2026-02-10T00:00:00Z", closedAt = "2026-02-10T23:59:00Z") {
  if (!testPool) throw new Error("DATABASE_URL no configurada");
  const id = `cash-recovery-shift-${suffix}-${number}`;
  await testPool.query(
    `INSERT INTO cash_shifts (id, area, shift_number, opened_at, closed_at, status)
     VALUES ($1, 'reception', $2, $3, $4, 'closed')`,
    [id, number, openedAt, closedAt],
  );
  return id;
}

async function cleanup(paymentId: string, reservationId: string, shiftIds: string[] = []) {
  if (!testPool) return;
  await testPool.query("DELETE FROM cash_movements WHERE payment_id = $1", [paymentId]);
  await testPool.query("DELETE FROM audit_logs WHERE details LIKE $1", [`%${paymentId}%`]);
  await testPool.query("DELETE FROM cash_closing_summaries WHERE shift_id = ANY($1::varchar[])", [shiftIds]);
  await testPool.query("DELETE FROM payments WHERE id = $1", [paymentId]);
  await testPool.query("DELETE FROM reservations WHERE id = $1", [reservationId]);
  await testPool.query("DELETE FROM cash_shifts WHERE id = ANY($1::varchar[])", [shiftIds]);
}

runIfDatabaseIsConfigured("PostgreSQL real: historical reservation cash recovery", () => {
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
    await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()) || resolve());
    await testPool?.end();
    const { pool } = await import("../db");
    await pool.end();
  });

  it("recovers an ordinary legacy payment once and is idempotent", async () => {
    const fixture = await createPayment();
    const shiftId = await createShift(randomUUID(), 951001);
    try {
      const first = await request(`/api/cash/reservation-payments/${fixture.paymentId}/repair-movement`, { method: "POST", body: "{}" });
      expect(first.response.status).toBe(201);
      const second = await request(`/api/cash/reservation-payments/${fixture.paymentId}/repair-movement`, { method: "POST", body: "{}" });
      expect(second.body).toMatchObject({ alreadyRepaired: true });
      const movements = await testPool!.query("SELECT count(*) FROM cash_movements WHERE payment_id = $1", [fixture.paymentId]);
      expect(movements.rows[0].count).toBe("1");
    } finally {
      await cleanup(fixture.paymentId, fixture.reservationId, [shiftId]);
    }
  });

  it("rejects paymentId on the generic cash movement endpoint", async () => {
    const fixture = await createPayment();
    const shiftId = await createShift(randomUUID(), 951006);
    try {
      const attempted = await request("/api/cash/movements", {
        method: "POST",
        body: JSON.stringify({
          shiftId,
          area: "reception",
          sourceType: "manual",
          receiptType: "ingreso_efectivo",
          description: "Ingreso manual",
          amount: "125.00",
          paymentId: fixture.paymentId,
        }),
      });
      expect(attempted.response.status).toBe(400);
      expect(attempted.body.error).toContain("paymentId no está permitido");
      const movements = await testPool!.query(
        "SELECT count(*) FROM cash_movements WHERE payment_id = $1",
        [fixture.paymentId],
      );
      expect(movements.rows[0].count).toBe("0");
    } finally {
      await cleanup(fixture.paymentId, fixture.reservationId, [shiftId]);
    }
  });

  it("requires a valid explicit candidate for ambiguous shifts", async () => {
    const fixture = await createPayment();
    const suffix = randomUUID();
    const firstShift = await createShift(suffix, 951002, "2026-02-10T00:00:00Z", "2026-02-10T12:00:00Z");
    const secondShift = await createShift(suffix, 951003, "2026-02-10T12:00:00Z", "2026-02-10T23:59:00Z");
    try {
      expect((await request(`/api/cash/reservation-payments/${fixture.paymentId}/repair-movement`, { method: "POST", body: "{}" })).response.status).toBe(409);
      expect((await request(`/api/cash/reservation-payments/${fixture.paymentId}/repair-movement`, { method: "POST", body: JSON.stringify({ shiftId: "not-a-candidate" }) })).response.status).toBe(400);
      const repaired = await request(`/api/cash/reservation-payments/${fixture.paymentId}/repair-movement`, { method: "POST", body: JSON.stringify({ shiftId: secondShift }) });
      expect(repaired.body).toMatchObject({ repaired: true, shiftId: secondShift });
    } finally {
      await cleanup(fixture.paymentId, fixture.reservationId, [firstShift, secondShift]);
    }
  });

  it("updates a closed shift summary when recovering a card payment", async () => {
    const fixture = await createPayment("tarjeta_debito");
    const shiftId = await createShift(randomUUID(), 951004);
    await testPool!.query("INSERT INTO cash_closing_summaries (id, shift_id, area) VALUES ($1, $2, 'reception')", [randomUUID(), shiftId]);
    try {
      expect((await request(`/api/cash/reservation-payments/${fixture.paymentId}/repair-movement`, { method: "POST", body: "{}" })).response.status).toBe(201);
      const summary = await testPool!.query("SELECT total_debit_card, total_general, transaction_count FROM cash_closing_summaries WHERE shift_id = $1", [shiftId]);
      expect(summary.rows[0]).toMatchObject({ total_debit_card: "125.00", total_general: "125.00", transaction_count: 1 });
    } finally {
      await cleanup(fixture.paymentId, fixture.reservationId, [shiftId]);
    }
  });

  it("reports and repairs CC/voucher informational movements, without cash income or expense", async () => {
    const nonCash = await createPayment("cuenta_corriente");
    const voucher = await createPayment("gift voucher");
    const alreadyCash = await createPayment("cash");
    const groupAllocated = await createPayment("cash", `group-${randomUUID()}`);
    const shiftId = await createShift(randomUUID(), 951005);
    await testPool!.query(
      `INSERT INTO cash_movements
        (id,shift_id,area,source_type,payment_method,amount,movement_type,payment_id)
       VALUES ($1,$2,'reception','reservation','cash','125.00','income',$3)`,
      [randomUUID(), shiftId, alreadyCash.paymentId],
    );
    try {
      const report = await request("/api/cash/reservation-payments/missing-movements");
      expect(report.body.map((row: any) => row.paymentId)).toContain(nonCash.paymentId);
      expect(report.body.map((row: any) => row.paymentId)).toContain(voucher.paymentId);
      expect(report.body.map((row: any) => row.paymentId)).not.toContain(alreadyCash.paymentId);
      expect(report.body.map((row: any) => row.paymentId)).not.toContain(groupAllocated.paymentId);
      expect((await request(`/api/cash/reservation-payments/${nonCash.paymentId}/repair-movement`, { method: "POST", body: "{}" })).response.status).toBe(201);
      expect((await request(`/api/cash/reservation-payments/${voucher.paymentId}/repair-movement`, { method: "POST", body: "{}" })).response.status).toBe(201);
      const movements = await testPool!.query(
        `SELECT movement_type, payment_method FROM cash_movements
         WHERE payment_id = ANY($1::varchar[])`, [[nonCash.paymentId, voucher.paymentId]],
      );
      expect(movements.rows).toHaveLength(2);
      expect(movements.rows.every((row: any) => row.movement_type === "informational")).toBe(true);
      expect(movements.rows.map((row: any) => row.payment_method).sort()).toEqual(["current_account", "voucher"]);
      expect((await request(`/api/cash/reservation-payments/${groupAllocated.paymentId}/repair-movement`, { method: "POST", body: "{}" })).response.status).toBe(409);
    } finally {
      await cleanup(nonCash.paymentId, nonCash.reservationId, [shiftId]);
      await cleanup(voucher.paymentId, voucher.reservationId, [shiftId]);
      await cleanup(alreadyCash.paymentId, alreadyCash.reservationId, [shiftId]);
      await cleanup(groupAllocated.paymentId, groupAllocated.reservationId);
    }
  });
});