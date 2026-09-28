/**
 * Al pasar un turno a "en curso" ahora se descuentan los insumos del
 * tratamiento (antes solo se descontaban al cerrar la cuenta o vincular
 * una factura — nunca al iniciar el servicio en sí). deductStockFromSpaAccount
 * es idempotente por cuenta, así que un cierre posterior no lo descuenta
 * de nuevo. De paso corrige un bug real: la fila de stock_movements se
 * insertaba con columnas que no existen en la tabla (type/reason en vez de
 * movement_type/notes), así que el descuento de stock nunca dejaba
 * auditoría — solo movía current_stock.
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
      id: "spa-iniciar-pg",
      username: "spa-iniciar-pg",
      fullName: "Spa Iniciar PG",
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

async function request(method: "GET" | "POST" | "PATCH", path: string, body?: unknown) {
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

runIfDatabaseIsConfigured('Iniciar turno descuenta insumos', () => {
  beforeAll(async () => {
    if (pool) await startServer();
  });

  afterAll(async () => {
    await stopServer();
    await pool?.end();
  });

  it("descuenta el insumo al pasar a en curso, con auditoría, y no lo descuenta dos veces al reintentarlo", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const treatmentId = `treatment-${suffix}`;
    const cabinId = `cabin-${suffix}`;
    const itemId = `item-${suffix}`;
    let appointmentId: string | null = null;

    try {
      await pool.query(
        `INSERT INTO spa_treatments (id, name, duration_minutes, price, is_active)
         VALUES ($1, 'Masaje con aceites', 60, '30000.00', 'true')`,
        [treatmentId],
      );
      await pool.query(
        `INSERT INTO spa_cabins (id, name, is_active) VALUES ($1, 'Cabina 1', 'true')`,
        [cabinId],
      );
      await pool.query(
        `INSERT INTO inventory_items (id, name, unit, current_stock) VALUES ($1, 'Aceite de masaje', 'ml', '500.000')`,
        [itemId],
      );
      await pool.query(
        `INSERT INTO treatment_supplies (id, treatment_id, inventory_item_id, quantity, unit)
         VALUES ($1, $2, $3, '20.000', 'ml')`,
        [`supply-${suffix}`, treatmentId, itemId],
      );

      const createResponse = await request("POST", "/api/spa/appointments", {
        cabinId, treatmentId, guestName: "Pedro Suárez",
        appointmentDate: "2026-10-05", startTime: "10:00", endTime: "11:00",
      });
      expect(createResponse.status).toBe(201);
      appointmentId = createResponse.body.id;
      const accountId = createResponse.body.accountId;

      const stockAfterCreate = await pool.query("SELECT current_stock FROM inventory_items WHERE id = $1", [itemId]);
      expect(stockAfterCreate.rows[0].current_stock).toBe("500.000");

      const startResponse = await request("PATCH", `/api/spa/appointments/${appointmentId}`, { status: "in_progress" });
      expect(startResponse.status).toBe(200);
      // El flag interno usado para decidir si descontar nunca debe filtrarse en la respuesta.
      expect(startResponse.body.enteringInProgress).toBeUndefined();

      await waitUntilStockMovementExists(itemId);

      const stockAfterStart = await pool.query("SELECT current_stock FROM inventory_items WHERE id = $1", [itemId]);
      expect(stockAfterStart.rows[0].current_stock).toBe("480.000");

      const movements = await pool.query(
        "SELECT movement_type, notes, source_type, source_id FROM stock_movements WHERE item_id = $1",
        [itemId],
      );
      expect(movements.rows).toEqual([{
        movement_type: "salida", notes: "Consumo SPA", source_type: "spa_account", source_id: accountId,
      }]);

      // Un segundo disparo (p. ej. al cerrar la cuenta más tarde) no debe descontar de nuevo.
      const { storage } = await import("../db-storage");
      await storage.deductStockFromSpaAccount(accountId);

      const stockAfterSecondCall = await pool.query("SELECT current_stock FROM inventory_items WHERE id = $1", [itemId]);
      expect(stockAfterSecondCall.rows[0].current_stock).toBe("480.000");
      const movementsAfterSecondCall = await pool.query("SELECT id FROM stock_movements WHERE item_id = $1", [itemId]);
      expect(movementsAfterSecondCall.rows).toHaveLength(1);
    } finally {
      if (appointmentId) {
        await pool.query("DELETE FROM stock_movements WHERE item_id = $1", [itemId]);
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
      await pool.query("DELETE FROM treatment_supplies WHERE treatment_id = $1", [treatmentId]);
      await pool.query("DELETE FROM inventory_items WHERE id = $1", [itemId]);
      await pool.query("DELETE FROM spa_cabins WHERE id = $1", [cabinId]);
      await pool.query("DELETE FROM spa_treatments WHERE id = $1", [treatmentId]);
    }
  });
});
