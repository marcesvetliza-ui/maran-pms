import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const enabled =
  !!process.env.DATABASE_URL &&
  process.env.ALLOW_DESTRUCTIVE_PG_TESTS === "true";
if (enabled) {
  const u = new URL(process.env.DATABASE_URL!);
  if (
    !["localhost", "127.0.0.1"].includes(u.hostname) ||
    !/test/.test(u.pathname)
  )
    throw Error("Disposable test DB required");
}
const prefix = "hk-av-" + randomUUID(),
  id = (v: string) => prefix + v;
let pool: any,
  server: Server,
  base = "",
  actor = "admin";
async function api(method: string, path: string, body?: any) {
  const r = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() };
}
const path = () => `/api/housekeeping/availability/${id("worker")}/2095-02-02`;
const payload = {
  status: "working",
  shift: "night",
  startTime: "22:00",
  endTime: "06:00",
  notes: "Turno nocturno",
};
describe.skipIf(!enabled)(
  "Housekeeping availability persistence and access",
  () => {
    beforeAll(async () => {
      ({ pool } = await import("../db"));
      await (await import("../permissions")).loadRolePermissionsCache();
      for (const name of ["admin", "worker"])
        await pool.query(
          "INSERT INTO system_users(id,username,password,full_name,email,role,is_active,created_at)VALUES($1::text,$1::text,'synthetic',$1::text,'test@example.invalid',$2,'true',NOW())",
          [id(name), name === "admin" ? "admin" : "housekeeping"],
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
      (
        await import("../housekeepingAvailability")
      ).registerHousekeepingAvailability(app);
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((r) => server.once("listening", r));
      base = `http://127.0.0.1:${(server.address() as any).port}`;
    });
    afterAll(async () => {
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((r) => server.close(() => r()));
      }
      if (pool) {
        await pool.query(
          "DELETE FROM housekeeping_staff_availability WHERE user_id LIKE $1",
          [prefix + "%"],
        );
        await pool.query("DELETE FROM audit_logs WHERE user_id LIKE $1", [
          prefix + "%",
        ]);
        await pool.query("DELETE FROM system_users WHERE id LIKE $1", [
          prefix + "%",
        ]);
        await pool.end();
      }
    });
    it("restricts read and write to supervisors", async () => {
      actor = "worker";
      expect(
        (await api("GET", "/api/housekeeping/availability?date=2095-02-02"))
          .status,
      ).toBe(403);
      expect((await api("PUT", path(), payload)).status).toBe(403);
      actor = "none";
      expect(
        (await api("GET", "/api/housekeeping/availability?date=2095-02-02"))
          .status,
      ).toBe(401);
      actor = "admin";
    });
    it("stores per date, audits and normalizes non-working hours", async () => {
      expect((await api("PUT", path(), payload)).status).toBe(200);
      let r = await api(
        "GET",
        "/api/housekeeping/availability?date=2095-02-02",
      );
      expect(r.body.find((v: any) => v.userId === id("worker"))).toMatchObject({
        ...payload,
        taskCount: 0,
      });
      r = await api("GET", "/api/housekeeping/availability?date=2095-02-03");
      expect(
        r.body.find((v: any) => v.userId === id("worker")).status,
      ).toBeNull();
      expect(
        (await api("PUT", path(), { ...payload, status: "day_off" })).status,
      ).toBe(200);
      r = await api("GET", "/api/housekeeping/availability?date=2095-02-02");
      expect(r.body.find((v: any) => v.userId === id("worker"))).toMatchObject({
        status: "day_off",
        shift: null,
        startTime: null,
        endTime: null,
      });
      expect(
        (
          await pool.query("SELECT * FROM audit_logs WHERE user_id=$1", [
            id("admin"),
          ])
        ).rows,
      ).toHaveLength(2);
    });
    it("rejects malformed dates, hours and inactive users", async () => {
      expect(
        (await api("GET", "/api/housekeeping/availability?date=2095-02-30"))
          .status,
      ).toBe(400);
      expect(
        (await api("PUT", path(), { ...payload, endTime: null })).status,
      ).toBe(400);
      await pool.query(
        "UPDATE system_users SET is_active='false' WHERE id=$1",
        [id("worker")],
      );
      expect((await api("PUT", path(), payload)).status).toBe(404);
    });
  },
);
