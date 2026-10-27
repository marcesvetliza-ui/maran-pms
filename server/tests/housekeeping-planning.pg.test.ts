import express from "express";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
const url = process.env.DATABASE_URL,
  enabled = !!url && process.env.ALLOW_DESTRUCTIVE_PG_TESTS === "true";
if (enabled) {
  const u = new URL(url!);
  if (
    !["127.0.0.1", "localhost"].includes(u.hostname) ||
    !/test/i.test(u.pathname)
  )
    throw Error("Disposable local test database required.");
}
const prefix = "hk-plan-" + randomUUID(),
  id = (s: string) => prefix + "-" + s,
  date = "2095-02-02";
let pool: pg.Pool,
  server: Server,
  base = "",
  actor = "admin",
  storage: any,
  load: any;
async function api(method: string, path: string, body?: any) {
  const r = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}
const confirm = (extra: any = {}) => ({
  acknowledgeRequest: true,
  roomId: id("room"),
  bedConfig: "TWIN",
  expectedCurrentBedConfig: "MAT",
  expectedBedConfigRevision: 0,
  expectedBedTypeId: id("twn"),
  expectedBedTypeNotes: null,
  ...extra,
});
const confirmPath = () =>
  `/api/housekeeping/planning/${id("arrival")}/bed-preparation`;
const selected = async (d = date) => {
  const data = await load(d);
  return {
    ...data,
    rooms: data.rooms.filter((r: any) => r.id.startsWith(prefix)),
    unassigned: data.unassigned.filter((r: any) => r.id.startsWith(prefix)),
  };
};
describe.skipIf(!enabled)(
  "Housekeeping planning · dated evidence and physical preparation",
  () => {
    beforeAll(async () => {
      ({ pool } = await import("../db"));
      ({ storage } = await import("../db-storage"));
      ({ loadHousekeepingPlanning: load } = await import(
        "../housekeepingPlanning"
      ));
      await (await import("../permissions")).loadRolePermissionsCache();
      for (const name of ["admin", "worker"])
        await pool.query(
          "INSERT INTO system_users(id,username,password,full_name,email,role,is_active,created_at) VALUES ($1::text,$1::text,'synthetic',$1::text,'hkplan@example.invalid',$2,'true',NOW())",
          [id(name), name === "admin" ? "admin" : "housekeeping"],
        );
      await pool.query(
        "INSERT INTO room_types(id,code,name) VALUES ($1::text,$1::text,'Planning test')",
        [id("type")],
      );
      await pool.query(
        "INSERT INTO guests(id,first_name,last_name,phone,document_number) VALUES ($1,'Synthetic','Planning','PRIVATE_PHONE','PRIVATE_DOCUMENT')",
        [id("guest")],
      );
      await pool.query(
        "INSERT INTO bed_types(id,code,name) VALUES ($1,$2,'Twin solicitado')",
        [id("twn"), prefix + "TWN"],
      );
      // Code is custom on purpose: unknown catalogs must request a human review.
      for (const [i, room] of ["room", "second", "virtual"].entries())
        await pool.query(
          "INSERT INTO rooms(id,room_number,room_type_id,floor,status,bed_config,allowed_bed_configs,is_virtual) VALUES ($1::text,$1::text,$2,$3,'dirty','MAT',ARRAY['MAT','TWIN'],$4)",
          [id(room), id("type"), i + 1, room === "virtual"],
        );
      for (const [name, room, start, end] of [
        ["arrival", "room", date, "2095-02-05"],
        ["departure", "room", "2095-02-01", date],
        ["stay", "second", "2095-02-01", "2095-02-05"],
        ["unassigned", "missing", date, "2095-02-05"],
        ["virtual", "virtual", date, "2095-02-05"],
      ])
        await pool.query(
          `INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,status,nights,number_of_guests,bed_type_id,notes,total_room_amount,created_at)
   VALUES ($1::text,$1::text,$2,$3,$4,$5,$6,'confirmed',3,2,$7,'PRIVATE_RESERVATION_NOTE',1234567,NOW())`,
          [id(name), id("guest"), id("type"), id(room), start, end, id("twn")],
        );
      await pool.query(
        "UPDATE reservations SET housekeeping_preparation=$1 WHERE id=$2",
        [
          JSON.stringify({
            roomId: id("room"),
            state: "prepared",
            note: "No mover — cuna preparada",
            markedAt: "2095-02-01T12:00:00Z",
            markedBy: "Ana",
          }),
          id("arrival"),
        ],
      );
      await pool.query(
        "INSERT INTO guest_preferences(guest_id,category,title,visible_to,is_active) VALUES ($1,'habitacion','Almohada adicional',ARRAY['housekeeping'],true),($1,'nota_interna','PRIVATE_INTERNAL',ARRAY['all'],true)",
        [id("guest")],
      );
      await pool.query(
        "INSERT INTO housekeeping_tasks(id,room_id,task_type,status,priority,scheduled_date,assigned_to,notes,started_at,completed_at,created_at) VALUES ($1,$2,'deep_clean','completed','high',$3,$4,'Limpieza registrada','2095-02-02T11:00:00Z','2095-02-02T11:20:12Z',NOW())",
        [id("task"), id("room"), date, id("worker")],
      );
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.isAuthenticated = () => actor !== "none";
        req.user = {
          id: id(actor),
          username: actor,
          role: actor === "admin" ? "admin" : "housekeeping",
        } as any;
        next();
      });
      (await import("../housekeepingPlanning")).registerHousekeepingPlanning(
        app,
      );
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((r) => server.once("listening", r));
      base = `http://127.0.0.1:${(server.address() as any).port}`;
    });
    beforeEach(async () => {
      actor = "admin";
      await pool.query("DELETE FROM reservations WHERE id=$1", [
        id("occupant"),
      ]);
      await pool.query(
        "UPDATE rooms SET bed_config='MAT',bed_config_revision=0,is_active=true WHERE id=$1",
        [id("room")],
      );
      await pool.query(
        "UPDATE reservations SET bed_type_notes=NULL,housekeeping_bed_preparation=NULL WHERE id=$1",
        [id("arrival")],
      );
    });
    afterAll(async () => {
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((r) => server.close(() => r()));
      }
      if (pool) {
        await pool.query(
          "DELETE FROM housekeeping_tasks WHERE room_id IN (SELECT id FROM rooms WHERE room_type_id=$1)",
          [id("type")],
        );
        await pool.query(
          "DELETE FROM reservation_changelog WHERE reservation_id IN (SELECT id FROM reservations WHERE guest_id=$1)",
          [id("guest")],
        );
        await pool.query("DELETE FROM audit_logs WHERE user_id=ANY($1)", [
          [id("admin"), id("worker")],
        ]);
        await pool.query("DELETE FROM reservations WHERE guest_id=$1", [
          id("guest"),
        ]);
        await pool.query("DELETE FROM guest_preferences WHERE guest_id=$1", [
          id("guest"),
        ]);
        await pool.query("DELETE FROM rooms WHERE room_type_id=$1", [
          id("type"),
        ]);
        await pool.query("DELETE FROM room_types WHERE id=$1", [id("type")]);
        await pool.query("DELETE FROM guests WHERE id=$1", [id("guest")]);
        await pool.query("DELETE FROM bed_types WHERE id=$1", [id("twn")]);
        await pool.query("DELETE FROM system_users WHERE id=ANY($1)", [
          [id("admin"), id("worker")],
        ]);
        await pool.end();
      }
    });
    it("requires supervisor access and validates the selected date", async () => {
      actor = "none";
      expect(
        (await api("GET", `/api/housekeeping/planning?date=${date}`)).status,
      ).toBe(401);
      actor = "worker";
      expect(
        (await api("GET", `/api/housekeeping/planning?date=${date}`)).status,
      ).toBe(403);
      expect((await api("POST", confirmPath(), confirm())).status).toBe(403);
      actor = "admin";
      for (const d of ["", "2095-02-30", "x"])
        expect(
          (await api("GET", `/api/housekeeping/planning?date=${d}`)).status,
        ).toBe(400);
    });
    it("reflects a same-day late checkout change without changing occupancy", async () => {
      await pool.query("UPDATE reservations SET late_check_out=true,late_check_out_time='15:00' WHERE id=$1",[id("departure")]);
      const first=await selected();
      expect(first.rooms.flatMap((r:any)=>r.requests).find((r:any)=>r.id===id("departure"))).toMatchObject({lateCheckOut:true,lateCheckOutTime:"15:00"});
      await pool.query("UPDATE reservations SET late_check_out_time='16:00' WHERE id=$1",[id("departure")]);
      const second=await selected();
      expect(second.rooms.flatMap((r:any)=>r.requests).find((r:any)=>r.id===id("departure"))).toMatchObject({lateCheckOut:true,lateCheckOutTime:"16:00"});
      expect((await storage.getRoom(id("room"))).status).toBe("dirty");
      await pool.query("UPDATE reservations SET late_check_out=false,late_check_out_time=NULL WHERE id=$1",[id("departure")]);
    });
    it("shows future requests, turnover, actual bed and tasks without projecting a future cleaning state", async () => {
      const data = await selected();
      expect(data.mode).toBe("future");
      expect(data.rooms.map((r: any) => r.id)).toEqual([
        id("room"),
        id("second"),
      ]);
      const room = data.rooms[0];
      expect(room.currentStatus).toBe("dirty");
      expect(room.currentBed).toBe("MAT");
      expect(room.requests.map((q: any) => q.id)).toEqual([
        id("departure"),
        id("arrival"),
      ]);
      expect(room.tasks[0]).toMatchObject({
        startedAt: "2095-02-02T11:00:00.000Z",
        completedAt: "2095-02-02T11:20:12.000Z",
        staffName: id("worker"),
      });
      expect(data.unassigned.map((q: any) => q.id)).toEqual([id("unassigned")]);
      expect(
        room.requests
          .find((q: any) => q.id === id("arrival"))
          .observations.map((o: any) => o.text),
      ).toContain("Almohada adicional");
      for (const forbidden of [
        "PRIVATE_",
        "1234567",
        "totalRoomAmount",
        "documentNumber",
        "phone",
      ])
        expect(JSON.stringify(data)).not.toContain(forbidden);
    });
    it("preserves history for a room now disabled and never invents an old physical status", async () => {
      await pool.query("UPDATE rooms SET is_active=false WHERE id=$1", [
        id("second"),
      ]);
      await pool.query(
        "INSERT INTO housekeeping_tasks(id,room_id,task_type,status,priority,scheduled_date,started_at,completed_at,created_at) VALUES ($1,$2,'deep_clean','completed','normal','2001-02-02','2001-02-02T10:00:00Z','2001-02-02T10:40:00Z',NOW())",
        [id("historic"), id("second")],
      );
      try {
        const data = await selected("2001-02-02");
        expect(data.mode).toBe("past");
        expect(
          data.rooms.find((r: any) => r.id === id("second")),
        ).toMatchObject({
          active: false,
          currentStatus: "dirty",
          tasks: [
            {
              id: id("historic"),
              startedAt: "2001-02-02T10:00:00.000Z",
              completedAt: "2001-02-02T10:40:00.000Z",
            },
          ],
        });
      } finally {
        await pool.query("DELETE FROM housekeeping_tasks WHERE id=$1", [
          id("historic"),
        ]);
        await pool.query("UPDATE rooms SET is_active=true WHERE id=$1", [
          id("second"),
        ]);
      }
    });
    it("confirms physical preparation and audits it without modifying No mover, cleanliness or money", async () => {
      const before = await storage.getReservation(id("arrival"));
      const result = await api("POST", confirmPath(), confirm());
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      expect(result.body).toMatchObject({
        bedConfig: "TWIN",
        bedRevision: 1,
        confirmedBy: id("admin"),
      });
      const after = await storage.getReservation(id("arrival"));
      expect(after.housekeepingPreparation).toEqual(
        before.housekeepingPreparation,
      );
      expect(after.totalRoomAmount).toBe(before.totalRoomAmount);
      expect(after.status).toBe(before.status);
      expect((await storage.getRoom(id("room"))).status).toBe("dirty");
      const data = await selected();
      expect(
        data.rooms[0].requests.find((r: any) => r.id === id("arrival"))
          .preparationCurrent,
      ).toBe(true);
      expect(
        (
          await pool.query(
            "SELECT count(*) FROM reservation_changelog WHERE reservation_id=$1 AND descripcion LIKE 'Camaje confirmado%'",
            [id("arrival")],
          )
        ).rows[0].count,
      ).toBe("1");
    });
    it("rejects stale requests and unsupported configurations", async () => {
      expect(
        (
          await api(
            "POST",
            confirmPath(),
            confirm({ expectedCurrentBedConfig: "TWIN" }),
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await api(
            "POST",
            confirmPath(),
            confirm({ expectedBedTypeNotes: "Viejo pedido" }),
          )
        ).status,
      ).toBe(409);
      expect(
        (await api("POST", confirmPath(), confirm({ bedConfig: "MAT_CC" })))
          .status,
      ).toBe(400);
    });
    it("does not revive old confirmations after physical changes and changes back", async () => {
      await api("POST", confirmPath(), confirm());
      await storage.updateRoom(id("room"), { bedConfig: "MAT" });
      await storage.updateRoom(id("room"), {
        bedConfig: "TWIN",
        bedConfigRevision: 1,
      });
      const data = await selected();
      const r = data.rooms[0].requests.find((r: any) => r.id === id("arrival"));
      expect(r.preparationCurrent).toBe(false);
      expect(data.rooms[0].currentBedRevision).toBe(3);
    });
    it("clears confirmation after request changes and cannot be forged through a generic reservation update", async () => {
      await api("POST", confirmPath(), confirm());
      await storage.updateReservation(id("arrival"), {
        bedTypeNotes: "Pedido nuevo",
      });
      expect(
        (await storage.getReservation(id("arrival")))
          .housekeepingBedPreparation,
      ).toBe(null);
      await storage.updateReservation(id("arrival"), {
        bedTypeNotes: null,
        housekeepingBedPreparation: {
          roomId: id("room"),
          bedConfig: "TWIN",
          bedRevision: 1,
          bedTypeId: id("twn"),
          bedTypeNotes: null,
          confirmedAt: new Date().toISOString(),
          confirmedBy: "forged",
        },
      });
      expect(
        (await storage.getReservation(id("arrival")))
          .housekeepingBedPreparation,
      ).toBe(null);
    });
    it("rejects preparation for a future arrival while another guest is still checked in", async () => {
      await pool.query(
        "INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,status,created_at) VALUES ($1::text,$1::text,$2,$3,$4,'2095-01-01','2095-02-01','checked_in',NOW())",
        [id("occupant"), id("guest"), id("type"), id("room")],
      );
      expect((await api("POST", confirmPath(), confirm())).status).toBe(409);
    });
    it("requires explicit review and serializes competing confirmations", async () => {
      expect(
        (
          await api(
            "POST",
            confirmPath(),
            confirm({ acknowledgeRequest: false }),
          )
        ).status,
      ).toBe(400);
      const replies = await Promise.all([
        api("POST", confirmPath(), confirm()),
        api("POST", confirmPath(), confirm()),
      ]);
      expect(replies.map((r) => r.status).sort()).toEqual([200, 409]);
    });
    it("rolls back the room and confirmation when history cannot be saved", async () => {
      await pool.query(
        `CREATE FUNCTION hk_plan_history_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reservation_id='${id("arrival")}' THEN RAISE EXCEPTION 'synthetic history failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER hk_plan_history_failure BEFORE INSERT ON reservation_changelog FOR EACH ROW EXECUTE FUNCTION hk_plan_history_failure()`,
      );
      try {
        expect((await api("POST", confirmPath(), confirm())).status).toBe(500);
        expect((await storage.getRoom(id("room"))).bedConfig).toBe("MAT");
        expect(
          (await storage.getReservation(id("arrival")))
            .housekeepingBedPreparation,
        ).toBe(null);
      } finally {
        await pool.query(
          "DROP TRIGGER hk_plan_history_failure ON reservation_changelog; DROP FUNCTION hk_plan_history_failure()",
        );
      }
    });
  },
);
