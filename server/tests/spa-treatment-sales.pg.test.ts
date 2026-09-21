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

runIfDatabaseIsConfigured('"Generar turno" — settlement already_sold', () => {
  beforeAll(async () => {
    if (pool) await startServer();
  });

  afterAll(async () => {
    await stopServer();
    await pool?.end();
  });

  it("agenda el turno al precio congelado de la venta y no vuelve a cobrar", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const treatmentId = `treatment-${suffix}`;
    const cabinId = `cabin-${suffix}`;
    let invoiceId: number | null = null;
    let saleId: string | null = null;
    let appointmentId: string | null = null;

    try {
      // El precio del catálogo hoy (35000) subió desde que se vendió (30000)
      // — el turno se tiene que liquidar al precio congelado, no al de hoy.
      await pool.query(
        `INSERT INTO spa_treatments (id, name, duration_minutes, price, is_active)
         VALUES ($1, 'Masaje relajante', 60, '35000.00', 'true')`,
        [treatmentId],
      );
      await pool.query(
        `INSERT INTO spa_cabins (id, name, is_active) VALUES ($1, 'Cabina 1', 'true')`,
        [cabinId],
      );

      const emitResponse = await request("POST", "/api/billing/invoices", {
        tipoComprobante: "FB",
        cliente: { razonSocial: "Ana Torres", condicionIva: "consumidor_final" },
        items: [{
          descripcion: "Masaje relajante", cantidad: 1, precioUnitario: 30000,
          alicuotaIva: "21", subtotalNeto: 24793.39, subtotal: 30000, spaTreatmentId: treatmentId,
        }],
      });
      expect(emitResponse.status).toBe(201);
      invoiceId = Number(emitResponse.body.id);

      const saleRow = await pool.query(
        `SELECT id FROM spa_treatment_sales WHERE sales_invoice_id = $1`, [invoiceId],
      );
      saleId = saleRow.rows[0].id;

      const appointmentResponse = await request("POST", "/api/spa/appointments", {
        cabinId, treatmentId, guestName: "Ana Torres",
        appointmentDate: "2026-10-01", startTime: "10:00", endTime: "11:00",
        settlement: { type: "already_sold", soldTreatmentSaleId: saleId },
      });
      expect(appointmentResponse.status).toBe(201);
      expect(appointmentResponse.body.settlementType).toBe("already_sold");
      appointmentId = appointmentResponse.body.id;

      const account = await pool.query(
        `SELECT status, total, total_paid FROM spa_accounts WHERE appointment_id = $1`, [appointmentId],
      );
      expect(account.rows).toEqual([{ status: "closed", total: "30000.00", total_paid: "30000.00" }]);

      const payment = await pool.query(
        `SELECT amount, method FROM spa_payments WHERE appointment_id = $1`, [appointmentId],
      );
      expect(payment.rows).toEqual([{ amount: "30000.00", method: "venta_previa" }]);

      const sale = await pool.query(
        `SELECT quantity_scheduled, quantity_purchased, status FROM spa_treatment_sales WHERE id = $1`, [saleId],
      );
      expect(sale.rows).toEqual([{ quantity_scheduled: 1, quantity_purchased: 1, status: "programado" }]);

      // La venta ya agotó su única unidad: un segundo intento no puede
      // reclamarla de nuevo, aunque llegue con datos válidos.
      const secondAttempt = await request("POST", "/api/spa/appointments", {
        cabinId, treatmentId, guestName: "Ana Torres",
        appointmentDate: "2026-10-02", startTime: "10:00", endTime: "11:00",
        settlement: { type: "already_sold", soldTreatmentSaleId: saleId },
      });
      expect(secondAttempt.status).toBe(409);
    } finally {
      if (appointmentId) {
        await pool.query("DELETE FROM spa_payments WHERE appointment_id = $1", [appointmentId]);
        await pool.query("DELETE FROM folio_movements WHERE folio_id IN (SELECT id FROM folios WHERE entity_id = (SELECT id::text FROM spa_accounts WHERE appointment_id = $1))", [appointmentId]);
        await pool.query("DELETE FROM folios WHERE entity_id = (SELECT id::text FROM spa_accounts WHERE appointment_id = $1)", [appointmentId]);
        await pool.query("DELETE FROM spa_account_items WHERE account_id = (SELECT id FROM spa_accounts WHERE appointment_id = $1)", [appointmentId]);
        await pool.query("DELETE FROM spa_accounts WHERE appointment_id = $1", [appointmentId]);
        await pool.query("DELETE FROM spa_appointments WHERE id = $1", [appointmentId]);
      }
      if (saleId) await pool.query("DELETE FROM spa_treatment_sales WHERE id = $1", [saleId]);
      if (invoiceId) await pool.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
      await pool.query("DELETE FROM spa_cabins WHERE id = $1", [cabinId]);
      await pool.query("DELETE FROM spa_treatments WHERE id = $1", [treatmentId]);
    }
  });

  it("rechaza generar el turno si el tratamiento no coincide con el de la venta", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const soldTreatmentId = `treatment-sold-${suffix}`;
    const otherTreatmentId = `treatment-other-${suffix}`;
    const cabinId = `cabin-${suffix}`;
    let invoiceId: number | null = null;
    let saleId: string | null = null;

    try {
      await pool.query(
        `INSERT INTO spa_treatments (id, name, duration_minutes, price, is_active)
         VALUES ($1, 'Masaje relajante', 60, '30000.00', 'true'), ($2, 'Circuito Spa', 90, '22000.00', 'true')`,
        [soldTreatmentId, otherTreatmentId],
      );
      await pool.query(
        `INSERT INTO spa_cabins (id, name, is_active) VALUES ($1, 'Cabina 1', 'true')`,
        [cabinId],
      );

      const emitResponse = await request("POST", "/api/billing/invoices", {
        tipoComprobante: "FB",
        cliente: { razonSocial: "Luis Ruiz", condicionIva: "consumidor_final" },
        items: [{
          descripcion: "Masaje relajante", cantidad: 1, precioUnitario: 30000,
          alicuotaIva: "21", subtotalNeto: 24793.39, subtotal: 30000, spaTreatmentId: soldTreatmentId,
        }],
      });
      invoiceId = Number(emitResponse.body.id);
      const saleRow = await pool.query(
        `SELECT id FROM spa_treatment_sales WHERE sales_invoice_id = $1`, [invoiceId],
      );
      saleId = saleRow.rows[0].id;

      const mismatchedAttempt = await request("POST", "/api/spa/appointments", {
        cabinId, treatmentId: otherTreatmentId, guestName: "Luis Ruiz",
        appointmentDate: "2026-10-01", startTime: "10:00", endTime: "11:30",
        settlement: { type: "already_sold", soldTreatmentSaleId: saleId },
      });
      expect(mismatchedAttempt.status).toBe(409);

      const sale = await pool.query(
        `SELECT quantity_scheduled FROM spa_treatment_sales WHERE id = $1`, [saleId],
      );
      expect(sale.rows).toEqual([{ quantity_scheduled: 0 }]);
    } finally {
      if (saleId) await pool.query("DELETE FROM spa_treatment_sales WHERE id = $1", [saleId]);
      if (invoiceId) await pool.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
      await pool.query("DELETE FROM spa_cabins WHERE id = $1", [cabinId]);
      await pool.query("DELETE FROM spa_treatments WHERE id IN ($1, $2)", [soldTreatmentId, otherTreatmentId]);
    }
  });
});
