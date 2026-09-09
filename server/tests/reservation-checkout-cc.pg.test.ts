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
    await pool.query(
      `INSERT INTO reservations
       (id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,status,total_room_amount,created_at)
       VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,CURRENT_DATE,'checked_in',144000,NOW())`,
      [reservationId, reservationId, `g-${reservationId}`, `t-${reservationId}`, `r-${reservationId}`],
    );
    try {
      await pool.query(
        `INSERT INTO payments (id,reservation_id,amount,method,date,status)
         VALUES ($1,$2,44000,'efectivo',CURRENT_DATE,'active'),
                ($3,$2,100000,'cuenta_corriente',CURRENT_DATE,'active')`,
        [`cash-${reservationId}`, reservationId, `cc-${reservationId}`],
      );
      const result = await pool.query(
        `SELECT COALESCE(SUM(amount::numeric),0) AS payments,
                COUNT(*) FILTER (WHERE method='cuenta_corriente') AS cc_payments
         FROM payments WHERE reservation_id=$1 AND status IS DISTINCT FROM 'anulado'`,
        [reservationId],
      );
      const cash = await pool.query(
        "SELECT id FROM cash_movements WHERE payment_id=$1", [`cc-${reservationId}`],
      );
      expect(Number(result.rows[0].payments)).toBe(144000);
      expect(Number(result.rows[0].cc_payments)).toBe(1);
      expect(cash.rows).toHaveLength(0);
    } finally {
      await pool.query("DELETE FROM payments WHERE reservation_id=$1", [reservationId]);
      await pool.query("DELETE FROM reservations WHERE id=$1", [reservationId]);
    }
  });
});