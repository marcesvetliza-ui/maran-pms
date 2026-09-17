/**
 * "Turnos vendidos": hoy vender un tratamiento de SPA y agendarlo son la
 * misma operación soldada — spa_accounts exige un appointmentId, y
 * spa_appointments exige cabina/fecha/hora, así que no hay forma de vender
 * un masaje para dentro de dos semanas sin inventar un turno ficticio
 * primero. Este es el primer paso para separarlos: cuando un ítem de
 * "Emitir Comprobante" viene del catálogo de SPA (carga spaTreatmentId),
 * la emisión registra la venta en spa_treatment_sales, pendiente de que
 * más adelante se le asigne un turno real.
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
  const { registerBillingRoutes } = await import("../billing/routes");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: "spa-treatment-sales-pg",
      username: "spa-treatment-sales-pg",
      fullName: "Spa Treatment Sales PG",
      role: "admin",
    } as any;
    req.isAuthenticated = () => true;
    next();
  });
  registerBillingRoutes(app);
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

async function request(method: "POST", path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}

runIfDatabaseIsConfigured("Turnos vendidos — registro al emitir comprobante", () => {
  beforeAll(async () => {
    if (pool) await startServer();
  });

  afterAll(async () => {
    await stopServer();
    await pool?.end();
  });

  it("un ítem elegido del catálogo de Spa queda como venta pendiente de agendar", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const treatmentId = `treatment-${suffix}`;
    let invoiceId: number | null = null;

    try {
      await pool.query(
        `INSERT INTO spa_treatments (id, name, duration_minutes, price, is_active)
         VALUES ($1, 'Masaje relajante', 60, '30000.00', 'true')`,
        [treatmentId],
      );

      const emitResponse = await request("POST", "/api/billing/invoices", {
        tipoComprobante: "FB",
        cliente: { razonSocial: "Juan Pérez", condicionIva: "consumidor_final" },
        items: [
          {
            descripcion: "Masaje relajante",
            cantidad: 2,
            precioUnitario: 30000,
            alicuotaIva: "21",
            subtotalNeto: 49586.78,
            subtotal: 60000,
            spaTreatmentId: treatmentId,
          },
          {
            descripcion: "Crema hidratante",
            cantidad: 1,
            precioUnitario: 5000,
            alicuotaIva: "21",
            subtotalNeto: 4132.23,
            subtotal: 5000,
          },
        ],
      });
      expect(emitResponse.status).toBe(201);
      invoiceId = Number(emitResponse.body.id);

      const sales = await pool.query(
        `SELECT sales_invoice_id, invoice_item_index, treatment_id, buyer_name,
                quantity_purchased, quantity_scheduled, quantity_used, unit_price_frozen, status
         FROM spa_treatment_sales WHERE sales_invoice_id = $1`,
        [invoiceId],
      );
      // Solo el ítem con spaTreatmentId (el masaje) genera una venta — la
      // crema, un producto de venta inmediata, no debe quedar "pendiente de agendar".
      expect(sales.rows).toEqual([{
        sales_invoice_id: invoiceId,
        invoice_item_index: 0,
        treatment_id: treatmentId,
        buyer_name: "Juan Pérez",
        quantity_purchased: 2,
        quantity_scheduled: 0,
        quantity_used: 0,
        unit_price_frozen: "30000.00",
        status: "pendiente",
      }]);
    } finally {
      if (invoiceId) {
        await pool.query("DELETE FROM spa_treatment_sales WHERE sales_invoice_id = $1", [invoiceId]);
        await pool.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
      }
      await pool.query("DELETE FROM spa_treatments WHERE id = $1", [treatmentId]);
    }
  });

  it("un comprobante sin ítems de Spa no toca spa_treatment_sales", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    let invoiceId: number | null = null;
    try {
      const emitResponse = await request("POST", "/api/billing/invoices", {
        tipoComprobante: "FB",
        cliente: { razonSocial: "María Gómez", condicionIva: "consumidor_final" },
        items: [{
          descripcion: "Cena a la carta",
          cantidad: 1,
          precioUnitario: 15000,
          alicuotaIva: "21",
          subtotalNeto: 12396.69,
          subtotal: 15000,
        }],
      });
      expect(emitResponse.status).toBe(201);
      invoiceId = Number(emitResponse.body.id);

      const sales = await pool.query(
        `SELECT id FROM spa_treatment_sales WHERE sales_invoice_id = $1`,
        [invoiceId],
      );
      expect(sales.rows).toEqual([]);
    } finally {
      if (invoiceId) await pool.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
    }
  });
});
