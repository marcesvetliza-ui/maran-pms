import express from "express";
import http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({ requireAuth: (req: any, _res: any, next: () => void) => { req.user = { id: "preventiva-test" }; next(); } }));

const permitted = !!process.env.DATABASE_URL && process.env.ALLOW_DESTRUCTIVE_PG_TESTS === "true" && process.env.RUN_PREVENTIVE_ROOMS_PG_TESTS === "true";
const suite = permitted ? describe : describe.skip;
const pool = permitted ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
const suffix = randomUUID();
const typeId = `preventiva-rt-${suffix}`;
const roomIds = [`preventiva-r1-${suffix}`, `preventiva-r2-${suffix}`];
let taskId = "";
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
    if (taskId) {
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
    const task = await created.json(); taskId = task.id;
    expect(task.room_count).toBe(2);
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
  });
});
