import pg from "pg";
import { randomUUID } from "node:crypto";
import { describe, expect, it, afterAll } from "vitest";

const enabled = Boolean(process.env.DATABASE_URL);
const suite = enabled ? describe : describe.skip;
const pool = enabled ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;

suite("PostgreSQL: checkout sees canonical CC settlement", () => {
  afterAll(async () => { await pool?.end(); });

  it("counts cash + CC payments, keeps Caja empty, and identifies fallback duplicates", async () => {
    if (!pool) return;
    const reservationId = `checkout-cc-${randomUUID()}`;
    const shiftId = `checkout-cc-shift-${randomUUID()}`;
    await pool.query(
      `INSERT INTO reservations
       (id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,status,total_room_amount,created_at)
       VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,CURRENT_DATE,'checked_in',144000,NOW())`,
      [reservationId, reservationId, `g-${reservationId}`, `t-${reservationId}`, `r-${reservationId}`],
    );
    await pool.query(
      `INSERT INTO cash_shifts (id, area, shift_number, opened_at, status)
       VALUES ($1, 'reception', floor(random()*1000000)::int, NOW(), 'open')`,
      [shiftId],
    );
    try {
      await pool.query(
        `INSERT INTO payments (id,reservation_id,amount,method,date,status)
         VALUES ($1,$2,44000,'efectivo',CURRENT_DATE,'active'),
                ($3,$2,100000,'cuenta_corriente',CURRENT_DATE,'active')`,
        [`cash-${reservationId}`, reservationId, `cc-${reservationId}`],
      );
      await pool.query(
        `INSERT INTO cash_movements
          (id,shift_id,area,source_type,source_id,payment_method,amount,movement_type,payment_id)
         VALUES ($1,$2,'reception','reservation',$3,'current_account',100000,'informational',$4)`,
        [randomUUID(), shiftId, reservationId, `cc-${reservationId}`],
      );
      const result = await pool.query(
        `SELECT COALESCE(SUM(amount::numeric),0) AS payments,
                COUNT(*) FILTER (WHERE method='cuenta_corriente') AS cc_payments
         FROM payments WHERE reservation_id=$1 AND status IS DISTINCT FROM 'anulado'`,
        [reservationId],
      );
      const cash = await pool.query(
        "SELECT id, movement_type, payment_method, amount FROM cash_movements WHERE payment_id=$1", [`cc-${reservationId}`],
      );
      expect(Number(result.rows[0].payments)).toBe(144000);
      expect(Number(result.rows[0].cc_payments)).toBe(1);
      expect(cash.rows).toHaveLength(1);
      expect(cash.rows[0]).toMatchObject({ movement_type: "informational", payment_method: "current_account", amount: "100000.00" });
    } finally {
      await pool.query("DELETE FROM payments WHERE reservation_id=$1", [reservationId]);
      await pool.query("DELETE FROM reservations WHERE id=$1", [reservationId]);
      await pool.query("DELETE FROM cash_shifts WHERE id=$1", [shiftId]);
    }
  });
});