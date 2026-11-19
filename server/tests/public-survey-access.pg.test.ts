import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import express from "express";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : null;
let server: Server, base: string;
const stays: string[] = [],
  guests: string[] = [],
  rooms: string[] = [],
  roomType = randomUUID();
let fresh: string, expired: string, completed: string, early: string;
async function invitation(state = "checked_out", done = false, past = false) {
  const id = randomUUID(),
    guest = randomUUID(),
    room = randomUUID(),
    token = randomUUID();
  stays.push(id);
  guests.push(guest);
  rooms.push(room);
  await pool!.query(
    "INSERT INTO guests(id,first_name,last_name) VALUES($1,'Prueba','Encuesta pública')",
    [guest],
  );
  await pool!.query(
    "INSERT INTO rooms(id,room_number,room_type_id,status) VALUES($1::text,$1::text,$2,'available')",
    [room, roomType],
  );
  await pool!.query(
    "INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,check_in_date,check_out_date,status,created_at) VALUES($1::text,$1::text,$2,$3,$4,'2026-11-18','2026-11-19',$5,now())",
    [id, guest, room, roomType, state],
  );
  await pool!.query(
    "INSERT INTO survey_tokens(reservation_id,token,completed,expires_at) VALUES($1,$2,$3,(now() AT TIME ZONE 'UTC') + ($4::int*interval '1 day'))",
    [id, token, done, past ? -1 : 30],
  );
  return token;
}
async function call(path: string, method = "GET", body?: unknown) {
  const r = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}
suite("Public guest survey through the actual /api session gate", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.includes("test")
    )
      throw new Error("Disposable local test database required");
    await pool!.query(
      "INSERT INTO room_types(id,code,name,max_occupancy) VALUES($1::text,$1::text,'Encuesta sintética',2)",
      [roomType],
    );
    fresh = await invitation();
    expired = await invitation("checked_out", false, true);
    completed = await invitation("checked_out", true);
    early = await invitation("checked_in");
    const app = express();
    app.use(express.json());
    // Anonymous Passport state: no role, session identity or authentication mock.
    app.use((req: any, _res, next) => {
      req.isAuthenticated = () => false;
      req.session = {};
      next();
    });
    server = createServer(app);
    await (await import("../routes")).registerRoutes(server, app);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  }, 60000);
  afterAll(async () => {
    if (server)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    if (!pool) return;
    await pool.query(
      "DELETE FROM guest_reviews WHERE reservation_id=ANY($1::varchar[])",
      [stays],
    );
    await pool.query(
      "DELETE FROM survey_responses WHERE survey_token_id IN(SELECT id FROM survey_tokens WHERE reservation_id=ANY($1::varchar[]))",
      [stays],
    );
    await pool.query(
      "DELETE FROM survey_dispatches WHERE reservation_id=ANY($1::varchar[])",
      [stays],
    );
    await pool.query(
      "DELETE FROM survey_tokens WHERE reservation_id=ANY($1::varchar[])",
      [stays],
    );
    await pool.query("DELETE FROM reservations WHERE id=ANY($1::varchar[])", [
      stays,
    ]);
    await pool.query("DELETE FROM guests WHERE id=ANY($1::varchar[])", [
      guests,
    ]);
    await pool.query("DELETE FROM rooms WHERE id=ANY($1::varchar[])", [rooms]);
    await pool.query("DELETE FROM room_types WHERE id=$1", [roomType]);
    await pool.end();
    await (await import("../db")).pool.end();
  });
  it("opens a valid invitation anonymously, including a query string", async () => {
    const r = await call(`/api/survey/${fresh}?from=email`);
    expect(r.status).toBe(200);
    expect(r.body.guestName).toBe("Prueba Encuesta pública");
    expect(r.body.areas.length).toBeGreaterThan(0);
  });
  it("lets the survey validate an unknown token rather than demanding hotel login", async () => {
    expect(await call("/api/survey/" + randomUUID())).toMatchObject({
      status: 404,
      body: { error: "Encuesta no encontrada" },
    });
  });
  it("preserves expired/completed token validation", async () => {
    expect(await call("/api/survey/" + expired)).toMatchObject({
      status: 410,
      body: { error: "El enlace de la encuesta venció.", completed: false },
    });
    expect(await call("/api/survey/" + completed)).toMatchObject({
      status: 410,
      body: { completed: true },
    });
  });
  it("keeps the checkout requirement for a premature invitation", async () => {
    expect(await call("/api/survey/" + early)).toMatchObject({
      status: 409,
      body: { error: "La encuesta estará disponible después de tu salida." },
    });
  });
  it("keeps administration, other methods and nested survey paths protected", async () => {
    for (const path of [
      "/api/reviews",
      "/api/reviews/areas",
      "/api/reservations",
      "/api/cc-invoice-tracking",
      `/api/survey/${fresh}/admin`,
    ])
      expect((await call(path)).status, path).toBe(401);
    for (const method of ["PUT", "DELETE"])
      expect((await call("/api/survey/" + fresh, method)).status).toBe(401);
  });
  it("rejects an invalid anonymous response without consuming the invitation", async () => {
    expect(
      (await call("/api/survey/" + fresh, "POST", { ratingOverall: 99 }))
        .status,
    ).toBe(400);
    expect((await call("/api/survey/" + fresh)).status).toBe(200);
  });
  it("accepts one synthetic response without login, prevents duplicates and leaves financial tables untouched", async () => {
    const counts = async () =>
      (
        await pool!.query(
          "SELECT (SELECT count(*) FROM sales_invoices) invoices,(SELECT count(*) FROM payments) payments,(SELECT count(*) FROM account_movements) accounts,(SELECT count(*) FROM cash_movements) cash",
        )
      ).rows[0];
    const before = await counts();
    const response = {
      ratingOverall: 5,
      areaRatings: {},
      areaQuestions: {},
      comment: "Prueba automatizada local",
    };
    expect(await call("/api/survey/" + fresh, "POST", response)).toMatchObject({
      status: 200,
      body: { ok: true, alreadyCompleted: false },
    });
    expect((await call("/api/survey/" + fresh, "POST", response)).status).toBe(
      200,
    );
    expect(await call("/api/survey/" + fresh)).toMatchObject({
      status: 410,
      body: { completed: true },
    });
    expect(
      (
        await pool!.query(
          "SELECT count(*)::int n FROM survey_responses s JOIN survey_tokens t ON t.id=s.survey_token_id WHERE t.token=$1",
          [fresh],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(await counts()).toEqual(before);
  });
});
