import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { storage } from "../db-storage";

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
  : null;

type FixtureIds = {
  suffix: string;
  fromRoomTypeId: string;
  toRoomTypeId: string;
  roomIds: string[];
  ratePlanIds: string[];
  reservationIds: string[];
  groupId: string;
  groupRoomBlockId: string;
  packageId: string;
  packageRoomPriceIds: string[];
};

function createFixtureIds(): FixtureIds {
  const suffix = randomUUID();
  return {
    suffix,
    fromRoomTypeId: `pg-integrity-from-${suffix}`,
    toRoomTypeId: `pg-integrity-to-${suffix}`,
    roomIds: [`pg-integrity-room-1-${suffix}`, `pg-integrity-room-2-${suffix}`],
    ratePlanIds: [`pg-integrity-rate-1-${suffix}`, `pg-integrity-rate-2-${suffix}`],
    reservationIds: [`pg-integrity-reservation-1-${suffix}`, `pg-integrity-reservation-2-${suffix}`],
    groupId: `pg-integrity-group-${suffix}`,
    groupRoomBlockId: `pg-integrity-block-${suffix}`,
    packageId: `pg-integrity-package-${suffix}`,
    packageRoomPriceIds: [`pg-integrity-price-1-${suffix}`, `pg-integrity-price-2-${suffix}`],
  };
}

async function createFixture(ids: FixtureIds, options: { sourceExists?: boolean } = {}) {
  if (!pool) throw new Error("DATABASE_URL no está configurado");

  await pool.query(
    `INSERT INTO room_types (id, code, name)
     VALUES ($1, $2, $3)`,
    [ids.toRoomTypeId, `PGI-T-${ids.suffix}`, "PG Integrity destino"],
  );
  if (options.sourceExists) {
    await pool.query(
      `INSERT INTO room_types (id, code, name) VALUES ($1, $2, $3)`,
      [ids.fromRoomTypeId, `PGI-F-${ids.suffix}`, "PG Integrity origen"],
    );
  }

  await pool.query(
    `INSERT INTO rooms (id, room_number, room_type_id, status)
     VALUES ($1, $2, $3, 'available'), ($4, $5, $6, 'dirty')`,
    [
      ids.roomIds[0],
      `PGI-1-${ids.suffix.slice(0, 8)}`,
      ids.fromRoomTypeId,
      ids.roomIds[1],
      `PGI-2-${ids.suffix.slice(0, 8)}`,
      ids.fromRoomTypeId,
    ],
  );

  await pool.query(
    `INSERT INTO rate_plans (id, name, room_type_id, base_rate)
     VALUES ($1, $2, $3, 100.00), ($4, $5, $6, 200.00)`,
    [
      ids.ratePlanIds[0],
      `PG Integrity rate 1 ${ids.suffix}`,
      ids.fromRoomTypeId,
      ids.ratePlanIds[1],
      `PG Integrity rate 2 ${ids.suffix}`,
      ids.fromRoomTypeId,
    ],
  );

  await pool.query(
    `INSERT INTO reservations
      (id, reservation_code, guest_id, room_type_id, room_id, check_in_date, check_out_date, created_at)
     VALUES
      ($1, $2, $3, $4, $5, DATE '2026-09-10', DATE '2026-09-12', NOW()),
      ($6, $7, $8, $9, $10, DATE '2026-09-13', DATE '2026-09-15', NOW())`,
    [
      ids.reservationIds[0],
      `PGI-RES-1-${ids.suffix}`,
      `pg-integrity-guest-1-${ids.suffix}`,
      ids.fromRoomTypeId,
      ids.roomIds[0],
      ids.reservationIds[1],
      `PGI-RES-2-${ids.suffix}`,
      `pg-integrity-guest-2-${ids.suffix}`,
      ids.toRoomTypeId,
      ids.roomIds[1],
    ],
  );
  await pool.query(
    `UPDATE reservations SET original_room_type_id = $1 WHERE id = $2`,
    [ids.fromRoomTypeId, ids.reservationIds[1]],
  );

  await pool.query(
    `INSERT INTO groups (id, group_code, name, check_in_date, check_out_date, created_at)
     VALUES ($1, $2, $3, DATE '2026-09-10', DATE '2026-09-12', NOW())`,
    [ids.groupId, `PGI-GROUP-${ids.suffix}`, "PG Integrity group"],
  );
  await pool.query(
    `INSERT INTO group_room_blocks
      (id, group_id, room_type_id, quantity, agreed_rate)
     VALUES ($1, $2, $3, 2, 300.00)`,
    [ids.groupRoomBlockId, ids.groupId, ids.fromRoomTypeId],
  );

  await pool.query(
    `INSERT INTO packages (id, code, name, room_type_id, base_price, created_at)
     VALUES ($1, $2, $3, $4, 500.00, NOW())`,
    [ids.packageId, `PGI-PACKAGE-${ids.suffix}`, "PG Integrity package", ids.fromRoomTypeId],
  );
  await pool.query(
    `INSERT INTO package_room_prices (id, package_id, room_type_id, price)
     VALUES ($1, $2, $3, 510.00), ($4, $5, $6, 520.00)`,
    [
      ids.packageRoomPriceIds[0],
      ids.packageId,
      ids.fromRoomTypeId,
      ids.packageRoomPriceIds[1],
      ids.packageId,
      ids.fromRoomTypeId,
    ],
  );
}

async function readFixtureRoomTypeIds(ids: FixtureIds) {
  if (!pool) throw new Error("DATABASE_URL no está configurado");

  const [rooms, ratePlans, reservations, groupBlocks, packages, packageRoomPrices] = await Promise.all([
    pool.query("SELECT room_type_id FROM rooms WHERE id = ANY($1::varchar[]) ORDER BY id", [ids.roomIds]),
    pool.query("SELECT room_type_id FROM rate_plans WHERE id = ANY($1::varchar[]) ORDER BY id", [ids.ratePlanIds]),
    pool.query(
      "SELECT room_type_id, original_room_type_id FROM reservations WHERE id = ANY($1::varchar[]) ORDER BY id",
      [ids.reservationIds],
    ),
    pool.query("SELECT room_type_id FROM group_room_blocks WHERE id = $1", [ids.groupRoomBlockId]),
    pool.query("SELECT room_type_id FROM packages WHERE id = $1", [ids.packageId]),
    pool.query(
      "SELECT room_type_id FROM package_room_prices WHERE id = ANY($1::varchar[]) ORDER BY id",
      [ids.packageRoomPriceIds],
    ),
  ]);

  return {
    rooms: rooms.rows.map(row => row.room_type_id),
    ratePlans: ratePlans.rows.map(row => row.room_type_id),
    reservations: reservations.rows.map(row => ({
      roomTypeId: row.room_type_id,
      originalRoomTypeId: row.original_room_type_id,
    })),
    groupBlocks: groupBlocks.rows.map(row => row.room_type_id),
    packages: packages.rows.map(row => row.room_type_id),
    packageRoomPrices: packageRoomPrices.rows.map(row => row.room_type_id),
  };
}

async function cleanupFixture(ids: FixtureIds) {
  if (!pool) return;

  await pool.query("DELETE FROM package_room_prices WHERE id = ANY($1::varchar[])", [ids.packageRoomPriceIds]);
  await pool.query("DELETE FROM packages WHERE id = $1", [ids.packageId]);
  await pool.query("DELETE FROM group_room_blocks WHERE id = $1", [ids.groupRoomBlockId]);
  await pool.query("DELETE FROM groups WHERE id = $1", [ids.groupId]);
  await pool.query("DELETE FROM reservations WHERE id = ANY($1::varchar[])", [ids.reservationIds]);
  await pool.query("DELETE FROM rate_plans WHERE id = ANY($1::varchar[])", [ids.ratePlanIds]);
  await pool.query("DELETE FROM rooms WHERE id = ANY($1::varchar[])", [ids.roomIds]);
  await pool.query("DELETE FROM room_types WHERE id = ANY($1::varchar[])", [[
    ids.fromRoomTypeId,
    ids.toRoomTypeId,
  ]]);
}

runIfDatabaseIsConfigured("room type reference reassignment", () => {
  it("reassigns every supported reference source and reports exact counts", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const ids = createFixtureIds();

    try {
      await createFixture(ids);

      await expect(
        storage.reassignRoomTypeReferences(ids.fromRoomTypeId, ids.toRoomTypeId),
      ).resolves.toEqual({
        fromRoomTypeId: ids.fromRoomTypeId,
        toRoomTypeId: ids.toRoomTypeId,
        updated: [
          { source: "rooms", count: 2 },
          { source: "rate_plans", count: 2 },
          { source: "reservations", count: 1 },
          { source: "reservation_history", count: 1 },
          { source: "group_room_blocks", count: 1 },
          { source: "packages", count: 1 },
          { source: "package_room_prices", count: 2 },
        ],
      });

      await expect(readFixtureRoomTypeIds(ids)).resolves.toEqual({
        rooms: [ids.toRoomTypeId, ids.toRoomTypeId],
        ratePlans: [ids.toRoomTypeId, ids.toRoomTypeId],
        reservations: [
          { roomTypeId: ids.toRoomTypeId, originalRoomTypeId: null },
          { roomTypeId: ids.toRoomTypeId, originalRoomTypeId: ids.toRoomTypeId },
        ],
        groupBlocks: [ids.toRoomTypeId],
        packages: [ids.toRoomTypeId],
        packageRoomPrices: [ids.toRoomTypeId, ids.toRoomTypeId],
      });
    } finally {
      await cleanupFixture(ids);
    }
  });

  it("rolls back all source updates when a later update fails", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const ids = createFixtureIds();
    const triggerName = `pg_integrity_fail_${ids.suffix.replaceAll("-", "_")}`;
    const functionName = `${triggerName}_fn`;

    try {
      await createFixture(ids);
      await pool.query(
        `CREATE OR REPLACE FUNCTION "${functionName}"()
         RETURNS trigger
         LANGUAGE plpgsql
         AS $$
         BEGIN
           RAISE EXCEPTION 'intentional room type reassignment failure';
         END;
         $$`,
      );
      await pool.query(
        `CREATE TRIGGER "${triggerName}"
         BEFORE UPDATE OF room_type_id ON rate_plans
         FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`,
      );

      await expect(
        storage.reassignRoomTypeReferences(ids.fromRoomTypeId, ids.toRoomTypeId),
      ).rejects.toThrow("intentional room type reassignment failure");

      await expect(readFixtureRoomTypeIds(ids)).resolves.toEqual({
        rooms: [ids.fromRoomTypeId, ids.fromRoomTypeId],
        ratePlans: [ids.fromRoomTypeId, ids.fromRoomTypeId],
        reservations: [
          { roomTypeId: ids.fromRoomTypeId, originalRoomTypeId: null },
          { roomTypeId: ids.toRoomTypeId, originalRoomTypeId: ids.fromRoomTypeId },
        ],
        groupBlocks: [ids.fromRoomTypeId],
        packages: [ids.fromRoomTypeId],
        packageRoomPrices: [ids.fromRoomTypeId, ids.fromRoomTypeId],
      });
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS "${triggerName}" ON rate_plans`);
      await pool.query(`DROP FUNCTION IF EXISTS "${functionName}"()`);
      await cleanupFixture(ids);
    }
  });

  it("rejects a stale diagnostic when the source now exists in the catalog", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const ids = createFixtureIds();

    try {
      await createFixture(ids, { sourceExists: true });

      await expect(
        storage.reassignRoomTypeReferences(ids.fromRoomTypeId, ids.toRoomTypeId),
      ).rejects.toThrow("El tipo de habitación de origen ya existe en el catálogo");

      await expect(readFixtureRoomTypeIds(ids)).resolves.toEqual({
        rooms: [ids.fromRoomTypeId, ids.fromRoomTypeId],
        ratePlans: [ids.fromRoomTypeId, ids.fromRoomTypeId],
        reservations: [
          { roomTypeId: ids.fromRoomTypeId, originalRoomTypeId: null },
          { roomTypeId: ids.toRoomTypeId, originalRoomTypeId: ids.fromRoomTypeId },
        ],
        groupBlocks: [ids.fromRoomTypeId],
        packages: [ids.fromRoomTypeId],
        packageRoomPrices: [ids.fromRoomTypeId, ids.fromRoomTypeId],
      });
    } finally {
      await cleanupFixture(ids);
    }
  });

  it("prevents a concurrent destination deletion from creating new orphaned references", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const ids = createFixtureIds();
    const triggerName = `pg_integrity_slow_${ids.suffix.replaceAll("-", "_")}`;
    const functionName = `${triggerName}_fn`;

    try {
      await createFixture(ids);
      await pool.query(
        "UPDATE reservations SET room_type_id = $1 WHERE id = $2",
        [ids.fromRoomTypeId, ids.reservationIds[1]],
      );
      await pool.query(
        `CREATE OR REPLACE FUNCTION "${functionName}"()
         RETURNS trigger
         LANGUAGE plpgsql
         AS $$
         BEGIN
           PERFORM pg_sleep(0.25);
           RETURN NEW;
         END;
         $$`,
      );
      await pool.query(
        `CREATE TRIGGER "${triggerName}"
         BEFORE UPDATE OF room_type_id ON rooms
         FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`,
      );

      const reassignment = storage.reassignRoomTypeReferences(ids.fromRoomTypeId, ids.toRoomTypeId);
      await new Promise(resolve => setTimeout(resolve, 50));
      const deletion = storage.deleteRoomType(ids.toRoomTypeId);

      await expect(reassignment).resolves.toEqual(expect.objectContaining({
        fromRoomTypeId: ids.fromRoomTypeId,
        toRoomTypeId: ids.toRoomTypeId,
      }));
      await expect(deletion).resolves.toEqual(expect.objectContaining({
        deleted: false,
        references: expect.arrayContaining([
          expect.objectContaining({ source: "rooms", count: 2 }),
        ]),
      }));

      const target = await pool.query("SELECT id FROM room_types WHERE id = $1", [ids.toRoomTypeId]);
      expect(target.rows).toHaveLength(1);
      await expect(readFixtureRoomTypeIds(ids)).resolves.toEqual(expect.objectContaining({
        rooms: [ids.toRoomTypeId, ids.toRoomTypeId],
      }));
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS "${triggerName}" ON rooms`);
      await pool.query(`DROP FUNCTION IF EXISTS "${functionName}"()`);
      await cleanupFixture(ids);
    }
  });
});

afterAll(async () => {
  await pool?.end();
});