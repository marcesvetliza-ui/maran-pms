/**
 * Mozos eventuales: personal ocasional de Restaurant sin usuario del sistema
 * (sin login, sin email) — se crean al vuelo desde el selector de mozo y
 * quedan disponibles solo en su turno. restaurant_orders.waiter_name ya
 * es un snapshot de texto libre (no una FK a system_users), así que un mozo
 * eventual solo necesita aportar un nombre para que todo lo demás (mostrar
 * en pantalla, comanda, PDF, reporte de ventas por mozo) siga funcionando
 * igual, sin tocar ningún otro lugar del código.
 */

import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: (_roles: string[]) => (_req: any, _res: any, next: () => void) => next(),
  requirePermission: (_resourceKey: string) => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));

const allowed = process.env.DATABASE_URL === "postgresql://postgres@127.0.0.1:55448/restaurant_eventual_test" ||
  (process.env.CI === "true" && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):5432\/maran_test$/.test(process.env.DATABASE_URL || ""));
const suite = allowed ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let server: http.Server;
let baseUrl: string;
let shiftId: string;
let inheritedOpenShiftIds: string[] = [];
const shifts: string[] = [], waiters: string[] = [], orders: string[] = [];
let storage: typeof import("../db-storage").storage;

async function request(method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = { status: response.status, body: (await response.json()) as any };
  if (method === "POST" && path === "/api/restaurant/eventual-waiters" && result.status === 201) waiters.push(result.body.id);
  return result;
}

suite("PostgreSQL real: mozos eventuales de Restaurant", () => {
  beforeAll(async () => {
    await pool!.query("ALTER TABLE eventual_waiters ADD COLUMN IF NOT EXISTS cash_shift_id varchar REFERENCES cash_shifts(id)");
    // Other suites may leave open synthetic shifts in the shared CI database.
    // Temporarily isolate this roster, restoring the prior state after the suite.
    inheritedOpenShiftIds = (await pool!.query(
      "UPDATE cash_shifts SET status='closed' WHERE area='restaurant' AND status='open' RETURNING id",
    )).rows.map(row => row.id);
    storage = (await import("../db-storage")).storage;
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
  beforeEach(async () => {
    shiftId = randomUUID(); shifts.push(shiftId);
    await pool!.query("INSERT INTO cash_shifts(id,area,shift_number,status,opened_by,opened_at) VALUES($1,'restaurant',1,'open','Eventual test',now())", [shiftId]);
  });
  afterEach(async () => {
    await pool!.query("UPDATE cash_shifts SET status='closed' WHERE id=ANY($1::varchar[])", [shifts]);
  });

  afterAll(async () => {
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (pool) {
      await pool.query("DELETE FROM restaurant_orders WHERE id=ANY($1::varchar[])", [orders]);
      await pool.query("DELETE FROM eventual_waiters WHERE id=ANY($1::varchar[])", [waiters]);
      await pool.query("DELETE FROM cash_closing_summaries WHERE shift_id=ANY($1::varchar[])", [shifts]);
      await pool.query("DELETE FROM cash_shifts WHERE id=ANY($1::varchar[])", [shifts]);
      if (inheritedOpenShiftIds.length) await pool.query(
        "UPDATE cash_shifts SET status='open' WHERE id=ANY($1::varchar[])", [inheritedOpenShiftIds],
      );
      await pool.end();
    }
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
  it("expires the old roster on real shift close, preserves open orders and allows registering again", async () => {
    const fullName = `Eventual ${randomUUID()}`;
    const first = await request("POST", "/api/restaurant/eventual-waiters", { fullName });
    const order = await storage.createRestaurantOrder({ orderNumber: randomUUID(), orderType: "dine_in", status: "open", covers: 1, waiterName: fullName, total: "0", openedAt: new Date() });
    orders.push(order.id);
    const closed = await storage.closeShift(shiftId, "Eventual test", 0);
    shifts.push(closed.turnoNuevo.id);
    expect((await request("GET", "/api/restaurant/eventual-waiters")).body.some((w: any) => w.id === first.body.id)).toBe(false);
    expect((await pool!.query("SELECT waiter_name,status FROM restaurant_orders WHERE id=$1", [order.id])).rows[0]).toEqual({ waiter_name: fullName, status: "open" });
    expect((await request("GET", "/api/restaurant/eventual-waiters?activeOnly=false")).body.some((w: any) => w.id === first.body.id)).toBe(true);
    expect((await request("PATCH", `/api/restaurant/eventual-waiters/${first.body.id}`, { isActive: "true" })).status).toBe(409);
    await expect(storage.createRestaurantOrder({ orderNumber: randomUUID(), orderType: "dine_in", covers: 1, waiterName: fullName, total: "0", openedAt: new Date() })).rejects.toMatchObject({ statusCode: 409 });
    const second = await request("POST", "/api/restaurant/eventual-waiters", { fullName });
    expect(second.status).toBe(201); expect(second.body.id).not.toBe(first.body.id); expect(second.body.cashShiftId).toBe(closed.turnoNuevo.id);
  });
  it("requires an open restaurant shift, independently of reception and SPA", async () => {
    await pool!.query("UPDATE cash_shifts SET status='closed' WHERE id=$1", [shiftId]);
    for (const area of ["reception", "spa"]) {
      const id = randomUUID(); shifts.push(id);
      await pool!.query("INSERT INTO cash_shifts(id,area,shift_number,status,opened_at) VALUES($1,$2,1,'open',now())", [id, area]);
    }
    const result = await request("POST", "/api/restaurant/eventual-waiters", { fullName: `No shift ${randomUUID()}` });
    expect(result.status).toBe(409); expect(result.body.error).toContain("Restaurante");
  });
  it("deduplicates concurrent registrations within a shift without merging past shifts", async () => {
    const name = `Concurrent ${randomUUID()}`;
    const [a, b] = await Promise.all([request("POST", "/api/restaurant/eventual-waiters", { fullName: name }), request("POST", "/api/restaurant/eventual-waiters", { fullName: name.toUpperCase() })]);
    expect(a.status).toBe(201); expect(b.status).toBe(201); expect(a.body.id).toBe(b.body.id);
    expect((await request("GET", "/api/restaurant/eventual-waiters")).body.filter((w: any) => w.id === a.body.id)).toHaveLength(1);
  });
  it("does not publish unlinked legacy names and preserves permanent waiters with the same name", async () => {
    const id = randomUUID(), userId = randomUUID(), name = `Legacy ${randomUUID()}`; waiters.push(id);
    await pool!.query("INSERT INTO eventual_waiters(id,full_name,is_active) VALUES($1,$2,'true')", [id, name]);
    expect((await request("GET", "/api/restaurant/eventual-waiters")).body.some((w: any) => w.id === id)).toBe(false);
    await pool!.query("INSERT INTO system_users(id,username,email,full_name,role,es_mozo,created_at) VALUES($1,$2,$3,$4,'restaurant','true',now())", [userId, userId, `${userId}@example.test`, name]);
    try {
      const order = await storage.createRestaurantOrder({ orderNumber: randomUUID(), orderType: "dine_in", covers: 1, waiterName: name, total: "0", openedAt: new Date() });
      orders.push(order.id); expect(order.waiterName).toBe(name);
    } finally { await pool!.query("DELETE FROM system_users WHERE id=$1", [userId]); }
  });
  it("does not close an existing old order or occupy a table when a stale waiter selection is rejected", async () => {
    const area = randomUUID(), table = randomUUID(), oldOrder = randomUUID(), waiter = randomUUID(), name = `Expired ${randomUUID()}`;
    waiters.push(waiter);
    await pool!.query("INSERT INTO eventual_waiters(id,full_name,is_active) VALUES($1,$2,'true')", [waiter, name]);
    await pool!.query("INSERT INTO restaurant_areas(id,name,area_type) VALUES($1,$2,'indoor')", [area, area]);
    await pool!.query("INSERT INTO restaurant_tables(id,table_number,area_id,status) VALUES($1,'Test',$2,'occupied')", [table, area]);
    await pool!.query("INSERT INTO restaurant_orders(id,order_number,order_type,status,covers,waiter_name,total,opened_at,table_id) VALUES($1,$2,'dine_in','open',1,'Original waiter',0,now()-interval '2 days',$3)", [oldOrder, randomUUID(), table]);
    try {
      const rejected = await request("POST", "/api/restaurant/orders", { tableId: table, covers: 1, waiterName: name });
      expect(rejected.status, JSON.stringify(rejected.body)).toBe(409);
      expect((await pool!.query("SELECT id,status,waiter_name FROM restaurant_orders WHERE table_id=$1", [table])).rows).toEqual([{ id: oldOrder, status: "open", waiter_name: "Original waiter" }]);
      expect((await pool!.query("SELECT status FROM restaurant_tables WHERE id=$1", [table])).rows[0].status).toBe("occupied");
    } finally {
      await pool!.query("DELETE FROM restaurant_orders WHERE table_id=$1", [table]);
      await pool!.query("DELETE FROM restaurant_tables WHERE id=$1", [table]);
      await pool!.query("DELETE FROM restaurant_areas WHERE id=$1", [area]);
    }
  });
});
