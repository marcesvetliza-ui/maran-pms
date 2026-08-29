import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { storage } from "../db-storage";

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const testPool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;

runIfDatabaseIsConfigured("group bulk checkout operational ledger", () => {
  const ids = {
    suffix: randomUUID(),
    groupId: "",
    reservationId: "",
    roomId: "",
    roomTypeId: "",
  };
  ids.groupId = `pg-checkout-group-${ids.suffix}`;
  ids.reservationId = `pg-checkout-reservation-${ids.suffix}`;
  ids.roomId = `pg-checkout-room-${ids.suffix}`;
  ids.roomTypeId = `pg-checkout-room-type-${ids.suffix}`;

  afterAll(async () => {
    if (!testPool) return;
    await testPool.query("DELETE FROM payments WHERE reservation_id = $1", [ids.reservationId]);
    await testPool.query("DELETE FROM group_payments WHERE group_id = $1", [ids.groupId]);
    await testPool.query("DELETE FROM group_reservation_links WHERE group_id = $1", [ids.groupId]);
    await testPool.query("DELETE FROM reservations WHERE id = $1", [ids.reservationId]);
    await testPool.query("DELETE FROM rooms WHERE id = $1", [ids.roomId]);
    await testPool.query("DELETE FROM room_types WHERE id = $1", [ids.roomTypeId]);
    await testPool.query("DELETE FROM groups WHERE id = $1", [ids.groupId]);
    await testPool.end();
  });

  it("checks out a room paid by parent group receipts and their child allocations", async () => {
    if (!testPool) throw new Error("DATABASE_URL no está configurado");
    await testPool.query(`INSERT INTO room_types (id, code, name) VALUES ($1, $2, 'PG Checkout')`,
      [ids.roomTypeId, `PGCO-${ids.suffix}`]);
    await testPool.query(`INSERT INTO rooms (id, room_number, room_type_id, status) VALUES ($1, $2, $3, 'occupied')`,
      [ids.roomId, `PGCO-${ids.suffix.slice(0, 8)}`, ids.roomTypeId]);
    await testPool.query(`INSERT INTO groups (id, group_code, name, check_in_date, check_out_date, status, created_at)
      VALUES ($1, $2, 'PG Checkout', DATE '2026-08-26', DATE '2026-08-27', 'inhouse', NOW())`,
      [ids.groupId, `PGCO-${ids.suffix}`]);
    await testPool.query(`INSERT INTO reservations
      (id, reservation_code, guest_id, room_type_id, room_id, check_in_date, check_out_date, total_room_amount, status, created_at)
      VALUES ($1, $2, $3, $4, $5, DATE '2026-08-26', DATE '2026-08-27', '360000.00', 'checked_in', NOW())`,
      [ids.reservationId, `PGCO-RES-${ids.suffix}`, `pgco-guest-${ids.suffix}`, ids.roomTypeId, ids.roomId]);
    await testPool.query(`INSERT INTO group_reservation_links (id, group_id, reservation_id) VALUES ($1, $2, $3)`,
      [`pgco-link-${ids.suffix}`, ids.groupId, ids.reservationId]);

    for (const amount of ["60000.00", "30000.00", "270000.00"]) {
      const paymentId = `pgco-parent-${amount}-${ids.suffix}`;
      await testPool.query(`INSERT INTO group_payments (id, group_id, amount, method, date, distribution, destination)
        VALUES ($1, $2, $3, 'efectivo', DATE '2026-08-26', 'equal', 'group_distribution')`,
        [paymentId, ids.groupId, amount]);
      await testPool.query(`INSERT INTO payments (id, reservation_id, amount, method, date, status, group_payment_id)
        VALUES ($1, $2, $3, 'efectivo', DATE '2026-08-26', 'active', $4)`,
        [`pgco-child-${amount}-${ids.suffix}`, ids.reservationId, amount, paymentId]);
    }

    const result = await storage.bulkCheckOut(ids.groupId);
    expect(result).toMatchObject({ processed: 1, skipped: 0, pendingBalance: [] });
    expect((await testPool.query("SELECT status FROM reservations WHERE id = $1", [ids.reservationId])).rows[0].status).toBe("checked_out");
    expect((await testPool.query("SELECT status FROM rooms WHERE id = $1", [ids.roomId])).rows[0].status).toBe("dirty");
    expect((await testPool.query("SELECT status FROM groups WHERE id = $1", [ids.groupId])).rows[0].status).toBe("finished");
  });

  it("keeps an unpaid checked-in room pending", async () => {
    if (!testPool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const groupId = `pg-checkout-unpaid-group-${suffix}`;
    const reservationId = `pg-checkout-unpaid-reservation-${suffix}`;
    try {
      await testPool.query(`UPDATE rooms SET status = 'occupied' WHERE id = $1`, [ids.roomId]);
      await testPool.query(`INSERT INTO groups (id, group_code, name, check_in_date, check_out_date, status, created_at)
        VALUES ($1, $2, 'PG Checkout impago', DATE '2026-08-26', DATE '2026-08-27', 'inhouse', NOW())`,
        [groupId, `PGCO-U-${suffix}`]);
      await testPool.query(`INSERT INTO reservations
        (id, reservation_code, guest_id, room_type_id, room_id, check_in_date, check_out_date, total_room_amount, status, created_at)
        VALUES ($1, $2, $3, $4, $5, DATE '2026-08-26', DATE '2026-08-27', '1.00', 'checked_in', NOW())`,
        [reservationId, `PGCO-U-RES-${suffix}`, `pgco-u-guest-${suffix}`, ids.roomTypeId, ids.roomId]);
      await testPool.query(`INSERT INTO group_reservation_links (id, group_id, reservation_id) VALUES ($1, $2, $3)`,
        [`pgco-u-link-${suffix}`, groupId, reservationId]);

      const result = await storage.bulkCheckOut(groupId);
      expect(result).toMatchObject({ processed: 0, skipped: 1 });
      expect(result.pendingBalance[0]?.balance).toBe(1);
      expect((await testPool.query("SELECT status FROM reservations WHERE id = $1", [reservationId])).rows[0].status).toBe("checked_in");
    } finally {
      await testPool.query("DELETE FROM group_reservation_links WHERE reservation_id = $1", [reservationId]);
      await testPool.query("DELETE FROM reservations WHERE id = $1", [reservationId]);
      await testPool.query("DELETE FROM groups WHERE id = $1", [groupId]);
    }
  });
});