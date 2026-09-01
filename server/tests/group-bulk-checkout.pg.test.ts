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

  it("closes only the selected subset of three rooms and leaves the group active", async () => {
    if (!testPool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const groupId = `pg-directed-close-group-${suffix}`;
    const roomTypeId = `pg-directed-close-type-${suffix}`;
    const roomIds = ["a", "b", "c"].map((key) => `pg-directed-close-room-${key}-${suffix}`);
    const reservationIds = ["a", "b", "c"].map((key) => `pg-directed-close-res-${key}-${suffix}`);
    const shiftId = `pg-directed-close-shift-${suffix}`;
    let paymentId = "";
    try {
      await testPool.query(
        `INSERT INTO room_types (id, code, name) VALUES ($1, $2, 'PG Directed Close')`,
        [roomTypeId, `PGDC-${suffix}`],
      );
      for (let index = 0; index < roomIds.length; index++) {
        await testPool.query(
          `INSERT INTO rooms (id, room_number, room_type_id, status) VALUES ($1, $2, $3, $4)`,
          [roomIds[index], `PGDC-${index + 1}-${suffix.slice(0, 6)}`, roomTypeId, index === 1 ? "available" : "occupied"],
        );
      }
      await testPool.query(
        `INSERT INTO groups (id, group_code, name, check_in_date, check_out_date, status, created_at)
         VALUES ($1, $2, 'PG Directed Close', DATE '2026-09-01', DATE '2026-09-02', 'inhouse', NOW())`,
        [groupId, `PGDC-${suffix}`],
      );
      const amounts = ["100.00", "0.00", "300.00"];
      const statuses = ["checked_in", "confirmed", "checked_in"];
      for (let index = 0; index < reservationIds.length; index++) {
        await testPool.query(
          `INSERT INTO reservations
            (id, reservation_code, guest_id, room_type_id, room_id, check_in_date, check_out_date, total_room_amount, status, created_at)
           VALUES ($1, $2, $3, $4, $5, DATE '2026-09-01', DATE '2026-09-02', $6, $7, NOW())`,
          [reservationIds[index], `PGDC-RES-${index}-${suffix}`, `pgdc-guest-${index}-${suffix}`, roomTypeId, roomIds[index], amounts[index], statuses[index]],
        );
        await testPool.query(
          `INSERT INTO group_reservation_links (id, group_id, reservation_id) VALUES ($1, $2, $3)`,
          [`pgdc-link-${index}-${suffix}`, groupId, reservationIds[index]],
        );
      }
      await testPool.query(
        `INSERT INTO cash_shifts (id, area, shift_number, opened_by, opened_at, status, notes, created_at)
         VALUES ($1, 'reception', 999999, 'pg-test', NOW() + INTERVAL '1 minute', 'open', 'fixture cierre dirigido', NOW())`,
        [shiftId],
      );

      const result = await storage.recordGroupPayment({
        groupId,
        destination: "group_distribution",
        paymentRows: [{ method: "efectivo", amount: "100.00", reference: "PG-DIRECTED" }],
        date: "2026-09-01",
        reference: "PG-DIRECTED",
        distribution: "selected_rooms",
        distributionDetail: { [reservationIds[0]]: 100 },
        receivedBy: "pg-test",
        cashLabel: "PG cierre dirigido",
        receiptType: "none",
        closeReservationIds: reservationIds.slice(0, 2),
      });
      paymentId = result.groupPayment.id;
      expect(result.closedReservations).toEqual({ processed: 2, checkedIn: 1, confirmed: 1 });
      expect(result.reservationPayments).toHaveLength(1);
      expect(result.reservationPayments[0]).toMatchObject({ reservationId: reservationIds[0], amount: "100.00" });

      const reservationRows = await testPool.query(
        "SELECT id, status FROM reservations WHERE id = ANY($1::text[]) ORDER BY id",
        [reservationIds],
      );
      expect(Object.fromEntries(reservationRows.rows.map((row) => [row.id, row.status]))).toEqual({
        [reservationIds[0]]: "checked_out",
        [reservationIds[1]]: "checked_out",
        [reservationIds[2]]: "checked_in",
      });
      const roomRows = await testPool.query(
        "SELECT id, status FROM rooms WHERE id = ANY($1::text[]) ORDER BY id",
        [roomIds],
      );
      expect(Object.fromEntries(roomRows.rows.map((row) => [row.id, row.status]))).toEqual({
        [roomIds[0]]: "dirty",
        [roomIds[1]]: "available",
        [roomIds[2]]: "occupied",
      });
      expect((await testPool.query("SELECT status FROM groups WHERE id = $1", [groupId])).rows[0].status).toBe("inhouse");
      expect((await testPool.query(
        "SELECT distribution_detail FROM group_payments WHERE id = $1",
        [paymentId],
      )).rows[0].distribution_detail).toEqual({ [reservationIds[0]]: 100 });
      expect((await testPool.query(
        "SELECT reservation_id FROM payments WHERE group_payment_id = $1 ORDER BY reservation_id",
        [paymentId],
      )).rows.map((row) => row.reservation_id)).toEqual([reservationIds[0]]);
      expect((await testPool.query(
        "SELECT COUNT(*)::int AS count FROM reservation_changelog WHERE reservation_id = ANY($1::text[])",
        [reservationIds.slice(0, 2)],
      )).rows[0].count).toBe(2);
      expect((await testPool.query(
        "SELECT COUNT(*)::int AS count FROM housekeeping_tasks WHERE room_id = $1 AND status = 'pending'",
        [roomIds[0]],
      )).rows[0].count).toBe(1);
    } finally {
      await testPool.query("DELETE FROM reservation_changelog WHERE reservation_id = ANY($1::text[])", [reservationIds]);
      await testPool.query("DELETE FROM housekeeping_tasks WHERE room_id = ANY($1::text[])", [roomIds]);
      if (paymentId) {
        await testPool.query("DELETE FROM cash_movements WHERE payment_id = $1", [paymentId]);
        await testPool.query("DELETE FROM payments WHERE group_payment_id = $1", [paymentId]);
        await testPool.query("DELETE FROM group_payments WHERE id = $1", [paymentId]);
      }
      await testPool.query("DELETE FROM cash_shifts WHERE id = $1", [shiftId]);
      await testPool.query("DELETE FROM group_reservation_links WHERE group_id = $1", [groupId]);
      await testPool.query("DELETE FROM reservations WHERE id = ANY($1::text[])", [reservationIds]);
      await testPool.query("DELETE FROM rooms WHERE id = ANY($1::text[])", [roomIds]);
      await testPool.query("DELETE FROM room_types WHERE id = $1", [roomTypeId]);
      await testPool.query("DELETE FROM groups WHERE id = $1", [groupId]);
    }
  });
});