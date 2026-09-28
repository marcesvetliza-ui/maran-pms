/**
 * "Transferencia entre depósitos" (Emitir Comprobante → Inventario →
 * Movimiento Interno) sólo dejaba mover un artículo por vez. Se extendió
 * POST /api/inventory/transfer para aceptar varios artículos en un mismo
 * origen/destino, moviéndolos todos dentro de una única transacción: si
 * alguno no tiene stock suficiente, ninguno se mueve.
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

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;

const testPool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 })
  : null;

let baseUrl = "";
let httpServer: http.Server | null = null;

async function startApp() {
  const { registerRoutes } = await import("../routes");
  const app = express();
  app.use(express.json());

  httpServer = http.createServer(app);
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve, reject) => {
    httpServer!.listen(0, "127.0.0.1", () => resolve());
    httpServer!.once("error", reject);
  });

  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("No se pudo obtener el puerto del servidor de prueba");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function stopApp() {
  if (!httpServer) return;
  await new Promise<void>((resolve, reject) => {
    httpServer!.close((error) => (error ? reject(error) : resolve()));
  });
  httpServer = null;
}

async function postTransfer(body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/api/inventory/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

type Fixture = { warehouseFromId: string; warehouseToId: string; itemAId: string; itemBId: string };

async function createFixture(): Promise<Fixture> {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  const suffix = randomUUID();

  const whFrom = await testPool.query<{ id: string }>(
    `INSERT INTO inventory_warehouses (name, area) VALUES ($1, 'general') RETURNING id`,
    [`Depósito origen ${suffix}`],
  );
  const whTo = await testPool.query<{ id: string }>(
    `INSERT INTO inventory_warehouses (name, area) VALUES ($1, 'general') RETURNING id`,
    [`Depósito destino ${suffix}`],
  );
  const itemA = await testPool.query<{ id: string }>(
    `INSERT INTO inventory_items (name, unit) VALUES ($1, 'unidad') RETURNING id`,
    [`Artículo A ${suffix}`],
  );
  const itemB = await testPool.query<{ id: string }>(
    `INSERT INTO inventory_items (name, unit) VALUES ($1, 'unidad') RETURNING id`,
    [`Artículo B ${suffix}`],
  );

  const warehouseFromId = whFrom.rows[0].id;
  const warehouseToId = whTo.rows[0].id;
  const itemAId = itemA.rows[0].id;
  const itemBId = itemB.rows[0].id;

  await testPool.query(
    `INSERT INTO warehouse_stock (warehouse_id, item_id, current_stock) VALUES ($1, $2, 10)`,
    [warehouseFromId, itemAId],
  );
  await testPool.query(
    `INSERT INTO warehouse_stock (warehouse_id, item_id, current_stock) VALUES ($1, $2, 3)`,
    [warehouseFromId, itemBId],
  );

  return { warehouseFromId, warehouseToId, itemAId, itemBId };
}

async function cleanupFixture(fixture: Fixture) {
  if (!testPool) return;
  await testPool.query(`DELETE FROM stock_movements WHERE warehouse_id = $1 OR to_warehouse_id = $1`, [fixture.warehouseFromId]);
  await testPool.query(`DELETE FROM warehouse_stock WHERE warehouse_id IN ($1, $2)`, [fixture.warehouseFromId, fixture.warehouseToId]);
  await testPool.query(`DELETE FROM inventory_items WHERE id IN ($1, $2)`, [fixture.itemAId, fixture.itemBId]);
  await testPool.query(`DELETE FROM inventory_warehouses WHERE id IN ($1, $2)`, [fixture.warehouseFromId, fixture.warehouseToId]);
}

async function readStock(warehouseId: string, itemId: string): Promise<number> {
  const res = await testPool!.query<{ current_stock: string }>(
    `SELECT current_stock FROM warehouse_stock WHERE warehouse_id = $1 AND item_id = $2`,
    [warehouseId, itemId],
  );
  return parseFloat(res.rows[0]?.current_stock ?? "0");
}

runIfDatabaseIsConfigured("PostgreSQL real: transferencia de stock con varios artículos", () => {
  beforeAll(async () => { await startApp(); });
  afterAll(async () => { await stopApp(); await testPool?.end(); });

  it("mueve varios artículos del mismo origen/destino en un solo POST", async () => {
    const fixture = await createFixture();
    try {
      const { status, body } = await postTransfer({
        fromWarehouseId: fixture.warehouseFromId,
        toWarehouseId: fixture.warehouseToId,
        items: [
          { itemId: fixture.itemAId, quantity: 4 },
          { itemId: fixture.itemBId, quantity: 2 },
        ],
      });

      expect(status).toBe(200);
      expect(body.success).toBe(true);

      expect(await readStock(fixture.warehouseFromId, fixture.itemAId)).toBe(6);
      expect(await readStock(fixture.warehouseToId, fixture.itemAId)).toBe(4);
      expect(await readStock(fixture.warehouseFromId, fixture.itemBId)).toBe(1);
      expect(await readStock(fixture.warehouseToId, fixture.itemBId)).toBe(2);

      const movements = await testPool!.query(
        `SELECT item_id, quantity FROM stock_movements WHERE warehouse_id = $1 AND to_warehouse_id = $2`,
        [fixture.warehouseFromId, fixture.warehouseToId],
      );
      expect(movements.rows).toHaveLength(2);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("si un artículo del lote no tiene stock suficiente, no mueve ninguno (todo o nada)", async () => {
    const fixture = await createFixture();
    try {
      const { status, body } = await postTransfer({
        fromWarehouseId: fixture.warehouseFromId,
        toWarehouseId: fixture.warehouseToId,
        items: [
          { itemId: fixture.itemAId, quantity: 4 },
          { itemId: fixture.itemBId, quantity: 999 }, // sólo hay 3 disponibles
        ],
      });

      expect(status).toBe(400);
      expect(body.error).toMatch(/stock insuficiente/i);

      // El artículo A no debe haberse movido a pesar de tener stock de sobra.
      expect(await readStock(fixture.warehouseFromId, fixture.itemAId)).toBe(10);
      expect(await readStock(fixture.warehouseToId, fixture.itemAId)).toBe(0);

      const movements = await testPool!.query(
        `SELECT id FROM stock_movements WHERE warehouse_id = $1 AND to_warehouse_id = $2`,
        [fixture.warehouseFromId, fixture.warehouseToId],
      );
      expect(movements.rows).toHaveLength(0);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("rechaza artículos repetidos en el mismo lote", async () => {
    const fixture = await createFixture();
    try {
      const { status, body } = await postTransfer({
        fromWarehouseId: fixture.warehouseFromId,
        toWarehouseId: fixture.warehouseToId,
        items: [
          { itemId: fixture.itemAId, quantity: 1 },
          { itemId: fixture.itemAId, quantity: 1 },
        ],
      });

      expect(status).toBe(400);
      expect(body.error).toMatch(/no repetirse/i);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("sigue aceptando el formato de un solo artículo por compatibilidad", async () => {
    const fixture = await createFixture();
    try {
      const { status } = await postTransfer({
        fromWarehouseId: fixture.warehouseFromId,
        toWarehouseId: fixture.warehouseToId,
        itemId: fixture.itemAId,
        quantity: 5,
      });

      expect(status).toBe(200);
      expect(await readStock(fixture.warehouseFromId, fixture.itemAId)).toBe(5);
      expect(await readStock(fixture.warehouseToId, fixture.itemAId)).toBe(5);
    } finally {
      await cleanupFixture(fixture);
    }
  });
});
