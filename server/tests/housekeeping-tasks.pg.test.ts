import express from "express";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
const url = process.env.DATABASE_URL;
const enabled = !!url && process.env.ALLOW_DESTRUCTIVE_PG_TESTS === "true";
if (enabled) {
  const u = new URL(url!);
  if (
    !["127.0.0.1", "localhost"].includes(u.hostname) ||
    !/test/i.test(u.pathname)
  )
    throw Error("Disposable local test database required.");
}
const prefix = "hk-task-" + randomUUID(),
  id = (s: string) => prefix + "-" + s;
let pool: pg.Pool,
  server: Server,
  base = "",
  today = "",
  actor = "admin",
  storage: any;
async function api(method: string, path: string, body?: any) {
  const r = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
}
const payload = (extra: any = {}) => ({
  roomIds: [id("room")],
  scheduledDate: today,
  assignedTo: id("worker"),
  taskType: "stayover_clean",
  priority: "high",
  notes: "Instrucciones completas",
  ...extra,
});
async function task(extra: any = {}) {
  const r = await api("POST", "/api/housekeeping/bulk", payload(extra));
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body[0];
}
async function occupied() {
  await pool.query(
    `INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,check_in_date,check_out_date,nights,status,created_at,housekeeping_preparation)
 VALUES ($1::text,$1::text,$2,$3,$4,$5,$5,1,'checked_in',NOW(),$6)`,
    [
      id("reservation"),
      id("guest"),
      id("room"),
      id("type"),
      today,
      JSON.stringify({
        roomId: id("room"),
        state: "prepared",
        note: "No mover",
        markedAt: new Date().toISOString(),
        markedBy: "Ana",
      }),
    ],
  );
}
describe.skipIf(!enabled)(
  "Housekeeping tasks · ownership and atomic lifecycle in PostgreSQL",
  () => {
    beforeAll(async () => {
      ({ pool } = await import("../db"));
      ({ storage } = await import("../db-storage"));
      today = (await import("../db-storage")).getArgentinaToday();
      await (await import("../permissions")).loadRolePermissionsCache();
      for (const name of ["admin", "worker", "other"])
        await pool.query(
          "INSERT INTO system_users(id,username,password,full_name,email,role,is_active,created_at) VALUES ($1::text,$1::text,'synthetic',$1::text,'hk@example.invalid',$2,'true',NOW())",
          [id(name), name === "admin" ? "admin" : "housekeeping"],
        );
      await pool.query(
        "INSERT INTO room_types(id,code,name) VALUES ($1::text,$1::text,'Housekeeping test')",
        [id("type")],
      );
      await pool.query(
        "INSERT INTO guests(id,first_name,last_name) VALUES ($1,'Synthetic','Housekeeping')",
        [id("guest")],
      );
      for (const room of ["room", "second"])
        await pool.query(
          "INSERT INTO rooms(id,room_number,room_type_id,status) VALUES ($1::text,$1::text,$2,'dirty')",
          [id(room), id("type")],
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
      (await import("../housekeepingTasks")).registerHousekeepingTaskRoutes(
        app,
      );
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((r) => server.once("listening", r));
      base = `http://127.0.0.1:${(server.address() as any).port}`;
    });
    beforeEach(async () => {
      actor = "admin";
      await pool.query("DELETE FROM housekeeping_tasks WHERE room_id=ANY($1)", [
        [id("room"), id("second")],
      ]);
      await pool.query("DELETE FROM reservations WHERE id=$1", [
        id("reservation"),
      ]);
      await pool.query(
        "UPDATE rooms SET status='dirty' WHERE room_type_id=$1",
        [id("type")],
      );
    });
    afterAll(async () => {
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((r) => server.close(() => r()));
      }
      if (pool) {
        await pool.query(
          "DELETE FROM housekeeping_tasks WHERE room_id=ANY($1)",
          [[id("room"), id("second")]],
        );
        await pool.query("DELETE FROM reservations WHERE id=$1", [
          id("reservation"),
        ]);
        await pool.query("DELETE FROM rooms WHERE room_type_id=$1", [
          id("type"),
        ]);
        await pool.query("DELETE FROM room_types WHERE id=$1", [id("type")]);
        await pool.query("DELETE FROM guests WHERE id=$1", [id("guest")]);
        await pool.query("DELETE FROM audit_logs WHERE user_id=ANY($1)", [
          [id("admin"), id("worker"), id("other")],
        ]);
        await pool.query("DELETE FROM system_users WHERE id=ANY($1)", [
          [id("admin"), id("worker"), id("other")],
        ]);
        await pool.end();
      }
    });
    it("requires authentication and supervisor permissions for management", async () => {
      actor = "none";
      expect((await api("GET", "/api/housekeeping")).status).toBe(401);
      actor = "worker";
      expect(
        (await api("POST", "/api/housekeeping/bulk", payload())).status,
      ).toBe(403);
      expect(
        (
          await api("POST", "/api/housekeeping/assign", {
            roomId: id("room"),
            date: today,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await api("PATCH", `/api/housekeeping/room/${id("room")}/status`, {
            status: "available",
          })
        ).status,
      ).toBe(403);
    });
    it("creates selected rooms with date, assignee, instructions and priority", async () => {
      const r = await api(
        "POST",
        "/api/housekeeping/bulk",
        payload({ roomIds: [id("room"), id("second")] }),
      );
      expect(r.status).toBe(201);
      expect(r.body).toHaveLength(2);
      expect(r.body[0]).toMatchObject({
        assignedTo: id("worker"),
        scheduledDate: today,
        priority: "high",
        notes: "Instrucciones completas",
        status: "pending",
      });
      expect(
        (
          await pool.query(
            "SELECT count(*) FROM audit_logs WHERE entity_id=ANY($1)",
            [r.body.map((t: any) => t.id)],
          )
        ).rows[0].count,
      ).toBe("2");
    });
    it("filters assigned tasks on server even without a date or with forged assignedTo", async () => {
      const t = await task();
      actor = "other";
      for (const query of ["", `?assignedTo=${id("worker")}`, `?date=${today}`])
        expect((await api("GET", "/api/housekeeping" + query)).body).toEqual(
          [],
        );
      expect((await api("GET", `/api/housekeeping/${t.id}`)).status).toBe(403);
      expect(
        (await api("POST", `/api/housekeeping/${t.id}/start`)).status,
      ).toBe(403);
      actor = "worker";
      expect(
        (await api("GET", "/api/housekeeping")).body.map((t: any) => t.id),
      ).toEqual([t.id]);
    });
    it("preserves occupied status on completion, even on scheduled checkout day, and No mover", async () => {
      await occupied();
      const marker = (await storage.getReservation(id("reservation")))
        .housekeepingPreparation;
      const t = await task();
      actor = "worker";
      expect(
        (await api("POST", `/api/housekeeping/${t.id}/start`)).status,
      ).toBe(200);
      const first = await api("POST", `/api/housekeeping/${t.id}/complete`);
      expect(first.status).toBe(200);
      expect((await storage.getRoom(id("room"))).status).toBe("limpia_ocupada");
      expect(
        (await storage.getReservation(id("reservation")))
          .housekeepingPreparation,
      ).toEqual(marker);
      expect((await storage.getReservation(id("reservation"))).status).toBe(
        "checked_in",
      );
      expect(
        (await api("POST", `/api/housekeeping/${t.id}/complete`)).body
          .completedAt,
      ).toBe(first.body.completedAt);
      expect(
        (await api("POST", `/api/housekeeping/${t.id}/inspect`)).status,
      ).toBe(403);
    });
    it("keeps inspection separate and records the actual supervisor", async () => {
      const t = await task();
      await api("POST", `/api/housekeeping/${t.id}/start`);
      expect(
        (await api("POST", `/api/housekeeping/${t.id}/complete`)).body.status,
      ).toBe("completed");
      const inspected = await api("POST", `/api/housekeeping/${t.id}/inspect`, {
        inspectedBy: "forged",
      });
      expect(inspected.body.inspectedBy).toBe(id("admin"));
      expect((await storage.getRoom(id("room"))).status).toBe("inspected");
    });
    it("uses real occupancy after checkout, not the original task type", async () => {
      await occupied();
      const t = await task();
      await api("POST", `/api/housekeeping/${t.id}/start`);
      await pool.query(
        "UPDATE reservations SET status='checked_out' WHERE id=$1",
        [id("reservation")],
      );
      await api("POST", `/api/housekeeping/${t.id}/complete`);
      expect((await storage.getRoom(id("room"))).status).toBe("available");
    });
    it("rejects completing a pending task and editing or deleting work already started", async () => {
      const t = await task();
      expect(
        (await api("POST", `/api/housekeeping/${t.id}/complete`)).status,
      ).toBe(409);
      await api("POST", `/api/housekeeping/${t.id}/start`);
      expect(
        (
          await api("PATCH", `/api/housekeeping/${t.id}`, {
            assignedTo: id("other"),
          })
        ).status,
      ).toBe(409);
      expect((await api("DELETE", `/api/housekeeping/${t.id}`)).status).toBe(
        409,
      );
    });
    it("reassigns pending work without losing instructions and immediately revokes former ownership", async () => {
      const t = await task();
      expect(
        (
          await api("PATCH", `/api/housekeeping/${t.id}`, {
            assignedTo: id("other"),
          })
        ).status,
      ).toBe(200);
      actor = "worker";
      expect(
        (await api("POST", `/api/housekeeping/${t.id}/start`)).status,
      ).toBe(403);
      actor = "other";
      const result = await api("POST", `/api/housekeeping/${t.id}/start`);
      expect(result.status).toBe(200);
      expect(result.body.notes).toBe("Instrucciones completas");
    });
    it("rejects an entire duplicate batch and concurrent duplicate submissions", async () => {
      await task();
      expect(
        (
          await api(
            "POST",
            "/api/housekeeping/bulk",
            payload({ roomIds: [id("second"), id("room")] }),
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await pool.query(
            "SELECT count(*) FROM housekeeping_tasks WHERE room_id=$1",
            [id("second")],
          )
        ).rows[0].count,
      ).toBe("0");
      const replies = await Promise.all([
        api(
          "POST",
          "/api/housekeeping/bulk",
          payload({ roomIds: [id("second")] }),
        ),
        api(
          "POST",
          "/api/housekeeping/bulk",
          payload({ roomIds: [id("second")] }),
        ),
      ]);
      expect(replies.map((r) => r.status).sort()).toEqual([201, 409]);
    });
    it("cannot start future work or forge lifecycle fields", async () => {
      const t = await task({ scheduledDate: "2099-01-01" });
      expect(
        (await api("POST", `/api/housekeeping/${t.id}/start`)).status,
      ).toBe(409);
      expect(
        (
          await api("PATCH", `/api/housekeeping/${t.id}`, {
            status: "completed",
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await api(
            "POST",
            "/api/housekeeping/bulk",
            payload({ assignedTo: id("missing") }),
          )
        ).status,
      ).toBe(400);
    });
    it("serializes starts of different tasks in the same room", async () => {
      const a = await task(),
        b = await task({ taskType: "deep_clean" });
      const replies = await Promise.all([
        api("POST", `/api/housekeeping/${a.id}/start`),
        api("POST", `/api/housekeeping/${b.id}/start`),
      ]);
      expect(replies.map((r) => r.status).sort()).toEqual([200, 409]);
    });
    it.each(["no_molestar", "maintenance", "oos"])(
      "does not overwrite %s when starting",
      async (status) => {
        const t = await task();
        await pool.query("UPDATE rooms SET status=$1 WHERE id=$2", [
          status,
          id("room"),
        ]);
        expect(
          (await api("POST", `/api/housekeeping/${t.id}/start`)).status,
        ).toBe(409);
        expect((await storage.getRoom(id("room"))).status).toBe(status);
      },
    );
    it("requires completion through the task instead of silently changing a running room to clean", async () => {
      const t = await task();
      await api("POST", `/api/housekeeping/${t.id}/start`);
      expect(
        (
          await api("PATCH", `/api/housekeeping/room/${id("room")}/status`, {
            status: "available",
          })
        ).status,
      ).toBe(409);
      expect((await storage.getHousekeepingTask(t.id)).status).toBe(
        "in_progress",
      );
    });
    it("does not approve an earlier cleaning while another task is running", async () => {
      const a = await task();
      await api("POST", `/api/housekeeping/${a.id}/start`);
      await api("POST", `/api/housekeeping/${a.id}/complete`);
      const b = await task({ taskType: "deep_clean" });
      await api("POST", `/api/housekeeping/${b.id}/start`);
      expect(
        (await api("POST", `/api/housekeeping/${a.id}/inspect`)).status,
      ).toBe(409);
      expect((await storage.getRoom(id("room"))).status).toBe("cleaning");
    });
    it("preserves No molestar set during an ongoing task", async () => {
      const t = await task();
      await api("POST", `/api/housekeeping/${t.id}/start`);
      await pool.query("UPDATE rooms SET status='no_molestar' WHERE id=$1", [
        id("room"),
      ]);
      expect(
        (await api("POST", `/api/housekeeping/${t.id}/complete`)).status,
      ).toBe(200);
      expect((await storage.getRoom(id("room"))).status).toBe("no_molestar");
    });
    it("permits finishing and verifying work started on the previous day", async () => {
      const t = await task();
      await api("POST", `/api/housekeeping/${t.id}/start`);
      await pool.query(
        "UPDATE housekeeping_tasks SET scheduled_date=scheduled_date-1 WHERE id=$1",
        [t.id],
      );
      expect(
        (await api("POST", `/api/housekeeping/${t.id}/complete`)).status,
      ).toBe(200);
      expect(
        (await api("POST", `/api/housekeeping/${t.id}/inspect`)).status,
      ).toBe(200);
    });
    it("inspection of a previous service does not clear today's pending cleaning", async () => {
      await occupied();
      const t = await task();
      await api("POST", `/api/housekeeping/${t.id}/start`);
      await api("POST", `/api/housekeeping/${t.id}/complete`);
      await pool.query("UPDATE rooms SET status='occupied',housekeeping_service_date='2020-01-01' WHERE id=$1", [id("room")]);
      expect((await api("POST", `/api/housekeeping/${t.id}/inspect`)).status).toBe(200);
      const room=await storage.getRoom(id("room"));
      expect(room.status).toBe("occupied");
      expect(room.housekeepingServiceDate).toBe("2020-01-01");
      expect((await storage.getHousekeepingTask(t.id)).status).toBe("inspected");
    });
    it("rolls back task and room state if audit persistence fails", async () => {
      const t = await task();
      await pool.query(
        `CREATE FUNCTION hk_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id = '${t.id}' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER hk_test_audit_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION hk_test_audit_failure()`,
      );
      try {
        expect(
          (await api("POST", `/api/housekeeping/${t.id}/start`)).status,
        ).toBe(500);
        expect((await storage.getHousekeepingTask(t.id)).status).toBe(
          "pending",
        );
        expect((await storage.getRoom(id("room"))).status).toBe("dirty");
      } finally {
        await pool.query(
          "DROP TRIGGER hk_test_audit_failure ON audit_logs; DROP FUNCTION hk_test_audit_failure()",
        );
      }
    });
  },
);
