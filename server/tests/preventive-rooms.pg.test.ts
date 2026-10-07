import express from "express";
import http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({ requireAuth: (req: any, _res: any, next: () => void) => { req.user = { id: "preventiva-test" }; next(); } }));

const clock = vi.hoisted(() => ({ today: undefined as string | undefined }));
vi.mock("../utils/argentinaDateTime", async importOriginal => {
  const actual = await importOriginal<typeof import("../utils/argentinaDateTime")>();
  return { ...actual, getArgentinaOperationalDate: () => clock.today ?? actual.getArgentinaOperationalDate() };
});

const permitted = !!process.env.DATABASE_URL && process.env.ALLOW_DESTRUCTIVE_PG_TESTS === "true" && process.env.RUN_PREVENTIVE_ROOMS_PG_TESTS === "true";
const suite = permitted ? describe : describe.skip;
const pool = permitted ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
const suffix = randomUUID();
const typeId = `preventiva-rt-${suffix}`;
const roomIds = [`preventiva-r1-${suffix}`, `preventiva-r2-${suffix}`];
let taskId = "";
const taskIds: string[] = [];
let server: http.Server;
let url = "";

suite("preventiva mensual por habitación con PostgreSQL real", () => {
  beforeAll(async () => {
    if (process.env.NODE_ENV === "production") throw new Error("No ejecutar sobre producción");
    // Esta prueba crea una tarea para TODAS las habitaciones: exigir base descartable vacía.
    const existing = await pool!.query("SELECT 1 FROM rooms LIMIT 1");
    if (existing.rows.length) throw new Error("Esta prueba requiere una base descartable sin habitaciones");
    await pool!.query("INSERT INTO room_types (id, code, name) VALUES ($1, $2, 'Prueba preventiva')", [typeId, `TP-${suffix}`]);
    for (let i = 0; i < 2; i++) await pool!.query(
      "INSERT INTO rooms (id, room_number, room_type_id, floor, status) VALUES ($1, $2, $3, 1, 'available')",
      [roomIds[i], String(901 + i), typeId],
    );
    const { ensureRoomPreventiveSchema } = await import("../maintenance/roomPreventiveSchema");
    await ensureRoomPreventiveSchema();
    const { registerMaintenanceRoutes } = await import("../routes/maintenance");
    const app = express(); app.use(express.json()); registerMaintenanceRoutes(app);
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Sin puerto HTTP");
    url = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    for (const taskId of taskIds) {
      await pool!.query("DELETE FROM preventive_room_completions WHERE task_id = $1", [taskId]);
      await pool!.query("DELETE FROM preventive_room_slots WHERE task_id = $1", [taskId]);
      await pool!.query("DELETE FROM preventive_tasks WHERE id = $1", [taskId]);
    }
    await pool!.query("DELETE FROM rooms WHERE id = ANY($1)", [roomIds]);
    await pool!.query("DELETE FROM room_types WHERE id = $1", [typeId]);
    await pool!.end();
    const { pool: appPool } = await import("../db"); await appPool.end();
  });

  it("crea una sola tarea, registra una vez por mes y cambia el vencimiento al completar todas", async () => {
    const endpoint = `${url}/api/maintenance/preventive`;
    const post = (path: string, body: object) => fetch(endpoint + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const created = await post("/rooms", { name: `Filtros ${suffix}` });
    expect(created.status).toBe(201);
    const task = await created.json(); taskId = task.id; taskIds.push(taskId);
    expect(task.room_count).toBe(2);
    expect(task.room_interval_months).toBe(1);
    expect((await pool!.query("SELECT count(*)::int AS n FROM preventive_tasks WHERE id = $1", [taskId])).rows[0].n).toBe(1);
    const rows = await (await fetch(`${endpoint}/${taskId}/rooms`)).json();
    expect(rows.map((r: any) => r.room_number)).toEqual(["901", "902"]);
    const first = await post(`/${taskId}/rooms/${roomIds[0]}/done`, { notes: "Filtro limpio" });
    expect(first.status).toBe(201);
    expect((await first.json()).completed).toBe(1);
    expect((await post(`/${taskId}/rooms/${roomIds[0]}/done`, {})).status).toBe(409);
    const second = await post(`/${taskId}/rooms/${roomIds[1]}/done`, {});
    expect(second.status).toBe(201);
    expect((await second.json()).completed).toBe(2);
    const { getArgentinaOperationalDate } = await import("../utils/argentinaDateTime");
    const { calendarMonthEnd } = await import("../maintenance/roomPreventiveSchema");
    const current = getArgentinaOperationalDate();
    const result = await pool!.query("SELECT next_due_at::text FROM preventive_tasks WHERE id = $1", [taskId]);
    expect(result.rows[0].next_due_at).toBe(calendarMonthEnd(current, true));
    const history = await (await fetch(`${endpoint}/${taskId}/rooms/${roomIds[0]}/history`)).json();
    expect(history).toMatchObject([{ notes: "Filtro limpio", performed_by: "preventiva-test" }]);

    const edit = await fetch(`${endpoint}/${taskId}/rooms`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Filtros editados ${suffix}`, description: "Limpieza mensual" }),
    });
    expect(edit.status).toBe(200);
    expect((await edit.json()).name).toBe(`Filtros editados ${suffix}`);
    expect((await pool!.query("SELECT count(*)::int AS n FROM preventive_room_completions WHERE task_id = $1", [taskId])).rows[0].n).toBe(2);

    const { calendarPeriod } = await import("../maintenance/roomPreventiveSchema");
    for (const months of [2, 3, 6, 12, 1]) {
      const changed = await fetch(`${endpoint}/${taskId}/rooms`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Filtros editados ${suffix}`, intervalMonths: months }),
      });
      expect(changed.status).toBe(200);
      const updated = await changed.json();
      expect(updated.room_interval_months).toBe(months);
      expect(updated.next_due_at).toBe(calendarPeriod(current, months, true).end);
      const summary = await (await fetch(endpoint)).json();
      expect(summary.find((r: any) => r.id === taskId).completed_count).toBe(2);
      const roomList = await (await fetch(`${endpoint}/${taskId}/rooms`)).json();
      expect(roomList.every((r: any) => r.done_at_current_month)).toBe(true);
      expect((await post(`/${taskId}/rooms/${roomIds[0]}/done`, {})).status).toBe(409);
    }
    for (const invalid of [0, 4, 13, "2", 1.5]) {
      expect((await post("/rooms", { name: `Invalid ${suffix}`, intervalMonths: invalid })).status).toBe(400);
      expect((await fetch(`${endpoint}/${taskId}/rooms`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Filtros editados ${suffix}`, intervalMonths: invalid }),
      })).status).toBe(400);
    }
    expect(calendarPeriod("2024-02-29", 2)).toEqual({ start: "2024-01-01", end: "2024-02-29" });
    expect(calendarPeriod("2026-12-31", 2, true)).toEqual({ start: "2027-01-01", end: "2027-02-28" });
    expect(calendarPeriod("2026-10-05", 3)).toEqual({ start: "2026-10-01", end: "2026-12-31" });
    expect(calendarPeriod("2026-10-05", 6)).toEqual({ start: "2026-07-01", end: "2026-12-31" });
    expect(calendarPeriod("2026-10-05", 12)).toEqual({ start: "2026-01-01", end: "2026-12-31" });

    const archived = await fetch(`${endpoint}/${taskId}/rooms`, { method: "DELETE" });
    expect(archived.status).toBe(200);
    const active = await (await fetch(endpoint)).json();
    expect(active.some((row: any) => row.id === taskId)).toBe(false);
    expect((await pool!.query("SELECT count(*)::int AS n FROM preventive_room_completions WHERE task_id = $1", [taskId])).rows[0].n).toBe(2);
    expect((await post(`/${taskId}/rooms/${roomIds[0]}/done`, {})).status).toBe(404);
  });
  it("crea bimestral, mantiene febrero cumplido y reinicia en marzo", async () => {
    clock.today = "2026-01-05";
    const endpoint = `${url}/api/maintenance/preventive`;
    const post = (path: string, body: object) => fetch(endpoint + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const created = await post("/rooms", { name: `Bimestral ${suffix}`, intervalMonths: 2 });
    expect(created.status).toBe(201);
    const task = await created.json(); taskIds.push(task.id);
    expect(task.next_due_at).toBe("2026-02-28");
    for (const room of roomIds) expect((await post(`/${task.id}/rooms/${room}/done`, {})).status).toBe(201);
    clock.today = "2026-02-20";
    expect((await post(`/${task.id}/rooms/${roomIds[0]}/done`, {})).status).toBe(409);
    let summary = await (await fetch(endpoint)).json();
    expect(summary.find((r: any) => r.id === task.id)).toMatchObject({ completed_count: 2, next_due_at: "2026-04-30" });
    clock.today = "2026-03-01";
    summary = await (await fetch(endpoint)).json();
    expect(summary.find((r: any) => r.id === task.id).completed_count).toBe(0);
    const rooms = await (await fetch(`${endpoint}/${task.id}/rooms`)).json();
    expect(rooms.every((r: any) => !r.done_at_current_month)).toBe(true);
    expect((await post(`/${task.id}/rooms/${roomIds[0]}/done`, {})).status).toBe(201);
    const history = await (await fetch(`${endpoint}/${task.id}/rooms/${roomIds[0]}/history`)).json();
    expect(history.map((r: any) => r.period)).toEqual(["2026-03-01", "2026-01-01"]);
    clock.today = undefined;
  });

});
