import express from "express";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
const enabled =
  !!process.env.DATABASE_URL &&
  process.env.ALLOW_DESTRUCTIVE_PG_TESTS === "true";
if (enabled) {
  const u = new URL(process.env.DATABASE_URL!);
  if (
    !["localhost", "127.0.0.1"].includes(u.hostname) ||
    !/test/i.test(u.pathname)
  )
    throw Error("Disposable local DB required");
}
const prefix = "spa-drag-" + randomUUID();
const fixtures: string[] = [];
let pool: pg.Pool,
  server: Server,
  base: string,
  role = "admin";
async function request(id: string, body: any) {
  const response = await fetch(`${base}/api/spa/appointments/${id}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
async function fixture() {
  const id = prefix + "-" + fixtures.length;
  fixtures.push(id);
  for (const suffix of ["c1", "c2"])
    await pool.query(
      "INSERT INTO spa_cabins(id,name,is_active)VALUES($1,'Synthetic cabin','true')",
      [id + suffix],
    );
  await pool.query(
    "INSERT INTO spa_treatments(id,name,duration_minutes,price,is_active,is_circuit)VALUES($1,'Synthetic treatment',60,1000,'true',false)",
    [id + "t"],
  );
  await pool.query(
    "INSERT INTO spa_appointments(id,cabin_id,treatment_id,guest_name,appointment_date,start_time,end_time,status,created_at,notes)VALUES($1,$2,$3,'Synthetic guest','2095-01-10','10:00','11:00','confirmed',NOW(),'Keep notes')",
    [id, id + "c1", id + "t"],
  );
  return {
    id,
    c1: id + "c1",
    c2: id + "c2",
    t: id + "t",
    body: {
      cabinId: id + "c2",
      startTime: "12:00",
      expected: {
        cabinId: id + "c1",
        treatmentId: id + "t",
        appointmentDate: "2095-01-10",
        startTime: "10:00",
        endTime: "11:00",
        status: "confirmed",
      },
    },
  };
}
const row = async (id: string) =>
  (await pool.query("SELECT * FROM spa_appointments WHERE id=$1", [id]))
    .rows[0];
describe.skipIf(!enabled)(
  "SPA planning movements with real availability locks",
  () => {
    beforeAll(async () => {
      pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      await (await import("../permissions")).loadRolePermissionsCache();
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.user = { id: prefix, username: "Synthetic", role } as any;
        req.isAuthenticated = () => role !== "none";
        next();
      });
      (await import("../routes/spa")).registerSpaRoutes(app);
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((r) => server.once("listening", r));
      base = `http://127.0.0.1:${(server.address() as any).port}`;
    });
    beforeEach(() => {
      role = "admin";
    });
    afterAll(async () => {
      if (server) await new Promise<void>((r) => server.close(() => r()));
      if (pool) {
        for (const id of fixtures) {
          await pool.query(
            "DELETE FROM sales_invoices WHERE spa_account_id=$1",
            [id],
          );
          await pool.query("DELETE FROM spa_payments WHERE account_id=$1", [
            id,
          ]);
          await pool.query(
            "DELETE FROM spa_account_items WHERE account_id=$1",
            [id],
          );
          await pool.query("DELETE FROM spa_accounts WHERE id=$1", [id]);
          await pool.query(
            "DELETE FROM spa_appointment_resources WHERE appointment_id=$1 OR appointment_id=$2",
            [id, id + "b"],
          );
          await pool.query(
            "DELETE FROM spa_appointments WHERE id=$1 OR id=$2",
            [id, id + "b"],
          );
          await pool.query("DELETE FROM spa_treatments WHERE id=$1", [
            id + "t",
          ]);
          await pool.query("DELETE FROM spa_cabins WHERE id=$1 OR id=$2", [
            id + "c1",
            id + "c2",
          ]);
        }
        await pool.query("DELETE FROM audit_logs WHERE user_id=$1", [prefix]);
        await pool.end();
      }
    });
    it("moves only the schedule, retaining duration, price, invoice and payments", async () => {
      const f = await fixture();
      await pool.query(
        "INSERT INTO spa_accounts(id,appointment_id,guest_name,status,total,total_paid,opened_at)VALUES($1,$1,'Synthetic','closed',1000,1000,NOW())",
        [f.id],
      );
      await pool.query(
        "INSERT INTO spa_payments(id,account_id,amount,method,created_at)VALUES($1,$1,1000,'cash',NOW())",
        [f.id],
      );
      await pool.query(
        "INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,estado,spa_account_id)VALUES('FB',9998,999998,CURRENT_DATE,'Synthetic','Consumidor Final',1000,1000,'emitida',$1)",
        [f.id],
      );
      const money = async () => ({
        accounts: (
          await pool.query("SELECT * FROM spa_accounts WHERE id=$1", [f.id])
        ).rows,
        payments: (
          await pool.query("SELECT * FROM spa_payments WHERE account_id=$1", [
            f.id,
          ])
        ).rows,
        invoices: (
          await pool.query(
            "SELECT * FROM sales_invoices WHERE spa_account_id=$1",
            [f.id],
          )
        ).rows,
      });
      const before = await row(f.id),
        savedMoney = await money();
      const result = await request(f.id, f.body);
      expect(result.status).toBe(200);
      expect(await row(f.id)).toEqual({
        ...before,
        cabin_id: f.c2,
        start_time: "12:00",
        end_time: "13:00",
      });
      expect(await money()).toEqual(savedMoney);
      expect(
        (
          await pool.query(
            "SELECT id FROM audit_logs WHERE entity_id=$1 AND description='Turno SPA reprogramado desde el planning'",
            [f.id],
          )
        ).rows,
      ).toHaveLength(1);
    });
    it("blocks an occupied cabin, allows touching departure times and retains the original after rejection", async () => {
      const f = await fixture();
      await pool.query(
        "INSERT INTO spa_appointments(id,cabin_id,treatment_id,guest_name,appointment_date,start_time,end_time,status,created_at)VALUES($1,$2,$3,'Other','2095-01-10','12:00','13:00','confirmed',NOW())",
        [f.id + "b", f.c2, f.t],
      );
      const before = await row(f.id);
      expect((await request(f.id, f.body)).status).toBe(409);
      expect(await row(f.id)).toEqual(before);
      expect(
        (await request(f.id, { ...f.body, startTime: "13:00" })).status,
      ).toBe(200);
    });
    it("checks cabins occupied by circuit resources too", async () => {
      const f = await fixture();
      await pool.query(
        "INSERT INTO spa_appointments(id,cabin_id,treatment_id,guest_name,appointment_date,start_time,end_time,status,created_at)VALUES($1,$2,$3,'Circuit parent','2095-01-10','15:00','16:00','confirmed',NOW())",
        [f.id + "b", f.c1, f.t],
      );
      await pool.query(
        "INSERT INTO spa_appointment_resources(id,appointment_id,cabin_id,start_time,end_time,duration_minutes,sort_order,created_at)VALUES($1,$1,$2,'12:00','13:00',60,0,NOW())",
        [f.id + "b", f.c2],
      );
      expect((await request(f.id, f.body)).status).toBe(409);
    });
    it("serializes two moves into the same empty slot", async () => {
      const f = await fixture();
      await pool.query(
        "INSERT INTO spa_appointments(id,cabin_id,treatment_id,guest_name,appointment_date,start_time,end_time,status,created_at)VALUES($1,$2,$3,'Second','2095-01-10','14:00','15:00','confirmed',NOW())",
        [f.id + "b", f.c1, f.t],
      );
      const results = await Promise.all([
        request(f.id, f.body),
        request(f.id + "b", {
          ...f.body,
          expected: {
            ...f.body.expected,
            startTime: "14:00",
            endTime: "15:00",
          },
        }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    });
    it("rejects a stale schedule without overwriting a newer change", async () => {
      const f = await fixture();
      await pool.query(
        "UPDATE spa_appointments SET start_time='10:30',end_time='11:30' WHERE id=$1",
        [f.id],
      );
      expect((await request(f.id, f.body)).status).toBe(409);
      expect((await row(f.id)).start_time).toBe("10:30");
    });
    it.each(["completed", "cancelled", "in_progress", "no_show"])(
      "blocks a %s appointment on the server",
      async (status) => {
        const f = await fixture();
        await pool.query("UPDATE spa_appointments SET status=$1 WHERE id=$2", [
          status,
          f.id,
        ]);
        expect(
          (
            await request(f.id, {
              ...f.body,
              expected: { ...f.body.expected, status },
            })
          ).status,
        ).toBe(409);
      },
    );
    it("rejects circuits, past dates, inactive cabins, invalid bounds and unrelated fields", async () => {
      const f = await fixture();
      await pool.query(
        "UPDATE spa_treatments SET is_circuit=true WHERE id=$1",
        [f.t],
      );
      expect((await request(f.id, f.body)).status).toBe(409);
      await pool.query(
        "UPDATE spa_treatments SET is_circuit=false WHERE id=$1",
        [f.t],
      );
      expect(
        (await request(f.id, { ...f.body, startTime: "21:30" })).status,
      ).toBe(400);
      expect((await request(f.id, { ...f.body, price: "1" })).status).toBe(400);
      await pool.query("UPDATE spa_cabins SET is_active='false' WHERE id=$1", [
        f.c2,
      ]);
      expect((await request(f.id, f.body)).status).toBe(409);
      await pool.query("UPDATE spa_cabins SET is_active='true' WHERE id=$1", [
        f.c2,
      ]);
      await pool.query(
        "UPDATE spa_appointments SET appointment_date='2000-01-01' WHERE id=$1",
        [f.id],
      );
      expect(
        (
          await request(f.id, {
            ...f.body,
            expected: { ...f.body.expected, appointmentDate: "2000-01-01" },
          })
        ).status,
      ).toBe(409);
    });
    it("enforces authentication and the existing SPA editing permission", async () => {
      const f = await fixture();
      role = "none";
      expect((await request(f.id, f.body)).status).toBe(401);
      role = "housekeeping";
      expect((await request(f.id, f.body)).status).toBe(403);
    });
  },
);
