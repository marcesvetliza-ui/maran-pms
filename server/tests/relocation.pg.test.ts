import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import express from "express";
import type { Server } from "node:http";
import { addCalendarDays } from "@shared/nightAuditDate";
import { roomAssignments } from "@shared/roomAssignments";
import { calculateLodging } from "../reports/lodging";
const url = process.env.DATABASE_URL;
if (url && !/test/i.test(new URL(url).pathname))
  throw Error("Only a disposable test database is allowed.");
let pool: any,
  storage: any,
  preview: any,
  move: any,
  today: string,
  actor: any,
  prefix: string,
  fx: any,
  server: Server,
  base: string;
const id = (s: string) => prefix + "-" + s;
async function row() {
  return (await pool.query("SELECT * FROM reservations WHERE id=$1", [fx.id]))
    .rows[0];
}
async function params(target = "target", extra: any = {}) {
  const p = await preview(fx.id);
  const dest = p.rooms.find((r: any) => r.id === id(target));
  expect(dest).toBeTruthy();
  return {
    operationId: randomUUID(),
    roomId: dest.id,
    reservationToken: p.reservation.token,
    destinationToken: dest.token,
    reason: "Cambio solicitado",
    acknowledgePreparation: false,
    acknowledgeBedChange: true,
    overrideGroupWarning: false,
    ...extra,
  };
}
async function other(
  room: string,
  from: string,
  to: string,
  status = "confirmed",
) {
  const rid = id("other-" + randomUUID());
  await pool.query(
    `INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,check_in_date,check_out_date,nights,status,created_at,number_of_guests,final_rate_per_night,total_room_amount)VALUES($1::text,$1::text,$2,$3,$4,$5,$6,2,$7,now(),1,100,200)`,
    [rid, id("guest"), id(room), id("type"), from, to, status],
  );
  return rid;
}
describe.skipIf(!url)(
  "Reubicar · real PostgreSQL, room history and operational isolation",
  () => {
    beforeAll(async () => {
      ({ pool } = await import("../db"));
      ({ storage } = await import("../db-storage"));
      ({ previewRelocation: preview, relocateReservation: move } = await import(
        "../relocation"
      ));
      today = (await import("../db-storage")).getArgentinaToday();
      const app = express();
      app.use(express.json());
      app.use((req: any, _res, next) => {
        const role = req.headers["x-synthetic-role"];
        req.isAuthenticated = () => !!role;
        if (role) req.user = { ...actor, role };
        next();
      });
      (await import("../relocation")).registerRelocationRoutes(app);
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      base = "http://127.0.0.1:" + (server.address() as any).port;
    });
    beforeEach(async () => {
      prefix = "reloc-" + randomUUID();
      actor = { id: id("actor"), username: "Synthetic reception" };
      await pool.query(
        "INSERT INTO system_users(id,username,password,full_name,email,role,is_active,created_at) VALUES($1::text,$1::text,'synthetic','Synthetic reception','relocate@example.invalid','admin','true',now())",
        [actor.id],
      );
      await pool.query(
        "INSERT INTO room_types(id,code,name,sort_order) VALUES($1::text,$1::text,'Ejecutiva synthetic',1),($2::text,$2::text,'Premium synthetic',2)",
        [id("type"), id("premium")],
      );
      await pool.query(
        "INSERT INTO guests(id,first_name,last_name) VALUES($1,'Synthetic','Guest')",
        [id("guest")],
      );
      await pool.query(
        "INSERT INTO bed_types(id,code,name) VALUES($1,'DBL','Matrimonial')",
        [id("bed")],
      );
      for (const [name, number, type, status, bed] of [
        ["origin", "301", "type", "occupied", "MAT"],
        ["target", "303", "type", "available", "MAT"],
        ["second", "305", "type", "available", "MAT"],
        ["upgrade", "607", "premium", "inspected", "TWIN"],
        ["dirty", "403", "type", "dirty", "MAT"],
        ["reub", "REUB-synthetic", "type", "available", null],
      ]) {
        await pool.query(
          "INSERT INTO rooms(id,room_number,room_type_id,status,bed_config,is_virtual,is_active,max_occupancy) VALUES($1,$2,$3,$4,$5,$6,true,2)",
          [
            id(name as string),
            prefix + number,
            id(type as string),
            status,
            bed,
            name === "reub",
          ],
        );
      }
      fx = {
        id: id("stay"),
        from: addCalendarDays(today, -2),
        to: addCalendarDays(today, 3),
      };
      await pool.query(
        `INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,check_in_date,check_out_date,nights,status,created_at,number_of_guests,bed_type_id,final_rate_per_night,total_room_amount,notes) VALUES($1::text,$1::text,$2,$3,$4,$5,$6,5,'checked_in',now(),2,$7,100,500,'Synthetic package included')`,
        [
          fx.id,
          id("guest"),
          id("origin"),
          id("type"),
          fx.from,
          fx.to,
          id("bed"),
        ],
      );
    });
    afterEach(async () => {
      await pool.query(
        "DELETE FROM reservation_relocations WHERE reservation_id IN(SELECT id FROM reservations WHERE id LIKE $1)",
        [prefix + "%"],
      );
      for (const table of ["reservation_changelog", "reservation_companions"])
        await pool.query(`DELETE FROM ${table} WHERE reservation_id LIKE $1`, [
          prefix + "%",
        ]);
      await pool.query("DELETE FROM housekeeping_tasks WHERE room_id LIKE $1", [
        prefix + "%",
      ]);
      await pool.query("DELETE FROM audit_logs WHERE entity_id LIKE $1", [
        prefix + "%",
      ]);
      await pool.query(
        "DELETE FROM group_reservation_links WHERE reservation_id LIKE $1",
        [prefix + "%"],
      );
      await pool.query("DELETE FROM group_room_blocks WHERE group_id LIKE $1", [
        prefix + "%",
      ]);
      await pool.query("DELETE FROM group_payments WHERE group_id LIKE $1", [
        prefix + "%",
      ]);
      await pool.query("DELETE FROM groups WHERE id LIKE $1", [prefix + "%"]);
      await pool.query("DELETE FROM maintenance_blocks WHERE room_id LIKE $1", [
        prefix + "%",
      ]);
      for (const table of ["charges", "payments"])
        await pool.query(`DELETE FROM ${table} WHERE reservation_id LIKE $1`, [
          prefix + "%",
        ]);
      await pool.query("DELETE FROM group_payments WHERE group_id LIKE $1", [
        prefix + "%",
      ]);
      await pool.query(
        "DELETE FROM billing_operations WHERE owner_id LIKE $1",
        [prefix + "%"],
      );
      await pool.query("DELETE FROM reservations WHERE id LIKE $1", [
        prefix + "%",
      ]);
      await pool.query("DELETE FROM rooms WHERE id LIKE $1", [prefix + "%"]);
      await pool.query("DELETE FROM bed_types WHERE id LIKE $1", [
        prefix + "%",
      ]);
      await pool.query("DELETE FROM guests WHERE id LIKE $1", [prefix + "%"]);
      await pool.query("DELETE FROM room_types WHERE id LIKE $1", [
        prefix + "%",
      ]);
      await pool.query("DELETE FROM system_users WHERE id LIKE $1", [
        prefix + "%",
      ]);
    });
    afterAll(async () => {
      await new Promise<void>((resolve) =>
        server ? server.close(() => resolve()) : resolve(),
      );
      await pool?.end();
    });

    it("requires session and existing reservation permissions, and rejects price or history injection", async () => {
      (await import("../permissions")).setRolePermissionsCacheForTests([
        { role: "admin", resourceKey: "sidebar:/reservations" },
        { role: "comercial", resourceKey: "sidebar:/reservations" },
      ]);
      const call = (method: string, path: string, role?: string, body?: any) =>
        fetch(base + path, {
          method,
          headers: {
            "content-type": "application/json",
            ...(role ? { "x-synthetic-role": role } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      expect((await call("GET", "/api/relocations/" + fx.id)).status).toBe(401);
      expect(
        (await call("GET", "/api/relocations/" + fx.id, "housekeeping")).status,
      ).toBe(403);
      const before = await row();
      expect(
        (await call("GET", "/api/relocations/" + fx.id, "comercial")).status,
      ).toBe(200);
      expect(await row()).toEqual(before);
      const input = await params();
      expect(
        (
          await call("POST", "/api/relocations/" + fx.id, "admin", {
            ...input,
            totalRoomAmount: "0",
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await call("POST", "/api/relocations/" + fx.id, "admin", {
            ...input,
            roomHistory: [],
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await call("POST", "/api/relocations/" + fx.id, "admin", {
            ...input,
            reason: "   abcd ",
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await call("POST", "/api/relocations/" + fx.id, "admin", {
            ...input,
            reason: " Error ",
          })
        ).status,
      ).toBe(200);
    });
    it("enforces authentication and allows authorized reads in production", async () => {
      const previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        expect((await fetch(base + "/api/relocations/" + fx.id)).status).toBe(
          401,
        );
        expect(
          (
            await fetch(base + "/api/relocations/" + fx.id, {
              headers: { "x-synthetic-role": "admin" },
            })
          ).status,
        ).toBe(200);
      } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
      }
    });
    it("does not move into an overdue in-house occupancy or a late-checkout boundary", async () => {
      const overdue = await other(
        "target",
        addCalendarDays(today, -4),
        addCalendarDays(today, -1),
        "checked_in",
      );
      await other("second", addCalendarDays(today, -1), today);
      await pool.query(
        "UPDATE reservations SET late_check_out=true WHERE room_id=$1 AND id<>$2",
        [id("second"), fx.id],
      );
      const p = await preview(fx.id);
      expect(p.rooms.find((r: any) => r.id === id("target"))).toBeUndefined();
      expect(p.rooms.find((r: any) => r.id === id("second"))).toBeUndefined();
    });
    it("checks the whole remaining stay, excludes future overlaps, blocks and virtual rooms; separates readiness", async () => {
      await other(
        "second",
        addCalendarDays(today, 1),
        addCalendarDays(today, 2),
      );
      await pool.query(
        "INSERT INTO maintenance_blocks(id,room_id,block_from,block_to,blocked_by) VALUES($1,$2,$3,$4,$5)",
        [id("block"), id("upgrade"), today, fx.to, "Synthetic"],
      );
      const p = await preview(fx.id);
      expect(p.reservation.from).toBe(today);
      expect(p.rooms.find((r: any) => r.id === id("second"))).toBeUndefined();
      expect(p.rooms.find((r: any) => r.id === id("upgrade"))).toBeUndefined();
      expect(p.rooms.find((r: any) => r.id === id("reub"))).toBeUndefined();
      expect(p.rooms.find((r: any) => r.id === id("dirty"))).toMatchObject({
        ready: false,
        selectable: false,
      });
    });
    it("preserves previous nights, price and folio identity and updates both room conditions atomically", async () => {
      const before = await row(),
        input = await params();
      await move(fx.id, input, actor);
      const after = await row();
      const changed = [
        "room_id",
        "room_history",
        "moved_from_room_number",
        "last_modified_by",
      ];
      for (const key of Object.keys(before).filter((k) => !changed.includes(k)))
        expect(after[key], key).toEqual(before[key]);
      expect(after.room_history).toEqual([
        {
          roomId: id("origin"),
          roomTypeId: id("type"),
          from: fx.from,
          to: today,
        },
      ]);
      const plan = await storage.getPlanningData(fx.from, fx.to);
      expect(plan.cellReservations[id("origin")][fx.from]).toBe(fx.id);
      expect(plan.cellReservations[id("origin")][today]).toBeUndefined();
      expect(plan.cellReservations[id("target")][today]).toBe(fx.id);
      expect(plan.cellReservations[id("target")][fx.from]).toBeUndefined();
      const { loadHousekeepingDailyReport } = await import(
        "../housekeepingDailyReport"
      );
      const arrival = await loadHousekeepingDailyReport(fx.from);
      expect(
        arrival.checkIns.find((item: any) => item.reservationId === fx.id)
          ?.roomNumber,
      ).toBe(prefix + "301");
      expect(await storage.checkOverbooking(id("target"), fx.from, today)).toBe(
        false,
      );
      expect(await storage.checkOverbooking(id("target"), today, fx.to)).toBe(
        true,
      );
      expect(await storage.checkOverbooking(id("origin"), today, fx.to)).toBe(
        false,
      );
      const states = (
        await pool.query("SELECT id,status FROM rooms WHERE id=ANY($1)", [
          [id("origin"), id("target")],
        ])
      ).rows;
      expect(states.find((r: any) => r.id === id("origin")).status).toBe(
        "dirty",
      );
      expect(states.find((r: any) => r.id === id("target")).status).toBe(
        "occupied",
      );
    });
    it("keeps room-night revenue in the original room before today and the destination afterwards", async () => {
      await move(fx.id, await params("upgrade"), actor);
      const stay = await storage.getReservation(fx.id),
        rooms = await storage.getRooms();
      const report = calculateLodging(fx.from, fx.to, today, rooms, [stay], []);
      expect(
        report.nights
          .filter((n) => n.date < today)
          .every((n) => n.roomId === id("origin")),
      ).toBe(true);
      expect(
        report.nights
          .filter((n) => n.date >= today)
          .every((n) => n.roomId === id("upgrade")),
      ).toBe(true);
      expect(report.nights.reduce((sum, n) => sum + (n.amount || 0), 0)).toBe(
        500,
      );
      const { getRevenueDayDetail } = await import("../revenue/metrics");
      const historic = await getRevenueDayDetail(fx.from),
        current = await getRevenueDayDetail(today);
      expect(
        historic.reservations.find((r: any) => r.reservationId === fx.id)
          .roomId,
      ).toBe(id("origin"));
      expect(
        current.reservations.find((r: any) => r.reservationId === fx.id).roomId,
      ).toBe(id("upgrade"));
    });
    it("reassigns a future reservation without dirtying rooms or introducing historical nights", async () => {
      await pool.query(
        "UPDATE reservations SET status='confirmed',check_in_date=$2 WHERE id=$1",
        [fx.id, addCalendarDays(today, 1)],
      );
      const before = await row();
      await move(fx.id, await params(), actor);
      const after = await row();
      expect(after.check_in_date).toBe(before.check_in_date);
      expect(after.room_history).toBeNull();
      expect(
        (
          await pool.query("SELECT status FROM rooms WHERE id=$1", [
            id("origin"),
          ])
        ).rows[0].status,
      ).toBe("occupied");
    });
    it("includes an unassigned REUB reservation as origin and supports moving it to a real room", async () => {
      await pool.query(
        "UPDATE reservations SET room_id=$2,status='confirmed',check_in_date=$3 WHERE id=$1",
        [fx.id, id("reub"), today],
      );
      const { relocationSearch } = await import("../relocation");
      expect(
        (await relocationSearch(prefix)).some((r: any) => r.id === fx.id),
      ).toBe(true);
      await move(fx.id, await params(), actor);
      expect((await row()).room_id).toBe(id("target"));
    });
    it("retries the same operation once without duplicate history, tasks or audit", async () => {
      const input = await params("upgrade");
      const first = await move(fx.id, input, actor);
      expect(await move(fx.id, input, actor)).toEqual(first);
      expect(
        (
          await pool.query(
            "SELECT * FROM reservation_changelog WHERE reservation_id=$1",
            [fx.id],
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        (
          await pool.query(
            "SELECT * FROM housekeeping_tasks WHERE room_id=$1",
            [id("upgrade")],
          )
        ).rows,
      ).toHaveLength(1);
      await expect(
        move(fx.id, { ...input, reason: "Otro motivo" }, actor),
      ).rejects.toThrow("otros datos");
    });
    it("refuses stale reservation and destination snapshots without changing the source", async () => {
      const input = await params();
      await pool.query("UPDATE rooms SET bed_config=$2 WHERE id=$1", [
        id("target"),
        "TWIN",
      ]);
      await expect(move(fx.id, input, actor)).rejects.toThrow(
        "estado o camaje",
      );
      expect((await row()).room_id).toBe(id("origin"));
    });
    it("rechecks availability after preview and does not leave the guest in REUB on conflict", async () => {
      const input = await params();
      await other("target", today, fx.to);
      await expect(move(fx.id, input, actor)).rejects.toThrow(
        "ya no está disponible",
      );
      expect((await row()).room_id).toBe(id("origin"));
      expect(
        (
          await pool.query(
            "SELECT * FROM reservation_relocations WHERE reservation_id=$1",
            [fx.id],
          )
        ).rows,
      ).toHaveLength(0);
    });
    it("serializes two different relocations from one snapshot", async () => {
      const [a, b] = await Promise.all([params("target"), params("second")]);
      const results = await Promise.allSettled([
        move(fx.id, a, actor),
        move(fx.id, b, actor),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    });
    it("serializes two guests choosing the same free destination", async () => {
      const input = await params(),
        otherId = await other("second", today, fx.to, "checked_in"),
        p = await preview(otherId),
        dest = p.rooms.find((r: any) => r.id === id("target"));
      const input2 = {
        ...input,
        operationId: randomUUID(),
        reservationToken: p.reservation.token,
        destinationToken: dest.token,
      };
      const results = await Promise.allSettled([
        move(fx.id, input, actor),
        move(otherId, input2, actor),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    });
    it("requires explicit review of special preparation and bed differences and keeps the original note", async () => {
      const prep = {
        roomId: id("origin"),
        state: "prepared",
        note: "Synthetic allergy preparation",
        markedAt: "2026-11-24T12:00:00Z",
        markedBy: actor.username,
      };
      await pool.query(
        "UPDATE reservations SET housekeeping_preparation=$2 WHERE id=$1",
        [fx.id, JSON.stringify(prep)],
      );
      const input = await params("upgrade", { acknowledgeBedChange: false });
      await expect(move(fx.id, input, actor)).rejects.toThrow(
        "preparación especial",
      );
      await expect(
        move(fx.id, { ...input, acknowledgePreparation: true }, actor),
      ).rejects.toThrow("camaje");
      await move(
        fx.id,
        { ...input, acknowledgePreparation: true, acknowledgeBedChange: true },
        actor,
      );
      expect((await row()).housekeeping_preparation).toMatchObject({
        state: "review",
        note: prep.note,
        roomId: id("upgrade"),
        previousRoomId: id("origin"),
      });
    });
    it("rejects a room with insufficient capacity or unavailable housekeeping state", async () => {
      const dirty = await params("dirty");
      await expect(move(fx.id, dirty, actor)).rejects.toThrow("Housekeeping");
      await pool.query("UPDATE rooms SET max_occupancy=1 WHERE id=$1", [
        id("target"),
      ]);
      const p = await preview(fx.id);
      expect(p.rooms.find((r: any) => r.id === id("target")).selectable).toBe(
        false,
      );
    });
    it("rolls the entire move back when the mandatory audit cannot be written", async () => {
      const input = await params();
      await pool.query(
        `CREATE FUNCTION "${prefix}-audit"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='${fx.id}' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$`,
      );
      await pool.query(
        `CREATE TRIGGER "${prefix}-audit" BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION "${prefix}-audit"()`,
      );
      try {
        await expect(move(fx.id, input, actor)).rejects.toThrow(
          "Synthetic audit",
        );
        expect((await row()).room_id).toBe(id("origin"));
        expect(
          (
            await pool.query("SELECT status FROM rooms WHERE id=$1", [
              id("target"),
            ])
          ).rows[0].status,
        ).toBe("available");
      } finally {
        await pool.query(`DROP TRIGGER "${prefix}-audit" ON audit_logs`);
        await pool.query(`DROP FUNCTION "${prefix}-audit"()`);
      }
    });
    it("retains history across a second same-day move without double counting nights", async () => {
      await move(fx.id, await params(), actor);
      await move(fx.id, await params("second"), actor);
      const stay = await storage.getReservation(fx.id);
      expect(roomAssignments(stay)).toHaveLength(2);
      expect(stay.roomHistory).toHaveLength(1);
      expect(stay.roomId).toBe(id("second"));
    });
    it("ordinary writers cannot forge history or destroy it by changing the original arrival", async () => {
      await move(fx.id, await params(), actor);
      await storage.updateReservation(fx.id, {
        roomHistory: [],
        notes: "Safe note change",
      } as any);
      expect((await row()).room_history).toHaveLength(1);
      await expect(
        storage.updateReservation(fx.id, { checkInDate: today }),
      ).rejects.toThrow("ingreso histórico");
    });
    it("never blocks a room-only relocation on a pending financial operation or group advance", async () => {
      await pool.query(
        "INSERT INTO groups(id,group_code,name,status,check_in_date,check_out_date,created_at) VALUES($1::text,$1::text,'Synthetic Group','inhouse',$2,$3,now())",
        [id("group"), fx.from, fx.to],
      );
      await pool.query(
        "INSERT INTO group_reservation_links(id,group_id,reservation_id) VALUES($1,$2,$3)",
        [id("link"), id("group"), fx.id],
      );
      await pool.query(
        "INSERT INTO group_room_blocks(id,group_id,room_type_id,quantity) VALUES($1,$2,$3,1)",
        [id("gblock"), id("group"), id("type")],
      );
      await pool.query(
        "INSERT INTO charges(id,reservation_id,description,amount,date)VALUES($1,$2,'Synthetic extra',70,$3)",
        [id("charge"), fx.id, today],
      );
      await pool.query(
        "INSERT INTO group_payments(id,group_id,amount,method,date,distribution_detail)VALUES($1,$2,200,'efectivo',$3,$4)",
        [id("advance"), id("group"), today, JSON.stringify({ [fx.id]: 200 })],
      );
      await pool.query(
        "INSERT INTO payments(id,reservation_id,amount,method,date,group_payment_id)VALUES($1,$2,200,'efectivo',$3,$4)",
        [id("payment"), fx.id, today, id("advance")],
      );
      await pool.query(
        "INSERT INTO billing_operations(operation_id,owner_type,owner_id,payload_hash,request_snapshot,fiscal_identity,stage)VALUES($1,'group',$2,'synthetic','{}','{}','uncertain')",
        [id("pending"), id("group")],
      );
      const financial = async () => {
        const tables = [
          "charges",
          "payments",
          "group_payments",
          "billing_operations",
        ];
        const result = [];
        for (const table of tables)
          result.push(
            (
              await pool.query(
                `SELECT * FROM ${table} WHERE ${table === "billing_operations" ? "owner_id" : table === "group_payments" ? "group_id" : "reservation_id"} LIKE $1`,
                [prefix + "%"],
              )
            ).rows,
          );
        return result;
      };
      const before = await financial();
      await move(fx.id, await params("upgrade"), actor);
      expect((await row()).room_id).toBe(id("upgrade"));
      expect((await row()).room_type_id).toBe(id("type"));
      expect(await financial()).toEqual(before);
      expect(
        (
          await pool.query(
            "SELECT * FROM group_reservation_links WHERE reservation_id=$1",
            [fx.id],
          )
        ).rows,
      ).toHaveLength(1);
      const planning = await storage.getPlanningData(today, fx.to);
      expect(
        planning.unassignedGroupBlocks.some(
          (b: any) => b.groupId === id("group"),
        ),
      ).toBe(false);
    });
  },
);
