import express from "express";
import http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prefix = "occupant-" + randomUUID();
let server: http.Server,
  base: string,
  reservationId: string,
  role = "admin";
const guestIds = [prefix, prefix + "-existing"];
async function request(body: object, group = prefix) {
  const res = await fetch(
    `${base}/api/groups/${group}/reservations/${reservationId}/occupant`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return { status: res.status, body: await res.json() };
}
suite("Asignación de huésped del grupo", () => {
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
    const { registerGroupOccupantRoutes } = await import(
      "../routes/group-occupant"
    );
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: prefix, username: "Prueba", role } as any;
      req.isAuthenticated = () => true;
      next();
    });
    registerGroupOccupantRoutes(app);
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
  it("reasigna una ficha existente conservando todos los demás campos", async () => {
    const before = (
      await pool.query("SELECT * FROM reservations WHERE id=$1", [
        reservationId,
      ])
    ).rows[0];
    const guestBefore = (
      await pool.query("SELECT * FROM guests WHERE id=$1", [guestIds[1]])
    ).rows[0];
    role = "reception";
    expect((await request({ guestId: guestIds[1] })).status).toBe(200);
    role = "admin";
    const after = (
      await pool.query("SELECT * FROM reservations WHERE id=$1", [
        reservationId,
      ])
    ).rows[0];
    expect(after).toEqual({ ...before, guest_id: guestIds[1] });
    expect(
      (await pool.query("SELECT * FROM guests WHERE id=$1", [guestIds[1]]))
        .rows[0],
    ).toEqual(guestBefore);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int n FROM guests WHERE id=ANY($1::varchar[])",
          [guestIds],
        )
      ).rows[0].n,
    ).toBe(2);
  });
  it("valida pertenencia, permisos y documento duplicado sin crear fichas", async () => {
    expect(
      (
        await request(
          {
            newGuest: {
              firstName: "Nuevo",
              lastName: "Prueba",
              documentNumber: prefix + "-invalid",
            },
          },
          prefix + "-other",
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request({
          newGuest: {
            firstName: "Nuevo",
            lastName: "Prueba",
            documentNumber: guestIds[1],
          },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request({
          guestId: guestIds[1],
          newGuest: { firstName: "N", lastName: "P" },
        })
      ).status,
    ).toBe(400);
    role = "housekeeping";
    expect((await request({ guestId: guestIds[1] })).status).toBe(403);
    role = "admin";
    expect(
      (
        await pool.query(
          "SELECT count(*)::int n FROM guests WHERE document_number=$1",
          [prefix + "-invalid"],
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("revierte el alta si falla el registro de asignación", async () => {
    // A temporary trigger fails after the insert and reservation update, proving rollback of both.
    const name = "occupant_fail_" + randomUUID().replaceAll("-", "");
    await pool.query(
      `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reservation_id='${reservationId}' THEN RAISE EXCEPTION 'assignment test failure'; END IF; RETURN NEW; END $$`,
    );
    await pool.query(
      `CREATE TRIGGER ${name} BEFORE INSERT ON reservation_changelog FOR EACH ROW EXECUTE FUNCTION ${name}()`,
    );
    try {
      const before = (
        await pool.query("SELECT guest_id FROM reservations WHERE id=$1", [
          reservationId,
        ])
      ).rows[0].guest_id;
      expect(
        (
          await request({
            newGuest: {
              firstName: "Nuevo",
              lastName: "Falla",
              documentNumber: prefix + "-rollback",
            },
          })
        ).status,
      ).toBe(500);
      expect(
        (
          await pool.query(
            "SELECT count(*)::int n FROM guests WHERE document_number=$1",
            [prefix + "-rollback"],
          )
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await pool.query("SELECT guest_id FROM reservations WHERE id=$1", [
            reservationId,
          ])
        ).rows[0].guest_id,
      ).toBe(before);
    } finally {
      await pool.query(`DROP TRIGGER ${name} ON reservation_changelog`);
      await pool.query(`DROP FUNCTION ${name}()`);
    }
  });
  it("crea ficha completa y la asigna una sola vez por documento", async () => {
    const body = {
      newGuest: {
        firstName: "Nueva",
        lastName: "Persona",
        documentType: "dni",
        documentNumber: prefix + "-new",
        phone: "123",
        email: "persona@example.com",
        direccion: "Calle 1",
        nationality: "Argentina",
      },
    };
    const [a, b] = await Promise.all([request(body), request(body)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const result = a.status === 200 ? a : b;
    expect(result.body.guest).toMatchObject(body.newGuest);
    expect(
      (
        await pool.query("SELECT guest_id FROM reservations WHERE id=$1", [
          reservationId,
        ])
      ).rows[0].guest_id,
    ).toBe(result.body.guest.id);
  });
});
