/**
 * Quién aparece como mozo en Restaurant era puramente role === "restaurant"
 * — mezclaba mozos con cocina (mismo rol) y no dejaba sumar gente de otra
 * área que también atiende mesas (ver client/src/pages/restaurant.tsx). Ahora
 * es un flag independiente (es_mozo) que GET /api/staff/users expone y que
 * el cliente usa para armar la lista de mozos, sin importar el rol real del
 * usuario. Este test prueba los cuatro casos reales que motivaron el cambio:
 * un usuario de Eventos que sí es mozo, uno de Restaurant (cocina) que no lo
 * es, uno de Restaurant que se saca, y uno de Responsable de Área que se
 * suma.
 */

import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: (_roles: string[]) => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let server: http.Server;
let baseUrl: string;

suite("PostgreSQL real: GET /api/staff/users expone es_mozo independiente del rol", () => {
  beforeAll(async () => {
    const { registerRoutes } = await import("../routes");
    const app = express();
    app.use(express.json());
    server = http.createServer(app);
    await registerRoutes(server, app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Sin puerto de prueba");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool?.end();
  });

  it("un usuario de Eventos marcado es_mozo aparece, uno de Restaurant (cocina) no", async () => {
    if (!pool) return;
    const suffix = randomUUID();
    const userIds: string[] = [];
    try {
      const eventos = await pool.query<{ id: string }>(
        `INSERT INTO system_users (id, username, email, full_name, role, es_mozo, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'Martin Gimenez Test', 'events', 'true', now()) RETURNING id`,
        [`martin.test.${suffix}`, `martin.${suffix}@test.com`],
      );
      userIds.push(eventos.rows[0].id);

      const cocina = await pool.query<{ id: string }>(
        `INSERT INTO system_users (id, username, email, full_name, role, es_mozo, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'Miguel Santorini Test', 'restaurant', 'false', now()) RETURNING id`,
        [`miguel.test.${suffix}`, `miguel.${suffix}@test.com`],
      );
      userIds.push(cocina.rows[0].id);

      const respArea = await pool.query<{ id: string }>(
        `INSERT INTO system_users (id, username, email, full_name, role, es_mozo, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'Gonzalo Villanueva Test', 'responsable_area', 'true', now()) RETURNING id`,
        [`gonzalo.test.${suffix}`, `gonzalo.${suffix}@test.com`],
      );
      userIds.push(respArea.rows[0].id);

      const res = await fetch(`${baseUrl}/api/staff/users`);
      expect(res.status).toBe(200);
      const users: Array<{ id: string; fullName: string; role: string; esMozo: string | null }> = await res.json();

      const martin = users.find((u) => u.id === eventos.rows[0].id);
      const miguel = users.find((u) => u.id === cocina.rows[0].id);
      const gonzalo = users.find((u) => u.id === respArea.rows[0].id);

      expect(martin?.esMozo).toBe("true");
      expect(martin?.role).toBe("events");
      expect(miguel?.esMozo).toBe("false");
      expect(miguel?.role).toBe("restaurant");
      expect(gonzalo?.esMozo).toBe("true");
      expect(gonzalo?.role).toBe("responsable_area");

      // La lista de mozos del cliente filtra por esMozo === "true", no por rol.
      const mozos = users.filter((u) => u.esMozo === "true").map((u) => u.id);
      expect(mozos).toContain(martin!.id);
      expect(mozos).toContain(gonzalo!.id);
      expect(mozos).not.toContain(miguel!.id);
    } finally {
      if (userIds.length) await pool.query("DELETE FROM system_users WHERE id = ANY($1::varchar[])", [userIds]);
    }
  });

  it("PATCH /api/admin/users/:id puede prender o apagar es_mozo sin tocar el rol", async () => {
    if (!pool) return;
    const suffix = randomUUID();
    let userId: string | undefined;
    try {
      const created = await pool.query<{ id: string }>(
        `INSERT INTO system_users (id, username, email, full_name, role, es_mozo, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'Carlos Lopez Test', 'restaurant', 'true', now()) RETURNING id`,
        [`carlos.test.${suffix}`, `carlos.${suffix}@test.com`],
      );
      userId = created.rows[0].id;

      const patched = await fetch(`${baseUrl}/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ esMozo: "false" }),
      });
      expect(patched.status, JSON.stringify(await patched.clone().json())).toBe(200);
      const body = await patched.json();
      expect(body.esMozo).toBe("false");
      expect(body.role).toBe("restaurant");
    } finally {
      if (userId) await pool.query("DELETE FROM system_users WHERE id = $1", [userId]);
    }
  });
});
