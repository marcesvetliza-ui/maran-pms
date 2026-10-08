import express from "express";
import http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prefix = "early-" + randomUUID();
let server: http.Server,
  base: string,
  reservationId: string,
  role = "admin";
const guestIds = [prefix, prefix + "-existing"];
async function request(body: object, group = prefix) {
  const res = await fetch(
    `${base}/api/groups/${group}/reservations/${reservationId}/rate`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return { status: res.status, body: await res.json() };
}
suite("Grupos: early check-in y late check-out", () => {
  beforeAll(async () => {
    await pool.query(
      "INSERT INTO room_types(id,code,name)VALUES($1,$2,'Occupant test')",
      [prefix, prefix],
    );
    await pool.query(
      "INSERT INTO rooms(id,room_number,room_type_id,status)VALUES($1,$2,$3,'available')",
      [prefix, prefix, prefix],
    );
    for (const id of guestIds)
      await pool.query(
        "INSERT INTO guests(id,first_name,last_name,document_number)VALUES($1,'Nombre','Apellido',$2)",
        [id, id],
      );
    await pool.query(
      "INSERT INTO groups(id,group_code,name,check_in_date,check_out_date,created_at)VALUES($1,$2,'Occupant test','2027-01-01','2027-01-03',now())",
      [prefix, prefix],
    );
    reservationId = (
      await pool.query(
        "INSERT INTO reservations(reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,nights,status,number_of_guests,created_at,final_rate_per_night)VALUES($1,$2,$3,$4,'2027-01-01','2027-01-03',2,'confirmed',1,now(),12500)RETURNING id",
        [prefix, prefix, prefix, prefix],
      )
    ).rows[0].id;
    await pool.query(
      "INSERT INTO group_reservation_links(group_id,reservation_id)VALUES($1,$2)",
      [prefix, reservationId],
    );
    const { loadRolePermissionsCache } = await import("../permissions");
    await loadRolePermissionsCache();
    const { registerGroupsRoutes } = await import(
      "../routes/groups"
    );
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: prefix, username: "Prueba", role } as any;
      req.isAuthenticated = () => true;
      next();
    });
    registerGroupsRoutes(app);
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterAll(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
    await pool.query(
      "DELETE FROM reservation_changelog WHERE reservation_id=$1",
      [reservationId],
    );
    await pool.query("DELETE FROM group_reservation_links WHERE group_id=$1", [
      prefix,
    ]);
    await pool.query("DELETE FROM audit_logs WHERE entity_id=$1", [reservationId]);
    await pool.query("DELETE FROM reservations WHERE id=$1", [reservationId]);
    await pool.query("DELETE FROM groups WHERE id=$1", [prefix]);
    await pool.query("DELETE FROM rooms WHERE id=$1", [prefix]);
    await pool.query("DELETE FROM room_types WHERE id=$1", [prefix]);
    await pool.query(
      "DELETE FROM guests WHERE id=ANY($1::varchar[]) OR document_number LIKE $2",
      [guestIds, prefix + "%"],
    );
    await pool.end();
    const { pool: appPool } = await import("../db");
    await appPool.end();
  });
  it("guarda el aviso, lo expone al planning y permite quitarlo sin cambiar tarifa", async () => {
    const before = (await pool.query("SELECT * FROM reservations WHERE id=$1", [reservationId])).rows[0];
    expect((await request({ earlyCheckIn: true, earlyCheckInTime: "08:30", lateCheckOut: true, lateCheckOutTime: "16:00" })).status).toBe(200);
    const { storage } = await import("../db-storage");
    const planning = await storage.getPlanningData("2026-12-31", "2027-01-04");
    expect(planning.reservations[reservationId]).toMatchObject({ earlyCheckIn: true, earlyCheckInTime: "08:30", lateCheckOut: true, lateCheckOutTime: "16:00" });
    expect(planning.occupancy[prefix][0]).toBe("early_blocked");
    expect((await request({ earlyCheckIn: false })).status).toBe(200);
    const after = (await pool.query("SELECT * FROM reservations WHERE id=$1", [reservationId])).rows[0];
    expect(after).toEqual({ ...before, early_check_in: false, early_check_in_time: null, late_check_out: true, late_check_out_time: "16:00" });
  });
  it("rechaza horas y opciones inválidas sin modificar la reserva", async () => {
    const before = (await pool.query("SELECT * FROM reservations WHERE id=$1", [reservationId])).rows[0];
    for (const body of [{ earlyCheckInTime: "25:00" }, { earlyCheckInTime: "08:99" }, { earlyCheckIn: "false" }]) expect((await request(body)).status).toBe(400);
    expect((await pool.query("SELECT * FROM reservations WHERE id=$1", [reservationId])).rows[0]).toEqual(before);
  });
});
