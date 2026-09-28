/**
 * Luciana Lisman (Jefa de Recepción) no podía editar tarifas — RATES_WRITE_ROLES
 * solo incluía admin/manager. El hotel pidió explícitamente que ese rol
 * pueda modificar todas las tarifas.
 */
import { randomUUID } from "node:crypto";
import express from "express";
import * as http from "node:http";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let roomTypeId: string;
let ratePlanId: string;

function startAppAs(role: string) {
  const app = express();
  app.use(express.json());
  app.use(async (req: any, _res: any, next: () => void) => {
    req.user = { id: `rate-plan-role-${role}`, username: `rate-plan-role-${role}`, fullName: "Prueba", role };
    req.isAuthenticated = () => true;
    next();
  });
  return app;
}

async function withApp(role: string, run: (baseUrl: string) => Promise<void>) {
  const { registerRoomsRoutes } = await import("../routes/rooms");
  const app = startAppAs(role);
  registerRoomsRoutes(app);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sin puerto de prueba");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

suite("PostgreSQL real: jefe_recepcion puede editar planes tarifarios", () => {
  beforeAll(async () => {
    if (!pool) return;
    const suffix = randomUUID();
    roomTypeId = `jr-access-rt-${suffix}`;
    ratePlanId = `jr-access-rp-${suffix}`;
    await pool.query(`INSERT INTO room_types (id, code, name) VALUES ($1, $2, $3)`, [roomTypeId, `JR-${suffix.slice(0, 6)}`, "Tipo Prueba JR"]);
    await pool.query(
      `INSERT INTO rate_plans (id, name, room_type_id, base_rate) VALUES ($1, $2, $3, 100.00)`,
      [ratePlanId, "Plan Prueba JR", roomTypeId],
    );
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(`DELETE FROM rate_plans WHERE id = $1`, [ratePlanId]);
      await pool.query(`DELETE FROM room_types WHERE id = $1`, [roomTypeId]);
      await pool.end();
    }
  });

  it("jefe_recepcion puede actualizar una tarifa (antes daba 403)", async () => {
    if (!pool) return;
    await withApp("jefe_recepcion", async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/rate-plans/${ratePlanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseRate: "120.00" }),
      });
      const body = await res.json();
      expect(res.status, JSON.stringify(body)).toBe(200);
      expect(body.baseRate).toBe("120.00");
    });
  });

  it("un rol sin relación con tarifas (ej. restaurant) sigue sin poder editar", async () => {
    if (!pool) return;
    await withApp("restaurant", async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/rate-plans/${ratePlanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseRate: "999.00" }),
      });
      expect(res.status).toBe(403);
    });
  });
});
