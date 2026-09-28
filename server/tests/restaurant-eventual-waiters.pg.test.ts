/**
 * Mozos eventuales: personal ocasional de Restaurant sin usuario del sistema
 * (sin login, sin email) — se crean al vuelo desde el selector de mozo y
 * quedan disponibles para elegir de nuevo. restaurant_orders.waiter_name ya
 * es un snapshot de texto libre (no una FK a system_users), así que un mozo
 * eventual solo necesita aportar un nombre para que todo lo demás (mostrar
 * en pantalla, comanda, PDF, reporte de ventas por mozo) siga funcionando
 * igual, sin tocar ningún otro lugar del código.
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

async function request(method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as any };
}

suite("PostgreSQL real: mozos eventuales de Restaurant", () => {
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

  it("se puede crear uno, aparece activo en la lista, y una orden real lo guarda como texto libre", async () => {
    if (!pool) return;
    const fullName = `Juan Eventual Test ${randomUUID()}`;
    let waiterId: string | undefined;
    let orderId: string | undefined;
    try {
      const created = await request("POST", "/api/restaurant/eventual-waiters", { fullName });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      waiterId = created.body.id;
      expect(created.body.fullName).toBe(fullName);
      expect(created.body.isActive).toBe("true");

      const list = await request("GET", "/api/restaurant/eventual-waiters");
      expect(list.status).toBe(200);
      expect(list.body.some((w: any) => w.id === waiterId)).toBe(true);

      // Una orden real lo guarda como texto libre — no requiere que exista
      // en system_users para nada.
      const orderRow = await pool.query<{ id: string; waiter_name: string }>(
        `INSERT INTO restaurant_orders (id, order_number, order_type, status, covers, waiter_name, total, opened_at)
         VALUES (gen_random_uuid(), $1, 'dine_in', 'open', 1, $2, 0, now())
         RETURNING id, waiter_name`,
        [`ORD-TEST-${randomUUID()}`, fullName],
      );
      orderId = orderRow.rows[0].id;
      expect(orderRow.rows[0].waiter_name).toBe(fullName);
    } finally {
      if (orderId) await pool.query("DELETE FROM restaurant_orders WHERE id = $1", [orderId]);
      if (waiterId) await pool.query("DELETE FROM eventual_waiters WHERE id = $1", [waiterId]);
    }
  });

  it("rechaza crear uno sin nombre", async () => {
    if (!pool) return;
    const res = await request("POST", "/api/restaurant/eventual-waiters", { fullName: "   " });
    expect(res.status).toBe(400);
  });

  it("desactivar uno lo saca de la lista activa (activeOnly por defecto)", async () => {
    if (!pool) return;
    const fullName = `Maria Eventual Test ${randomUUID()}`;
    let waiterId: string | undefined;
    try {
      const created = await request("POST", "/api/restaurant/eventual-waiters", { fullName });
      waiterId = created.body.id;

      const patched = await request("PATCH", `/api/restaurant/eventual-waiters/${waiterId}`, { isActive: "false" });
      expect(patched.status, JSON.stringify(patched.body)).toBe(200);
      expect(patched.body.isActive).toBe("false");

      const activeList = await request("GET", "/api/restaurant/eventual-waiters");
      expect(activeList.body.some((w: any) => w.id === waiterId)).toBe(false);

      const fullList = await request("GET", "/api/restaurant/eventual-waiters?activeOnly=false");
      expect(fullList.body.some((w: any) => w.id === waiterId)).toBe(true);
    } finally {
      if (waiterId) await pool.query("DELETE FROM eventual_waiters WHERE id = $1", [waiterId]);
    }
  });
});
