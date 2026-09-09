import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { storage } from "../db-storage";

const enabled = Boolean(process.env.DATABASE_URL);
const suite = enabled ? describe : describe.skip;
const pool = enabled ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 }) : null;

suite("PostgreSQL: reception close non-cash settlement summary", () => {
  afterAll(async () => { await pool?.end(); });

  it("keeps physical cash unchanged while persisting CC/voucher reconciliation", async () => {
    if (!pool) return;
    const shiftId = `summary-shift-${randomUUID()}`;
    await pool.query(
      `INSERT INTO cash_shifts (id, area, shift_number, opened_at, status)
       VALUES ($1, 'reception', floor(random()*1000000)::int, NOW(), 'open')`,
      [shiftId],
    );
    try {
      const movement = async (method: string, amount: string, type: string) => {
        await pool!.query(
          `INSERT INTO cash_movements
             (id,shift_id,area,source_type,payment_method,amount,movement_type,anulado)
           VALUES ($1,$2,'reception','reservation',$3,$4,$5,false)`,
          [randomUUID(), shiftId, method, amount, type],
        );
      };
      await movement("cash", "44000.00", "income");
      await movement("current_account", "100000.00", "informational");
      await movement("voucher", "25000.00", "informational");

      const result = await storage.closeShift(shiftId, "pg-test", 44000);
      expect(result.summary.totalCash).toBe("44000.00");
      expect(result.summary.totalCurrentAccount).toBe("100000.00");
      expect(result.summary.totalVoucher).toBe("25000.00");
      expect(result.summary.nonCashSettlementsTotal).toBe("125000.00");
      expect(result.summary.nonCashSettlementsCount).toBe(2);
      expect(result.summary.totalGeneral).toBe("44000.00");
      expect(result.turnoNuevo.status).toBe("open");
      const persisted = await pool.query(
        `SELECT total_cash,total_current_account,total_voucher,
                non_cash_settlements_total,non_cash_settlements_count,total_general
         FROM cash_closing_summaries WHERE shift_id=$1`, [shiftId],
      );
      expect(persisted.rows[0]).toMatchObject({
        total_cash: "44000.00", total_current_account: "100000.00",
        total_voucher: "25000.00", non_cash_settlements_total: "125000.00",
        non_cash_settlements_count: 2, total_general: "44000.00",
      });
    } finally {
      await pool.query("DELETE FROM cash_movements WHERE shift_id=$1", [shiftId]);
      await pool.query("DELETE FROM cash_closing_summaries WHERE shift_id=$1", [shiftId]);
      await pool.query("DELETE FROM cash_shifts WHERE id=$1 OR turno_anterior_id=$1", [shiftId]);
    }
  });
});