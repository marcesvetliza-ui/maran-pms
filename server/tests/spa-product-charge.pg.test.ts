/**
 * "Agregar Cargo" en el folio SPA mezclaba conceptos del hotel (cochera,
 * media pensión — sin stock) con lo que en realidad son productos que el
 * SPA vende (cremas, bebidas). Ahora el selector separa ambos: elegir un
 * producto vincula el cargo a su artículo de inventario (venta_directa,
 * área spa) y descuenta stock al agregarse — un concepto no toca el stock.
 */

import { randomUUID } from "node:crypto";
import pg from "pg";
import express from "express";
import * as http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  : null;

let baseUrl = "";
let httpServer: http.Server | null = null;

async function startServer() {
  const { registerSpaRoutes } = await import("../routes/spa");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: "spa-product-charge-pg",
      username: "spa-product-charge-pg",
      fullName: "Spa Product Charge PG",
      role: "admin",
    } as any;
    req.isAuthenticated = () => true;
    next();
  });
  registerSpaRoutes(app);
  httpServer = await new Promise<http.Server>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
  const address = httpServer.address();
  if (!address || typeof address === "string") throw new Error("No se pudo iniciar el servidor de prueba");
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function stopServer() {
  if (!httpServer) return;
  await new Promise<void>((resolve, reject) => httpServer!.close((error) => error ? reject(error) : resolve()));
  httpServer = null;
}

async function request(method: "GET" | "POST", path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}

async function waitUntilStockMovementExists(itemId: string) {
  if (!pool) throw new Error("DATABASE_URL no está configurado");
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const result = await pool.query("SELECT id FROM stock_movements WHERE item_id = $1", [itemId]);
    if (result.rows.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("El movimiento de stock no se registró a tiempo");
}

// El POST de "Agregar Cargo" escribe el cargo al folio en segundo plano
// (fire-and-forget, igual que en restaurant.ts y events.ts) — el 201 vuelve
// antes de que exista la fila en folio_movements. Sin esperarla acá, el
// cleanup de este test puede borrar folio_movements y folios justo cuando
// esa escritura tardía inserta una fila nueva, violando la FK.
async function waitUntilFolioMovementCount(appointmentId: string, expectedCount: number) {
  if (!pool) throw new Error("DATABASE_URL no está configurado");
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const result = await pool.query(
      `SELECT count(*)::int AS count FROM folio_movements fm
         JOIN folios f ON f.id = fm.folio_id
        WHERE f.entity_type = 'spa_account'
          AND f.entity_id IN (SELECT id::text FROM spa_accounts WHERE appointment_id = $1)`,
      [appointmentId],
    );
    if (result.rows[0]?.count >= expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Los cargos al folio no se registraron a tiempo");
}

runIfDatabaseIsConfigured("Agregar Cargo — productos vs. conceptos", () => {
  beforeAll(async () => {
    if (pool) await startServer();
  });

  afterAll(async () => {
    await stopServer();
    await pool?.end();
  });

  it("un producto descuenta stock al agregarse; un concepto no toca el inventario", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const treatmentId = `treatment-${suffix}`;
    const cabinId = `cabin-${suffix}`;
    const categoryId = `category-${suffix}`;
    const productId = `product-${suffix}`;
    let appointmentId: string | null = null;

    try {
      await pool.query(
        `INSERT INTO spa_treatments (id, name, duration_minutes, price, is_active)
         VALUES ($1, 'Masaje relajante', 60, '30000.00', 'true')`,
        [treatmentId],
      );
      await pool.query(
        `INSERT INTO spa_cabins (id, name, is_active) VALUES ($1, 'Cabina 1', 'true')`,
        [cabinId],
      );
      await pool.query(
        `INSERT INTO item_categories (id, name, area) VALUES ($1, 'Cosmética SPA', 'spa')`,
        [categoryId],
      );
      await pool.query(
        `INSERT INTO inventory_items (id, name, unit, current_stock, category_id, item_kind, is_active)
         VALUES ($1, 'Crema hidratante', 'unidad', '10.000', $2, 'venta_directa', 'true')`,
        [productId, categoryId],
      );

      const createResponse = await request("POST", "/api/spa/appointments", {
        cabinId, treatmentId, guestName: "Lucía Fernández",
        appointmentDate: "2026-10-06", startTime: "09:00", endTime: "10:00",
      });
      expect(createResponse.status).toBe(201);
      appointmentId = createResponse.body.id;
      const accountId = createResponse.body.accountId;

      const productCharge = await request("POST", `/api/spa/accounts/${accountId}/items`, {
        description: "Crema hidratante",
        quantity: 2,
        unitPrice: "5000",
        itemType: "product",
        inventoryItemId: productId,
      });
      expect(productCharge.status).toBe(201);

      const conceptCharge = await request("POST", `/api/spa/accounts/${accountId}/items`, {
        description: "Cochera",
        quantity: 1,
        unitPrice: "3000",
        itemType: "extra",
      });
      expect(conceptCharge.status).toBe(201);

      await waitUntilStockMovementExists(productId);

      const stock = await pool.query("SELECT current_stock FROM inventory_items WHERE id = $1", [productId]);
      expect(stock.rows[0].current_stock).toBe("8.000");

      const movements = await pool.query(
        "SELECT movement_type, notes, source_type, source_id FROM stock_movements WHERE item_id = $1",
        [productId],
      );
      expect(movements.rows).toEqual([{
        movement_type: "salida", notes: "Venta SPA",
        source_type: "spa_account_item", source_id: productCharge.body.id,
      }]);

      const items = await pool.query(
        "SELECT item_type, inventory_item_id FROM spa_account_items WHERE account_id = $1 ORDER BY created_at",
        [accountId],
      );
      expect(items.rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ item_type: "product", inventory_item_id: productId }),
        expect.objectContaining({ item_type: "extra", inventory_item_id: null }),
      ]));

      // 3, no 2: el turno ya escribió el cargo del tratamiento en el mismo
      // folio al crearse (sincrónico, dentro de esa transacción) — el
      // producto y el concepto de este test se suman a ese, no lo reemplazan.
      // Esperar solo 2 dejaba una ventana donde el cleanup podía correr
      // mientras el tercer cargo (fire-and-forget) todavía estaba en
      // camino, violando la FK folio_movements → folios.
      await waitUntilFolioMovementCount(appointmentId!, 3);
    } finally {
      if (appointmentId) {
        await pool.query(
          `DELETE FROM folio_movements WHERE folio_id IN (
             SELECT id FROM folios WHERE entity_type = 'spa_account'
               AND entity_id IN (SELECT id::text FROM spa_accounts WHERE appointment_id = $1)
           )`,
          [appointmentId],
        );
        await pool.query(
          `DELETE FROM folios WHERE entity_type = 'spa_account'
             AND entity_id IN (SELECT id::text FROM spa_accounts WHERE appointment_id = $1)`,
          [appointmentId],
        );
        await pool.query(
          "DELETE FROM spa_account_items WHERE account_id IN (SELECT id FROM spa_accounts WHERE appointment_id = $1)",
          [appointmentId],
        );
        await pool.query("DELETE FROM spa_accounts WHERE appointment_id = $1", [appointmentId]);
        await pool.query("DELETE FROM spa_appointments WHERE id = $1", [appointmentId]);
      }
      await pool.query("DELETE FROM stock_movements WHERE item_id = $1", [productId]);
      await pool.query("DELETE FROM inventory_items WHERE id = $1", [productId]);
      await pool.query("DELETE FROM item_categories WHERE id = $1", [categoryId]);
      await pool.query("DELETE FROM spa_cabins WHERE id = $1", [cabinId]);
      await pool.query("DELETE FROM spa_treatments WHERE id = $1", [treatmentId]);
    }
  });
});
