import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function isDisposableTestDatabase(connectionString: string | undefined): boolean {
  if (!connectionString) return false;
  try {
    const databaseName = decodeURIComponent(new URL(connectionString).pathname.replace(/^\/+/, ""));
    return /(?:^|[_-])(?:test|testing|ci|disposable)(?:$|[_-])/i.test(databaseName);
  } catch {
    return false;
  }
}

const explicitlyEnabled = process.env.CASH_SHIFT_ALIAS_TEST_DATABASE === "1" || process.env.CI === "true";
if (explicitlyEnabled && !isDisposableTestDatabase(process.env.DATABASE_URL)) {
  throw new Error(
    "Cash shift alias PostgreSQL tests require DATABASE_URL to target a test/CI/disposable database.",
  );
}

const runPostgresTests = explicitlyEnabled ? describe : describe.skip;
const testPool = explicitlyEnabled
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  : null;
let storage: typeof import("../db-storage").storage;

async function insertShift(
  id: string,
  area: string,
  openedAtSql: "NOW() + INTERVAL '1 minute'" | "NOW() + INTERVAL '2 minutes'" | "NOW() - INTERVAL '1 day'",
  status: "open" | "closed" = "open",
) {
  if (!testPool) throw new Error("PostgreSQL test database was not enabled.");
  await testPool.query(
    `INSERT INTO cash_shifts (id, area, shift_number, opened_at, status)
     VALUES ($1, $2, 950001, ${openedAtSql}, $3)`,
    [id, area, status],
  );
}

async function removeFixtures(shiftIds: string[], movementIds: string[] = [], sourceIds: string[] = []) {
  if (!testPool) return;
  if (movementIds.length || sourceIds.length) {
    await testPool.query(
      "DELETE FROM cash_movements WHERE id = ANY($1::varchar[]) OR source_id = ANY($2::varchar[])",
      [movementIds, sourceIds],
    );
  }
  if (shiftIds.length) {
    await testPool.query("DELETE FROM cash_shifts WHERE id = ANY($1::varchar[])", [shiftIds]);
  }
}

runPostgresTests("PostgreSQL: cash shift alias routing", () => {
  beforeAll(async () => {
    ({ storage } = await import("../db-storage"));
  });

  afterAll(async () => {
    await testPool?.end();
    if (explicitlyEnabled) {
      const { pool } = await import("../db");
      await pool.end();
    }
  });

  it.each([
    {
      label: "reception first, recepcion newer",
      firstArea: "reception",
      newerArea: "recepcion",
      queryAreas: ["reception", "recepcion"],
    },
    {
      label: "recepcion first, reception newer",
      firstArea: "recepcion",
      newerArea: "reception",
      queryAreas: ["reception", "recepcion"],
    },
    {
      label: "eventos first, events newer",
      firstArea: "eventos",
      newerArea: "events",
      queryAreas: ["eventos", "events"],
    },
    {
      label: "events first, eventos newer",
      firstArea: "events",
      newerArea: "eventos",
      queryAreas: ["eventos", "events"],
    },
  ])("finds the newest open shift regardless of alias ($label)", async ({
    firstArea,
    newerArea,
    queryAreas,
  }) => {
    const firstId = randomUUID();
    const newerId = randomUUID();
    try {
      await insertShift(firstId, firstArea, "NOW() + INTERVAL '1 minute'");
      await insertShift(newerId, newerArea, "NOW() + INTERVAL '2 minutes'");

      for (const area of queryAreas) {
        expect((await storage.getCurrentShift(area))?.id).toBe(newerId);
        expect((await storage.getOrCreateActiveTurno(area)).id).toBe(newerId);
      }
    } finally {
      await removeFixtures([firstId, newerId]);
    }
  });

  it("uses a stable id tiebreaker when aliases have equal openedAt timestamps", async () => {
    if (!testPool) throw new Error("PostgreSQL test database was not enabled.");
    const firstId = "00000000-0000-4000-8000-000000000001";
    const secondId = "00000000-0000-4000-8000-000000000002";
    try {
      await testPool.query(
        `INSERT INTO cash_shifts (id, area, shift_number, opened_at, status)
         VALUES ($1, 'reception', 950001, NOW() + INTERVAL '1 hour', 'open'),
                ($2, 'recepcion', 950002, NOW() + INTERVAL '1 hour', 'open')`,
        [secondId, firstId],
      );
      expect((await storage.getCurrentShift("reception"))?.id).toBe(firstId);
      expect((await storage.getCurrentShift("recepcion"))?.id).toBe(firstId);
    } finally {
      await removeFixtures([firstId, secondId]);
    }
  });

  it("does not reuse a closed alias shift and creates a normalized open shift when none exists", async () => {
    const closedId = randomUUID();
    let createdId: string | undefined;
    // Other serialized suites may leave a legitimate auto-created open shift.
    // This suite is restricted to disposable databases; restore that state.
    const priorOpenIds = (await testPool!.query<{ id: string }>(
      "SELECT id FROM cash_shifts WHERE area IN ('reception', 'recepcion') AND status = 'open'",
    )).rows.map((shift) => shift.id);
    try {
      await testPool!.query(
        "UPDATE cash_shifts SET status = 'closed' WHERE id = ANY($1::varchar[])",
        [priorOpenIds],
      );
      await insertShift(closedId, "reception", "NOW() - INTERVAL '1 day'", "closed");

      expect(await storage.getCurrentShift("recepcion")).toBeUndefined();
      expect((await storage.getCashShifts("recepcion", "closed")).map((shift) => shift.id)).toContain(closedId);

      const created = await storage.getOrCreateActiveTurno("reception");
      createdId = created.id;
      expect(created).toMatchObject({ area: "recepcion", status: "open", autoCreado: true });
      expect(created.id).not.toBe(closedId);
    } finally {
      try {
        await removeFixtures([closedId, ...(createdId ? [createdId] : [])]);
      } finally {
        await testPool!.query(
          "UPDATE cash_shifts SET status = 'open' WHERE id = ANY($1::varchar[])",
          [priorOpenIds],
        );
      }
    }
  });

  it("routes receipt tender and both retention rows through the selected shift's actual area", async () => {
    const staleId = randomUUID();
    const currentId = randomUUID();
    const movementIds: string[] = [];
    const sourceIds = [randomUUID()];
    try {
      await insertShift(staleId, "reception", "NOW() + INTERVAL '1 minute'");
      await insertShift(currentId, "recepcion", "NOW() + INTERVAL '2 minutes'");

      const rows: Array<{
        id: string;
        shiftId: string | null;
        area: string;
        paymentMethod: string;
        movementType: string;
      }> = [];
      for (const [sourceId, label, method, amount, movementType] of [
        [sourceIds[0], "Tender", "transferencia", "98.00", "income"],
        [sourceIds[0], "Retención ganancias", "retencion_ganancias", "1.00", "informational"],
        [sourceIds[0], "Retención IIBB", "retencion_iibb", "1.00", "informational"],
      ]) {
        const row = await storage.registerCashMovement(
          "reception",
          "recibo_cta_cte",
          sourceId,
          label,
          method,
          amount,
          movementType,
          "alias-test",
        );
        rows.push(row);
        movementIds.push(row.id);
      }

      expect(rows).toHaveLength(3);
      expect(rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ shiftId: currentId, area: "recepcion", paymentMethod: "transferencia", movementType: "income" }),
        expect.objectContaining({ shiftId: currentId, area: "recepcion", paymentMethod: "retencion_ganancias", movementType: "informational" }),
        expect.objectContaining({ shiftId: currentId, area: "recepcion", paymentMethod: "retencion_iibb", movementType: "informational" }),
      ]));
    } finally {
      await removeFixtures([staleId, currentId], movementIds, sourceIds);
    }
  });
});
