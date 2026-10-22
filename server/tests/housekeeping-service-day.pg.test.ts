import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import {
  housekeepingServiceDay,
  renewOccupiedHousekeepingDay,
} from "../housekeepingServiceDay";
const enabled =
  !!process.env.DATABASE_URL &&
  process.env.ALLOW_DESTRUCTIVE_PG_TESTS === "true";
if (enabled) {
  const u = new URL(process.env.DATABASE_URL!);
  if (
    !["127.0.0.1", "localhost"].includes(u.hostname) ||
    !/test/i.test(u.pathname)
  )
    throw Error("Disposable local test database required");
}
const prefix = "hk-day-" + randomUUID(),
  id = (v: string) => prefix + v;
let pool: any, storage: any;
const names = [
  "old",
  "today",
  "dnd",
  "blocked",
  "cleaning",
  "vacant",
  "departed",
  "active",
  "virtual",
  "unverified",
];
const snapshot = async () =>
  (
    await pool.query(
      "SELECT status,housekeeping_service_date FROM rooms WHERE id=$1",
      [id("old")],
    )
  ).rows[0];
describe.skipIf(!enabled)(
  "Daily occupied service renewal · real PostgreSQL",
  () => {
    beforeAll(async () => {
      ({ pool } = await import("../db"));
      ({ storage } = await import("../db-storage"));
      await pool.query(
        "INSERT INTO room_types(id,code,name) VALUES($1::text,$1::text,'Service day synthetic')",
        [id("type")],
      );
      await pool.query(
        "INSERT INTO guests(id,first_name,last_name)VALUES($1,'Synthetic','Service day')",
        [id("guest")],
      );
      for (const name of names) {
        await pool.query(
          "INSERT INTO rooms(id,room_number,room_type_id,floor,status)VALUES($1::text,$1::text,$2,1,'available')",
          [id(name), id("type")],
        );
        if (name !== "vacant")
          await pool.query(
            "INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,nights,number_of_guests,status,total_room_amount,created_at,housekeeping_preparation)VALUES($1::text,$1::text,$2,$3,$4,'2026-10-20','2026-10-21',1,1,'checked_in',2000,NOW(),$5)",
            [
              id("res-" + name),
              id("guest"),
              id("type"),
              id(name),
              JSON.stringify({
                roomId: id(name),
                state: "prepared",
                note: "No mover",
                markedBy: "Ana",
                markedAt: "2026-10-21T13:00:00Z",
              }),
            ],
          );
      }
    });
    beforeEach(async () => {
      await pool.query(
        "DELETE FROM housekeeping_tasks WHERE room_id IN (SELECT id FROM rooms WHERE room_type_id=$1)",
        [id("type")],
      );
      await pool.query("DELETE FROM audit_logs WHERE entity_id LIKE $1", [
        prefix + "%",
      ]);
      await pool.query(
        "UPDATE rooms SET status='limpia_ocupada',housekeeping_service_date='2026-10-21',is_virtual=false WHERE room_type_id=$1",
        [id("type")],
      );
      await pool.query(
        "UPDATE rooms SET housekeeping_service_date='2026-10-22' WHERE id=$1",
        [id("today")],
      );
      for (const [name, status] of [
        ["dnd", "no_molestar"],
        ["blocked", "maintenance"],
        ["cleaning", "cleaning"],
      ])
        await pool.query("UPDATE rooms SET status=$1 WHERE id=$2", [
          status,
          id(name),
        ]);
      await pool.query("UPDATE rooms SET is_virtual=true WHERE id=$1", [
        id("virtual"),
      ]);
      await pool.query(
        "UPDATE reservations SET status='checked_out' WHERE id=$1",
        [id("res-departed")],
      );
      await pool.query(
        "INSERT INTO housekeeping_tasks(id,room_id,task_type,status,priority,scheduled_date,created_at)VALUES($1,$2,'stayover_clean','in_progress','normal','2026-10-21',NOW())",
        [id("task"), id("active")],
      );
    });
    afterAll(async () => {
      if (pool) {
        await pool.query(
          "DELETE FROM housekeeping_tasks WHERE room_id IN (SELECT id FROM rooms WHERE room_type_id=$1)",
          [id("type")],
        );
        await pool.query("DELETE FROM audit_logs WHERE entity_id LIKE $1", [
          prefix + "%",
        ]);
        await pool.query("DELETE FROM reservations WHERE guest_id=$1", [
          id("guest"),
        ]);
        await pool.query("DELETE FROM rooms WHERE room_type_id=$1", [
          id("type"),
        ]);
        await pool.query("DELETE FROM room_types WHERE id=$1", [id("type")]);
        await pool.query("DELETE FROM guests WHERE id=$1", [id("guest")]);
        await pool.end();
      }
    });
    it("changes only after midnight Argentina and preserves stay, amounts and No mover", async () => {
      const before = (
        await pool.query(
          "SELECT * FROM reservations WHERE guest_id=$1 ORDER BY id",
          [id("guest")],
        )
      ).rows;
      expect(housekeepingServiceDay(new Date("2026-10-22T02:59:59Z"))).toBe(
        "2026-10-21",
      );
      await renewOccupiedHousekeepingDay(new Date("2026-10-22T02:59:59Z"));
      expect((await snapshot()).status).toBe("limpia_ocupada");
      await renewOccupiedHousekeepingDay(new Date("2026-10-22T03:00:00Z"));
      expect(await snapshot()).toMatchObject({
        status: "occupied",
        housekeeping_service_date: "2026-10-21",
      });
      expect(
        (
          await pool.query(
            "SELECT * FROM reservations WHERE guest_id=$1 ORDER BY id",
            [id("guest")],
          )
        ).rows,
      ).toEqual(before);
    });
    it("keeps today, Do not disturb, blocks, ongoing work, vacant and checked-out rooms", async () => {
      await renewOccupiedHousekeepingDay(new Date("2026-10-22T12:00:00Z"));
      for (const [name, status] of [
        ["today", "limpia_ocupada"],
        ["dnd", "no_molestar"],
        ["blocked", "maintenance"],
        ["cleaning", "cleaning"],
        ["vacant", "limpia_ocupada"],
        ["departed", "limpia_ocupada"],
        ["active", "limpia_ocupada"],
        ["virtual", "limpia_ocupada"],
      ])
        expect(
          (await pool.query("SELECT status FROM rooms WHERE id=$1", [id(name)]))
            .rows[0].status,
        ).toBe(status);
    });
    it("is idempotent across concurrent instances and catches up after downtime", async () => {
      await Promise.all([
        renewOccupiedHousekeepingDay(new Date("2026-10-25T12:00:00Z")),
        renewOccupiedHousekeepingDay(new Date("2026-10-25T12:00:00Z")),
      ]);
      expect((await snapshot()).status).toBe("occupied");
      expect(
        (
          await pool.query(
            "SELECT * FROM audit_logs WHERE entity_id=$1 AND action='daily_service_pending'",
            [id("old")],
          )
        ).rows,
      ).toHaveLength(1);
    });
    it("rechecks the service date after waiting for a concurrent cleaning", async () => {
      const connection = await pool.connect();
      await connection.query("BEGIN");
      await connection.query(
        "UPDATE rooms SET housekeeping_service_date='2026-10-22' WHERE id=$1",
        [id("old")],
      );
      const renewal = renewOccupiedHousekeepingDay(
        new Date("2026-10-22T12:00:00Z"),
      );
      await connection.query("COMMIT");
      connection.release();
      await renewal;
      expect(await snapshot()).toMatchObject({
        status: "limpia_ocupada",
        housekeeping_service_date: "2026-10-22",
      });
    });
    it("stamps actual service day, rejects date injection and leaves a fresh cleaning alone", async () => {
      await storage.updateRoom(id("old"), {
        status: "limpia_ocupada",
        housekeepingServiceDate: "1900-01-01",
      });
      expect((await snapshot()).housekeeping_service_date).toBe(
        housekeepingServiceDay(),
      );
      await renewOccupiedHousekeepingDay();
      expect((await snapshot()).status).toBe("limpia_ocupada");
      await storage.updateRoom(id("old"), {
        housekeepingServiceDate: "2099-01-01",
        notes: "nota",
      });
      expect((await snapshot()).housekeeping_service_date).toBe(
        housekeepingServiceDay(),
      );
    });
  },
);
