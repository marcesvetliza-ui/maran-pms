import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { storage } from "../db-storage";

const enabled = Boolean(process.env.DATABASE_URL);
const suite = enabled ? describe : describe.skip;
const pool = enabled ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 }) : null;

suite("PostgreSQL: read-only cash history dates", () => {
  afterAll(async () => { await pool?.end(); });

  it("lists a midnight closing on the Argentine closing day, not the opening day", async () => {
    if (!pool) return;
    const shiftId = `history-date-${randomUUID()}`;
    const summaryId = `history-summary-${randomUUID()}`;
    await pool.query(
      `INSERT INTO cash_shifts (id, area, shift_number, opened_at, closed_at, status)
       VALUES ($1, 'restaurant', floor(random()*1000000)::int, '2026-09-25 23:50:00', '2026-09-26 03:03:00', 'closed')`,
      [shiftId],
    );
    try {
      await pool.query(
        `INSERT INTO cash_closing_summaries (id, shift_id, area, total_general, closed_at)
         VALUES ($1, $2, 'restaurant', '602900.00', '2026-09-26 03:03:00')`,
        [summaryId, shiftId],
      );
      const closingDay = await storage.getCashSummary("restaurant", "2026-09-26", "2026-09-26");
      expect(closingDay.some((entry) => entry.shiftId === shiftId)).toBe(true);
      const openingDay = await storage.getCashSummary("restaurant", "2026-09-25", "2026-09-25");
      expect(openingDay.some((entry) => entry.shiftId === shiftId)).toBe(false);
    } finally {
      await pool.query("DELETE FROM cash_closing_summaries WHERE id=$1", [summaryId]);
      await pool.query("DELETE FROM cash_shifts WHERE id=$1", [shiftId]);
    }
  });

  it("assigns a cancelled restaurant order to the shift when it was cancelled", async () => {
    if (!pool) return;
    const orderId = `history-cancel-${randomUUID()}`;
    await pool.query(
      `INSERT INTO restaurant_orders (id, order_number, status, opened_at, closed_at, cancellation_reason)
       VALUES ($1, $2, 'cancelled', '2026-09-25 23:50:00', '2026-09-26 03:03:00', 'Prueba de historial')`,
      [orderId, orderId],
    );
    try {
      const from = "2026-09-26T03:00:00.000Z";
      const to = "2026-09-26T03:05:00.000Z";
      const duringCancellation = await storage.getRestaurantOrders("cancelled", from, to);
      expect(duringCancellation.some((order) => order.id === orderId)).toBe(true);
      const duringOpening = await storage.getRestaurantOrders(
        "cancelled", "2026-09-25T23:45:00.000Z", "2026-09-25T23:55:00.000Z",
      );
      expect(duringOpening.some((order) => order.id === orderId)).toBe(false);
    } finally {
      await pool.query("DELETE FROM restaurant_orders WHERE id=$1", [orderId]);
    }
  });
});