import express from "express";
import * as http from "node:http";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { addCalendarDays } from "@shared/nightAuditDate";
import { todayArgentina } from "../revenue/metrics";

/**
 * Punto 1 de la revisión: el endpoint real GET /api/revenue/board debe
 * disparar la captura diaria de pace (no alcanza con probar el helper
 * captureDailyPaceSnapshot/ensureTodayPaceSnapshot por separado — acá se
 * prueba la ruta HTTP tal cual la llama el cliente).
 */

const permissionsState = vi.hoisted(() => ({ granted: new Set<string>(["admin:api:revenue:read"]) }));
vi.mock("../permissions", () => ({
  hasPermission: (role: string, resourceKey: string) => permissionsState.granted.has(`${role}:${resourceKey}`),
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));

async function startApp(options: { authenticated?: boolean } = {}) {
  const { authenticated = true } = options;
  const { registerRevenueRoutes } = await import("../routes/revenue");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = () => authenticated;
    if (authenticated) {
      req.user = { id: "u1", username: "tester", email: "t@t.test", fullName: "Tester", role: "admin", department: null, phone: null, isActive: "true" } as any;
    }
    next();
  });
  registerRevenueRoutes(app);

  return await new Promise<{ baseUrl: string; close: () => Promise<void> }>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((res, rej) => server.close((error) => error ? rej(error) : res())),
      });
    });
  });
}

afterAll(() => pool.end());

describe("GET /api/revenue/board — conecta de verdad la captura diaria de pace", () => {
  let app: { baseUrl: string; close: () => Promise<void> };
  const today = todayArgentina();

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM revenue_pace_snapshot_runs WHERE snapshot_date = ${today}`);
    await db.execute(sql`DELETE FROM revenue_pace_snapshots WHERE snapshot_date = ${today}`);
  });

  afterEach(async () => {
    await app?.close();
    await db.execute(sql`DELETE FROM revenue_pace_snapshot_runs WHERE snapshot_date = ${today}`);
    await db.execute(sql`DELETE FROM revenue_pace_snapshots WHERE snapshot_date = ${today}`);
  });

  it("la primera consulta del día al tablero real dispara la captura del snapshot de pace de hoy", async () => {
    app = await startApp();
    const to = addCalendarDays(today, 3);
    const response = await fetch(`${app.baseUrl}/api/revenue/board?from=${today}&to=${to}`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.days)).toBe(true);
    expect(body.days.length).toBeGreaterThan(0);

    const runRows = (await db.execute(
      sql`SELECT count(*)::int AS count FROM revenue_pace_snapshot_runs WHERE snapshot_date = ${today}`,
    )).rows as any[];
    expect(runRows[0].count).toBe(1);

    const snapshotRows = (await db.execute(
      sql`SELECT count(*)::int AS count FROM revenue_pace_snapshots WHERE snapshot_date = ${today}`,
    )).rows as any[];
    expect(snapshotRows[0].count).toBeGreaterThan(0);
  });

  it("una segunda consulta el mismo día no vuelve a disparar otra captura (sigue habiendo una sola corrida)", async () => {
    app = await startApp();
    const to = addCalendarDays(today, 3);

    const first = await fetch(`${app.baseUrl}/api/revenue/board?from=${today}&to=${to}`);
    expect(first.status).toBe(200);
    const second = await fetch(`${app.baseUrl}/api/revenue/board?from=${today}&to=${to}`);
    expect(second.status).toBe(200);

    const runRows = (await db.execute(
      sql`SELECT count(*)::int AS count FROM revenue_pace_snapshot_runs WHERE snapshot_date = ${today}`,
    )).rows as any[];
    expect(runRows[0].count).toBe(1);
  });

  it("responde 401 si no está autenticado y nunca llega a disparar la captura", async () => {
    app = await startApp({ authenticated: false });
    const response = await fetch(`${app.baseUrl}/api/revenue/board`);
    expect(response.status).toBe(401);

    const runRows = (await db.execute(
      sql`SELECT count(*)::int AS count FROM revenue_pace_snapshot_runs WHERE snapshot_date = ${today}`,
    )).rows as any[];
    expect(runRows[0].count).toBe(0);
  });
});
