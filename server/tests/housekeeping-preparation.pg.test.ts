import express from "express";
import http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prefix = "prep-" + randomUUID(),
  room2 = prefix + "-2";
let base = "",
  server: http.Server,
  role = "admin";
let reservationId: string;
async function request(method: string, path: string, body?: object) {
  const response = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}
suite("Housekeeping: preparación especial por reserva", () => {
  beforeAll(async () => {
    await pool.query(
      "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS housekeeping_preparation jsonb",
    );
    await pool.query(
      "INSERT INTO room_types(id,code,name)VALUES($1,$2,'Preparación prueba')",
      [prefix, prefix],
    );
    for (const id of [prefix, room2])
      await pool.query(
        "INSERT INTO rooms(id,room_number,room_type_id,status)VALUES($1,$2,$3,'dirty')",
        [id, id, prefix],
      );
    await pool.query(
      "INSERT INTO guests(id,first_name,last_name)VALUES($1,'Huésped','Preparación')",
      [prefix],
    );
    reservationId = (
      await pool.query(
        "INSERT INTO reservations(reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,nights,status,number_of_guests,created_at)VALUES($1,$2,$3,$4,'2027-01-01','2027-01-03',2,'confirmed',1,now())RETURNING id",
        [prefix, prefix, prefix, prefix],
      )
    ).rows[0].id;
    const { loadRolePermissionsCache } = await import("../permissions");
    await loadRolePermissionsCache();
    const { registerRoutes } = await import("../routes");
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: prefix, username: "Operador preparación", role } as any;
      req.isAuthenticated = () => true;
      next();
    });
    server = http.createServer(app);
    await registerRoutes(server, app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterAll(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
    const all = await pool.query(
      "SELECT id FROM reservations WHERE guest_id=$1",
      [prefix],
    );
    for (const r of all.rows) {
      await pool.query(
        "DELETE FROM reservation_changelog WHERE reservation_id=$1",
        [r.id],
      );
      await pool.query("DELETE FROM audit_logs WHERE entity_id=$1", [r.id]);
      await pool.query("DELETE FROM reservations WHERE id=$1", [r.id]);
    }
    await pool.query("DELETE FROM rooms WHERE room_type_id=$1", [prefix]);
    await pool.query("DELETE FROM room_types WHERE id=$1", [prefix]);
    await pool.query("DELETE FROM guests WHERE id=$1", [prefix]);
    await pool.end();
    const { pool: appPool } = await import("../db");
    await appPool.end();
  });
  it("marca limpia, conserva el aviso al cambiar limpieza y exige confirmación vigente para mover", async () => {
    expect(
      (
        await request("PUT", `/api/housekeeping/room/${prefix}/preparation`, {
          reservationId,
          action: "mark",
          note: "Cuna preparada",
        })
      ).status,
    ).toBe(200);
    expect(
      (await pool.query("SELECT status FROM rooms WHERE id=$1", [prefix]))
        .rows[0].status,
    ).toBe("available");
    const { storage } = await import("../db-storage");
    const planning = await storage.getPlanningData("2027-01-01", "2027-01-03");
    expect(
      planning.reservations[reservationId].housekeepingPreparation?.note,
    ).toBe("Cuna preparada");
    await request("PATCH", `/api/housekeeping/room/${prefix}/status`, {
      status: "dirty",
    });
    expect(
      (await storage.getReservation(reservationId))?.housekeepingPreparation
        ?.state,
    ).toBe("prepared");
    const blocked = await request(
      "PATCH",
      `/api/reservations/${reservationId}`,
      { roomId: room2 },
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("HOUSEKEEPING_PREPARATION_WARNING");
    expect((await storage.getReservation(reservationId))?.roomId).toBe(prefix);
    expect(
      (
        await request("PATCH", `/api/reservations/${reservationId}`, {
          roomId: room2,
          acknowledgeHousekeepingPreparation: "viejo",
        })
      ).status,
    ).toBe(409);
    const moved = await request("PATCH", `/api/reservations/${reservationId}`, {
      roomId: room2,
      acknowledgeHousekeepingPreparation: blocked.body.preparationVersion,
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(moved.body.housekeepingPreparation).toMatchObject({
      roomId: room2,
      state: "review",
      previousRoomId: prefix,
      note: "Cuna preparada",
      movedBy: "Operador preparación",
    });
    const hk = await request("GET", "/api/housekeeping/preparations");
    expect(
      hk.body.find((r: any) => r.id === reservationId).housekeeping_preparation
        .state,
    ).toBe("review");
    expect(
      (
        await request("PUT", `/api/housekeeping/room/${prefix}/preparation`, {
          reservationId,
          action: "clear",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request("PUT", `/api/housekeeping/room/${room2}/preparation`, {
          reservationId,
          action: "clear",
        })
      ).status,
    ).toBe(200);
    expect(
      (await storage.getReservation(reservationId))?.housekeepingPreparation,
    ).toBeNull();
  });
  it("un registro nuevo no hereda un aviso de otra reserva", async () => {
    const { storage } = await import("../db-storage");
    const r = await storage.createReservation({
      createdAt: new Date(),
      reservationCode: prefix + "-new",
      guestId: prefix,
      roomTypeId: prefix,
      roomId: prefix,
      checkInDate: "2027-02-01",
      checkOutDate: "2027-02-03",
      nights: 2,
      status: "confirmed",
      numberOfGuests: 1,
      housekeepingPreparation: {
        roomId: prefix,
        state: "prepared",
        note: "No copiar",
        markedAt: "2026-01-01",
        markedBy: "Otro",
      },
    });
    expect(r.housekeepingPreparation).toBeNull();
  });
  it("rechaza notas excesivas y no permite marcar reservas ajenas a la habitación", async () => {
    expect(
      (
        await request("PUT", `/api/housekeeping/room/${room2}/preparation`, {
          reservationId,
          action: "mark",
          note: "a".repeat(501),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("PUT", `/api/housekeeping/room/${prefix}/preparation`, {
          reservationId,
          action: "mark",
        })
      ).status,
    ).toBe(409);
  });
  it('no deja avisos activos para estadías finalizadas y respeta el permiso de Housekeeping',async()=>{
    await pool.query("UPDATE reservations SET status='checked_out' WHERE id=$1",[reservationId]);
    expect((await request('PUT',`/api/housekeeping/room/${room2}/preparation`,{reservationId,action:'mark'})).status).toBe(409);
    expect((await request('GET','/api/housekeeping/preparations')).body.some((r:any)=>r.id===reservationId)).toBe(false);
    await pool.query("UPDATE reservations SET status='confirmed' WHERE id=$1",[reservationId]);
    role='restaurant';
    try{expect((await request('PUT',`/api/housekeeping/room/${room2}/preparation`,{reservationId,action:'mark'})).status).toBe(403);expect((await request('GET','/api/housekeeping/preparations')).status).toBe(403);}finally{role='admin';}
  });

});
