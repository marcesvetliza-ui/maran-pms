/**
 * GET /api/restaurant/reports/sales-stats — cuando no hay pedidos cerrados
 * en el período, el handler devuelve un objeto "empty" de respaldo en vez de
 * recorrer las agregaciones. Ese objeto se había quedado desactualizado y le
 * faltaba el campo "porMozo" (bug real: reports.tsx hacía
 * `restaurantMozoReport.data.porMozo.length` y explotaba con "Algo salió
 * mal" / undefined is not an object en la pestaña "Ventas por Mozo" cada vez
 * que el período elegido no tenía pedidos). Este test fija el contrato
 * completo del objeto "empty" para que un campo nuevo en el response real
 * no pueda volver a faltar ahí sin que el test lo note.
 */

import express from "express";
import * as http from "node:http";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: (_roles: string[]) => (_req: any, _res: any, next: () => void) => next(),
  requirePermission: (_resourceKey: string) => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let server: http.Server;
let baseUrl: string;

suite("PostgreSQL real: /api/restaurant/reports/sales-stats sin pedidos en el período", () => {
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

  it("devuelve todas las listas vacías, incluida porMozo, en vez de omitirla", async () => {
    if (!pool) return;
    // Período muy lejano en el pasado: no debería haber pedidos cerrados reales ahí.
    const response = await fetch(`${baseUrl}/api/restaurant/reports/sales-stats?periodo=${encodeURIComponent("01/2001")}`);
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.resumen).toEqual({
      totalOrdenes: 0, totalVentas: 0, totalCubiertos: 0, ticketPromedio: 0, cubiertosPromedio: 0,
    });
    for (const key of ["topPlatos", "porCategoria", "tendenciaDiaria", "porMetodoPago", "porHora", "porMozo"]) {
      expect(Array.isArray(body[key]), `${key} debería ser un array`).toBe(true);
      expect(body[key]).toEqual([]);
    }
  });
});
