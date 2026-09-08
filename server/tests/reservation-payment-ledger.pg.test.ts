import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { storage } from "../db-storage";

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const testPool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  : null;

async function createReservation(id: string) {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  await testPool.query(
    `INSERT INTO reservations
      (id, reservation_code, guest_id, room_type_id, room_id, check_in_date, check_out_date, status, created_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, CURRENT_DATE + 1, 'confirmed', NOW())`,
    [id, `LEDGER-${id}`, `guest-${id}`, `type-${id}`, `room-${id}`],
  );
}

async function cleanupReservation(id: string) {
  if (!testPool) return;
  await testPool.query(
    `DELETE FROM folio_movements WHERE folio_id IN
       (SELECT id FROM folios WHERE entity_type = 'reservation' AND entity_id = $1)`,
    [id],
  );
  await testPool.query("DELETE FROM folios WHERE entity_type = 'reservation' AND entity_id = $1", [id]);
  await testPool.query("DELETE FROM cash_movements WHERE source_id = $1", [id]);
  await testPool.query("DELETE FROM payments WHERE reservation_id = $1", [id]);
  await testPool.query("DELETE FROM reservations WHERE id = $1", [id]);
}

runIfDatabaseIsConfigured("PostgreSQL real: reservation payment ledger transaction", () => {
  afterAll(async () => {
    await testPool?.end();
    const { pool } = await import("../db");
    await pool.end();
  });

  it("creates the payment, reception cash movement, and folio movement together", async () => {
    if (!testPool) return;
    const suffix = randomUUID();
    const reservationId = `reservation-ledger-success-${suffix}`;
    const shiftId = `reservation-ledger-shift-${suffix}`;
    await createReservation(reservationId);
    await testPool.query(
      `INSERT INTO cash_shifts (id, area, shift_number, opened_at, status)
       VALUES ($1, 'reception', 900001, NOW(), 'open')`,
      [shiftId],
    );
    try {
      const payment = await storage.createReservationPaymentWithLedger({
        payment: {
          reservationId, amount: "125.00", method: "efectivo",
          date: "2026-01-01", notes: "Prueba atómica",
        },
        sourceLabel: "Reserva de prueba",
      });
      const cash = await testPool.query(
        "SELECT shift_id, area, payment_id, payment_method, amount FROM cash_movements WHERE payment_id = $1",
        [payment.id],
      );
      const folio = await testPool.query(
        `SELECT fm.source_id, fm.cash_movement_id, f.total_payments, f.balance
         FROM folio_movements fm JOIN folios f ON f.id = fm.folio_id
         WHERE fm.source_id = $1`,
        [payment.id],
      );
      expect(cash.rows).toEqual([expect.objectContaining({
        shift_id: shiftId, area: "reception", payment_id: payment.id,
        payment_method: "cash", amount: "125.00",
      })]);
      expect(folio.rows).toEqual([expect.objectContaining({
        source_id: payment.id, cash_movement_id: expect.any(String),
        total_payments: "125.00", balance: "-125.00",
      })]);
    } finally {
      await cleanupReservation(reservationId);
      await testPool.query("DELETE FROM cash_shifts WHERE id = $1", [shiftId]);
    }
  });

  it("rolls back the payment and folio when the cash movement insert fails", async () => {
    if (!testPool) return;
    const reservationId = `reservation-ledger-cash-failure-${randomUUID()}`;
    const shiftId = `reservation-ledger-failure-shift-${randomUUID()}`;
    await createReservation(reservationId);
    // This fixture makes the operation reach INSERT cash_movements. The NUL
    // below then deterministically fails that insert rather than the shift
    // lookup, proving all prior writes roll back.
    await testPool.query(
      `INSERT INTO cash_shifts (id, area, shift_number, opened_at, status)
       VALUES ($1, 'reception', 900002, NOW(), 'open')`,
      [shiftId],
    );
    try {
      await expect(storage.createReservationPaymentWithLedger({
        payment: { reservationId, amount: "25.00", method: "cash", date: "2026-01-01" },
        // PostgreSQL text rejects NUL bytes. The payment insert succeeds first
        // inside the transaction and the cash insert then fails on this value.
        sourceLabel: "\0",
      })).rejects.toBeTruthy();
      const persisted = await testPool.query(
        `SELECT
           (SELECT count(*) FROM payments WHERE reservation_id = $1) AS payments,
           (SELECT count(*) FROM cash_movements WHERE source_id = $1) AS cash,
           (SELECT count(*) FROM folios WHERE entity_type = 'reservation' AND entity_id = $1) AS folios`,
        [reservationId],
      );
      expect(persisted.rows[0]).toMatchObject({ payments: "0", cash: "0", folios: "0" });
    } finally {
      await cleanupReservation(reservationId);
      await testPool.query("DELETE FROM cash_shifts WHERE id = $1", [shiftId]);
    }
  });

  it("records a non-cash room charge in the folio without a cash movement", async () => {
    if (!testPool) return;
    const reservationId = `reservation-ledger-room-charge-${randomUUID()}`;
    await createReservation(reservationId);
    try {
      const payment = await storage.createReservationPaymentWithLedger({
        payment: { reservationId, amount: "40.00", method: "cargo_habitacion", date: "2026-01-01" },
        sourceLabel: "Cargo a habitación",
      });
      const cash = await testPool.query("SELECT count(*) FROM cash_movements WHERE payment_id = $1", [payment.id]);
      const folio = await testPool.query(
        "SELECT count(*) FROM folio_movements WHERE source_type = 'payment' AND source_id = $1",
        [payment.id],
      );
      expect(cash.rows[0].count).toBe("0");
      expect(folio.rows[0].count).toBe("1");
    } finally {
      await cleanupReservation(reservationId);
    }
  });

  it("keeps folio totals correct for concurrent payments to an existing folio", async () => {
    if (!testPool) return;
    const reservationId = `reservation-ledger-concurrent-${randomUUID()}`;
    await createReservation(reservationId);
    try {
      // Establish the folio first, so all parallel transactions exercise the
      // existing-row FOR UPDATE path rather than folio creation serialization.
      await storage.createReservationPaymentWithLedger({
        payment: { reservationId, amount: "1.00", method: "cargo_habitacion", date: "2026-01-01" },
        sourceLabel: "Inicial",
      });
      await Promise.all(Array.from({ length: 8 }, () =>
        storage.createReservationPaymentWithLedger({
          payment: { reservationId, amount: "1.00", method: "cargo_habitacion", date: "2026-01-01" },
          sourceLabel: "Concurrente",
        }),
      ));
      const totals = await testPool.query(
        "SELECT total_payments, balance FROM folios WHERE entity_type = 'reservation' AND entity_id = $1",
        [reservationId],
      );
      expect(totals.rows).toEqual([expect.objectContaining({ total_payments: "9.00", balance: "-9.00" })]);
    } finally {
      await cleanupReservation(reservationId);
    }
  });

  it("rejects malformed, over-precision, non-positive, overflowing, and unsupported inputs before persistence", async () => {
    if (!testPool) return;
    const reservationId = `reservation-ledger-validation-${randomUUID()}`;
    await createReservation(reservationId);
    try {
      for (const payment of [
        { amount: "0", method: "cash" },
        { amount: "12.345", method: "cash" },
        { amount: "12.", method: "cash" },
        { amount: "100000000.00", method: "cash" },
        { amount: "1.00", method: "unsupported" },
      ]) {
        await expect(storage.createReservationPaymentWithLedger({
          payment: { reservationId, ...payment, date: "2026-01-01" },
          sourceLabel: "Entrada inválida",
        })).rejects.toMatchObject({ statusCode: 400 });
      }
      const payments = await testPool.query("SELECT count(*) FROM payments WHERE reservation_id = $1", [reservationId]);
      expect(payments.rows[0].count).toBe("0");
    } finally {
      await cleanupReservation(reservationId);
    }
  });
});