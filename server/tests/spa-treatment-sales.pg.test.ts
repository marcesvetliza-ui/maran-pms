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
  const [{ registerBillingRoutes }, { registerSpaRoutes }] = await Promise.all([
    import("../billing/routes"),
    import("../routes/spa"),
  ]);
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

runIfDatabaseIsConfigured("Turnos vendidos — registro al emitir comprobante", () => {
  beforeAll(async () => {
    if (pool) await startServer();
  });

  afterAll(async () => {
    await stopServer();
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

runIfDatabaseIsConfigured("GET /api/spa/treatment-sales", () => {
  beforeAll(async () => {
    if (pool) await startServer();
  });

  afterAll(async () => {
    await stopServer();
    await pool?.end();
  });

  it("enriquece con el nombre del tratamiento y el número del comprobante, y filtra por pendientes", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const treatmentId = `treatment-${suffix}`;
    const invoiceIds: number[] = [];

    try {
      await pool.query(
        `INSERT INTO spa_treatments (id, name, duration_minutes, price, is_active)
         VALUES ($1, 'Circuito Spa', 90, '22000.00', 'true')`,
        [treatmentId],
      );

      // Venta pendiente: nada agendado todavía.
      const pendingSale = await request("POST", "/api/billing/invoices", {
        tipoComprobante: "FB",
        cliente: { razonSocial: "Comprador Pendiente", condicionIva: "consumidor_final" },
        items: [{
          descripcion: "Circuito Spa", cantidad: 1, precioUnitario: 22000,
          alicuotaIva: "21", subtotalNeto: 18181.82, subtotal: 22000, spaTreatmentId: treatmentId,
        }],
      });
      invoiceIds.push(Number(pendingSale.body.id));

      // Venta ya totalmente agendada: no debe aparecer en el filtro "pendientes".
      const scheduledSale = await request("POST", "/api/billing/invoices", {
        tipoComprobante: "FB",
        cliente: { razonSocial: "Comprador Agendado", condicionIva: "consumidor_final" },
        items: [{
          descripcion: "Circuito Spa", cantidad: 1, precioUnitario: 22000,
          alicuotaIva: "21", subtotalNeto: 18181.82, subtotal: 22000, spaTreatmentId: treatmentId,
        }],
      });
      const scheduledInvoiceId = Number(scheduledSale.body.id);
      invoiceIds.push(scheduledInvoiceId);
      await pool.query(
        `UPDATE spa_treatment_sales SET quantity_scheduled = 1, status = 'programado' WHERE sales_invoice_id = $1`,
        [scheduledInvoiceId],
      );

      const pendingList = await request("GET", "/api/spa/treatment-sales?pending=true");
      expect(pendingList.status).toBe(200);
      expect(pendingList.body).toEqual(expect.arrayContaining([
        expect.objectContaining({
          salesInvoiceId: invoiceIds[0],
          treatmentName: "Circuito Spa",
          buyerName: "Comprador Pendiente",
          invoiceTipoComprobante: "FB",
          invoiceNumero: expect.any(Number),
          status: "pendiente",
        }),
      ]));
      expect(pendingList.body.some((row: any) => row.salesInvoiceId === scheduledInvoiceId)).toBe(false);

      const allList = await request("GET", "/api/spa/treatment-sales?pending=false");
      expect(allList.status).toBe(200);
      expect(allList.body.some((row: any) => row.salesInvoiceId === scheduledInvoiceId)).toBe(true);
    } finally {
      for (const id of invoiceIds) {
        await pool.query("DELETE FROM spa_treatment_sales WHERE sales_invoice_id = $1", [id]);
        await pool.query("DELETE FROM sales_invoices WHERE id = $1", [id]);
      }
      await pool.query("DELETE FROM spa_treatments WHERE id = $1", [treatmentId]);
    }
  });
});
