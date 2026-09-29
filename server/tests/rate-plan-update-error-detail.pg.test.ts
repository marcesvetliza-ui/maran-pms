/**
 * "No se pudo actualizar el plan tarifario" reportado por el hotel: la ruta
 * descartaba el error real de Postgres y el diálogo mostraba siempre el
 * mismo mensaje genérico, sin importar la causa — imposible de diagnosticar
 * a distancia. Ahora la ruta loguea y devuelve el mensaje real, y el
 * diálogo lo muestra (via parseApiError, ya usado en otras pantallas).
 */
import { randomUUID } from "node:crypto";
import express from "express";
import * as http from "node:http";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let baseUrl = "";
let server: http.Server;
let roomTypeId: string;
let ratePlanId: string;

async function request(method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}

suite("PostgreSQL real: PATCH /api/rate-plans/:id devuelve el error real, no uno genérico", () => {
  beforeAll(async () => {
    if (!pool) return;
    const { registerRoomsRoutes } = await import("../routes/rooms");
    const { loadRolePermissionsCache } = await import("../permissions");
    await loadRolePermissionsCache();
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: "rate-plan-error-pg", username: "rate-plan-error-pg", fullName: "Prueba", role: "admin" };
      req.isAuthenticated = () => true;
      next();
    });
    registerRoomsRoutes(app);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Sin puerto de prueba");
    baseUrl = `http://127.0.0.1:${address.port}`;

    const suffix = randomUUID();
    roomTypeId = `rate-error-rt-${suffix}`;
    ratePlanId = `rate-error-rp-${suffix}`;
    await pool.query(`INSERT INTO room_types (id, code, name) VALUES ($1, $2, $3)`, [roomTypeId, `RE-${suffix.slice(0, 6)}`, "Tipo Prueba"]);
    await pool.query(
      `INSERT INTO rate_plans (id, name, room_type_id, base_rate) VALUES ($1, $2, $3, 100.00)`,
      [ratePlanId, "Plan Prueba", roomTypeId],
    );
  });

  afterAll(async () => {
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (pool) {
      await pool.query(`DELETE FROM rate_plans WHERE id = $1`, [ratePlanId]);
      await pool.query(`DELETE FROM room_types WHERE id = $1`, [roomTypeId]);
      await pool.end();
    }
  });

  it("un baseRate no numérico falla con el detalle real de Postgres, no con el genérico", async () => {
    if (!pool) return;
    const res = await request("PATCH", `/api/rate-plans/${ratePlanId}`, { baseRate: "no-es-un-numero" });
    expect(res.status).toBe(500);
    expect(res.body.error).not.toBe("Error updating rate plan");
    expect(res.body.error.toLowerCase()).toMatch(/invalid input syntax|numeric/);
  });

  it("una fecha inválida en validFrom también surge el detalle real", async () => {
    if (!pool) return;
    const res = await request("PATCH", `/api/rate-plans/${ratePlanId}`, { validFrom: "esto-no-es-una-fecha" });
    expect(res.status).toBe(500);
    expect(res.body.error).not.toBe("Error updating rate plan");
    expect(res.body.error.toLowerCase()).toMatch(/invalid input syntax|date/);
  });

  it("una actualización válida sigue funcionando normalmente", async () => {
    if (!pool) return;
    const res = await request("PATCH", `/api/rate-plans/${ratePlanId}`, { baseRate: "150.00" });
    expect(res.status).toBe(200);
    expect(res.body.baseRate).toBe("150.00");
  });
});
