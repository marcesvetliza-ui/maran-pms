import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const testPool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : null;
let storage: typeof import("../db-storage").storage;

async function waitForBlockedQuery(blockerPid: number, fragment: string) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await testPool!.query(
      `SELECT pid FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'
         AND $1 = ANY(pg_blocking_pids(pid)) AND query ILIKE $2`,
      [blockerPid, `%${fragment}%`],
    );
    if (result.rowCount) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`No blocked query observed: ${fragment}`);
}

suite("PostgreSQL: collecting a restaurant payment during shift closure", () => {
  beforeAll(async () => {
    ({ storage } = await import("../db-storage"));
  });

  afterAll(async () => {
    await testPool?.end();
    if (testPool) {
      const { pool } = await import("../db");
      await pool.end();
    }
  });

  it.each(["payment-first", "closure-first"] as const)(
    "keeps the movement and closing summary consistent (%s)",
    async (schedule) => {
      // A unique area isolates the shift search and cleanup from other suites.
      // This exercises registerCashMovement, the storage path used by restaurant.
      const area = `shift-race-${randomUUID()}`;
      const sourceId = randomUUID();
      const shift = await storage.openShift({ area, openedBy: "race-test" });
      const blocker = await testPool!.connect();
      const { rows: [{ pid: blockerPid }] } = await blocker.query("SELECT pg_backend_pid() AS pid");
      let payment: ReturnType<typeof storage.registerCashMovement> | undefined;
      let closure: ReturnType<typeof storage.closeShift> | undefined;
      const collect = () => storage.registerCashMovement(
        area, "restaurant_order", sourceId, "Restaurant race test", "cash", "10000.00",
      );
      try {
        await blocker.query("BEGIN");
        if (schedule === "payment-first") {
          await blocker.query("LOCK TABLE cash_movements IN SHARE MODE");
          payment = collect();
          await waitForBlockedQuery(blockerPid, 'insert into "cash_movements"');
          // The payment must hold the shift lock until its insert commits.
          closure = storage.closeShift(shift.id, "race-test");
          const { rows: [{ pid: paymentPid }] } = await testPool!.query(
            `SELECT pid FROM pg_stat_activity
             WHERE $1 = ANY(pg_blocking_pids(pid)) AND query ILIKE '%insert into "cash_movements"%'`,
            [blockerPid],
          );
          await waitForBlockedQuery(paymentPid, "cash_shifts");
        } else {
          await blocker.query("LOCK TABLE cash_closing_summaries IN SHARE MODE");
          closure = storage.closeShift(shift.id, "race-test");
          await waitForBlockedQuery(blockerPid, 'insert into "cash_closing_summaries"');
          payment = collect();
          const { rows: [{ pid: closurePid }] } = await testPool!.query(
            `SELECT pid FROM pg_stat_activity
             WHERE $1 = ANY(pg_blocking_pids(pid)) AND query ILIKE '%insert into "cash_closing_summaries"%'`,
            [blockerPid],
          );
          await waitForBlockedQuery(closurePid, "cash_shifts");
        }

        await blocker.query("COMMIT");
        const [movement, closed] = await Promise.all([payment!, closure!]);
        expect(movement.shiftId).toBe(
          schedule === "payment-first" ? shift.id : closed.turnoNuevo.id,
        );
        expect(Number(closed.summary.totalGeneral)).toBe(schedule === "payment-first" ? 10000 : 0);
        expect(closed.summary.transactionCount).toBe(schedule === "payment-first" ? 1 : 0);
        const persisted = await testPool!.query(
          "SELECT shift_id, amount FROM cash_movements WHERE source_id = $1", [sourceId],
        );
        expect(persisted.rows).toEqual([{ shift_id: movement.shiftId, amount: "10000.00" }]);
        expect((await storage.getCurrentShift(area))?.id).toBe(closed.turnoNuevo.id);
      } finally {
        await blocker.query("ROLLBACK");
        blocker.release();
        // Release the database pause before waiting or deleting fixtures,
        // including when an assertion fails against the unpatched code.
        await Promise.allSettled([payment, closure]);
        await testPool!.query("DELETE FROM cash_movements WHERE source_id = $1", [sourceId]);
        await testPool!.query("DELETE FROM cash_closing_summaries WHERE area = $1", [area]);
        await testPool!.query("DELETE FROM cash_shifts WHERE area = $1", [area]);
      }
    },
    20000,
  );
});
