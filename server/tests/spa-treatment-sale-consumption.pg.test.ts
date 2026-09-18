/**
 * "Turnos vendidos" (spa_treatment_sales) nunca cerraba el círculo: se podía
 * vender un tratamiento por anticipado y generar el turno ("already_sold"),
 * pero nada marcaba la venta como consumida cuando el turno efectivamente se
 * prestaba — quantity_used quedaba en 0 para siempre y el estado nunca
 * llegaba a "utilizado". Ahora, al completar el turno, se avisa a la venta
 * de origen (guardada en spa_appointments.sold_treatment_sale_id al
 * reclamar la unidad).
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
    req.user = { id: "spa-sale-pg", username: "spa-sale-pg", fullName: "Spa Sale PG", role: "admin" } as any;
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

runIfDatabaseIsConfigured("Completar un turno vendido consume la venta de origen", () => {
  beforeAll(async () => {
    if (pool) await startServer();
  });

  afterAll(async () => {
    await stopServer();
    await pool?.end();
  });

  it("agendar reclama la unidad; completar el turno marca la venta como utilizada", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const treatmentId = `treatment-${suffix}`;
    const cabinId = `cabin-${suffix}`;
    const saleId = `sale-${suffix}`;
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
      // Simula lo que hace server/billing/routes.ts al emitir un comprobante
      // con un tratamiento del catálogo SPA.
      await pool.query(
        `INSERT INTO spa_treatment_sales (id, sales_invoice_id, invoice_item_index, treatment_id, buyer_name, quantity_purchased, unit_price_frozen)
         VALUES ($1, 1, 0, $2, 'Comprador Test', 1, '30000.00')`,
        [saleId, treatmentId],
      );

      const createResponse = await request("POST", "/api/spa/appointments", {
        cabinId, treatmentId, guestName: "Beneficiario Test",
        appointmentDate: "2026-11-05", startTime: "10:00", endTime: "11:00",
        settlement: { type: "already_sold", soldTreatmentSaleId: saleId },
      });
      expect(createResponse.status).toBe(201);
      appointmentId = createResponse.body.id;

      const afterSchedule = await pool.query(
        "SELECT quantity_scheduled, quantity_used, status FROM spa_treatment_sales WHERE id = $1", [saleId],
      );
      expect(afterSchedule.rows[0]).toMatchObject({ quantity_scheduled: 1, quantity_used: 0, status: "programado" });

      const appointmentRow = await pool.query(
        "SELECT sold_treatment_sale_id FROM spa_appointments WHERE id = $1", [appointmentId],
      );
      expect(appointmentRow.rows[0].sold_treatment_sale_id).toBe(saleId);

      const completeResponse = await request("PATCH", `/api/spa/appointments/${appointmentId}`, { status: "completed" });
      expect(completeResponse.status).toBe(200);

      const afterComplete = await pool.query(
        "SELECT quantity_used, status FROM spa_treatment_sales WHERE id = $1", [saleId],
      );
      expect(afterComplete.rows[0]).toMatchObject({ quantity_used: 1, status: "utilizado" });

      // Reintentar "completed" (ej. doble click) no debe volver a incrementar.
      await request("PATCH", `/api/spa/appointments/${appointmentId}`, { status: "completed" });
      const afterRetry = await pool.query("SELECT quantity_used FROM spa_treatment_sales WHERE id = $1", [saleId]);
      expect(afterRetry.rows[0].quantity_used).toBe(1);
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
        await pool.query("DELETE FROM spa_account_items WHERE account_id IN (SELECT id FROM spa_accounts WHERE appointment_id = $1)", [appointmentId]);
        await pool.query("DELETE FROM spa_accounts WHERE appointment_id = $1", [appointmentId]);
        await pool.query("DELETE FROM spa_appointments WHERE id = $1", [appointmentId]);
      }
      await pool.query("DELETE FROM spa_treatment_sales WHERE id = $1", [saleId]);
      await pool.query("DELETE FROM spa_cabins WHERE id = $1", [cabinId]);
      await pool.query("DELETE FROM spa_treatments WHERE id = $1", [treatmentId]);
    }
  });
});
