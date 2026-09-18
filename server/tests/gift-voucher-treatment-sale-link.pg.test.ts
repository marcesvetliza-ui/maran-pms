/**
 * "Voucher por prestación": al emitir un comprobante con un tratamiento de
 * SPA marcado como regalo (item.giftBeneficiaryName), la emisión crea un
 * gift voucher descriptivo vinculado a la venta anticipada — no un monto
 * libre. Su estado deja de depender de "Marcar como utilizado" a mano y
 * pasa a seguir al turno: agendarlo lo reserva, completarlo lo consume.
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
      id: "gift-voucher-treatment-sale-pg",
      username: "gift-voucher-treatment-sale-pg",
      fullName: "Gift Voucher Treatment Sale PG",
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

async function request(method: "GET" | "POST" | "PATCH", path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}

runIfDatabaseIsConfigured("Voucher por prestación — vinculado a una venta de tratamiento SPA", () => {
  beforeAll(async () => {
    if (pool) await startServer();
  });

  afterAll(async () => {
    await stopServer();
    await pool?.end();
  });

  it("emitir con un regalo crea el voucher vinculado; agendar lo reserva; completar el turno lo consume", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const treatmentId = `treatment-${suffix}`;
    const cabinId = `cabin-${suffix}`;
    let invoiceId: number | null = null;
    let saleId: string | null = null;
    let appointmentId: string | null = null;
    let voucherId: string | null = null;

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

      const emitResponse = await request("POST", "/api/billing/invoices", {
        tipoComprobante: "FB",
        cliente: { razonSocial: "Juan Pérez", condicionIva: "consumidor_final" },
        items: [{
          descripcion: "Masaje relajante", cantidad: 1, precioUnitario: 30000,
          alicuotaIva: "21", subtotalNeto: 24793.39, subtotal: 30000,
          spaTreatmentId: treatmentId, giftBeneficiaryName: "María Gómez",
        }],
      });
      expect(emitResponse.status).toBe(201);
      invoiceId = Number(emitResponse.body.id);

      const saleRow = await pool.query(
        `SELECT id FROM spa_treatment_sales WHERE sales_invoice_id = $1`, [invoiceId],
      );
      saleId = saleRow.rows[0].id;

      const voucherRow = await pool.query(
        `SELECT id, area, value_type, description, buyer_name, beneficiary_name,
                status, linked_treatment_sale_id, sale_invoice_id, price_paid
         FROM gift_vouchers WHERE linked_treatment_sale_id = $1`,
        [saleId],
      );
      expect(voucherRow.rows).toEqual([{
        id: expect.any(String),
        area: "spa",
        value_type: "descriptivo",
        description: "Masaje relajante",
        buyer_name: "Juan Pérez",
        beneficiary_name: "María Gómez",
        status: "activo",
        linked_treatment_sale_id: saleId,
        sale_invoice_id: invoiceId,
        price_paid: "30000.00",
      }]);
      voucherId = voucherRow.rows[0].id;

      // Reintentar la misma emisión (ej. reintento de red) no debe duplicar el voucher.
      const events = await pool.query(
        `SELECT event_type FROM gift_voucher_events WHERE voucher_id = $1`, [voucherId],
      );
      expect(events.rows).toEqual([{ event_type: "facturado" }]);

      // "Turnos vendidos" (donde recepción genera el turno) tiene que poder
      // identificar esta venta como un regalo — sin esto, no hay forma de
      // saber a quién corresponde cuando el beneficiario presenta el voucher.
      const pendingList = await request("GET", "/api/spa/treatment-sales?pending=true");
      expect(pendingList.status).toBe(200);
      expect(pendingList.body).toEqual(expect.arrayContaining([
        expect.objectContaining({
          salesInvoiceId: invoiceId,
          voucherCode: expect.any(String),
          voucherBeneficiaryName: "María Gómez",
        }),
      ]));

      const appointmentResponse = await request("POST", "/api/spa/appointments", {
        cabinId, treatmentId, guestName: "María Gómez",
        appointmentDate: "2026-11-10", startTime: "10:00", endTime: "11:00",
        settlement: { type: "already_sold", soldTreatmentSaleId: saleId },
      });
      expect(appointmentResponse.status).toBe(201);
      appointmentId = appointmentResponse.body.id;

      const afterSchedule = await pool.query(
        `SELECT status FROM gift_vouchers WHERE id = $1`, [voucherId],
      );
      expect(afterSchedule.rows[0].status).toBe("reservado");

      const completeResponse = await request("PATCH", `/api/spa/appointments/${appointmentId}`, { status: "completed" });
      expect(completeResponse.status).toBe(200);

      const afterComplete = await pool.query(
        `SELECT status, used_at, used_by FROM gift_vouchers WHERE id = $1`, [voucherId],
      );
      expect(afterComplete.rows[0].status).toBe("utilizado");
      expect(afterComplete.rows[0].used_at).not.toBeNull();
      expect(afterComplete.rows[0].used_by).toBe("gift-voucher-treatment-sale-pg");

      // Reintentar "completed" (ej. doble click) no debe volver a escribir un evento.
      await request("PATCH", `/api/spa/appointments/${appointmentId}`, { status: "completed" });
      const finalEvents = await pool.query(
        `SELECT event_type FROM gift_voucher_events WHERE voucher_id = $1 ORDER BY performed_at`, [voucherId],
      );
      expect(finalEvents.rows.map((r: any) => r.event_type)).toEqual(["facturado", "reservado", "utilizado"]);
    } finally {
      if (voucherId) {
        await pool.query("DELETE FROM gift_voucher_events WHERE voucher_id = $1", [voucherId]);
        await pool.query("DELETE FROM gift_vouchers WHERE id = $1", [voucherId]);
      }
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
      if (saleId) await pool.query("DELETE FROM spa_treatment_sales WHERE id = $1", [saleId]);
      if (invoiceId) await pool.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
      await pool.query("DELETE FROM spa_cabins WHERE id = $1", [cabinId]);
      await pool.query("DELETE FROM spa_treatments WHERE id = $1", [treatmentId]);
    }
  });

  it("un ítem de Spa sin marcar como regalo no crea ningún voucher", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const treatmentId = `treatment-${suffix}`;
    let invoiceId: number | null = null;

    try {
      await pool.query(
        `INSERT INTO spa_treatments (id, name, duration_minutes, price, is_active)
         VALUES ($1, 'Circuito Spa', 90, '22000.00', 'true')`,
        [treatmentId],
      );

      const emitResponse = await request("POST", "/api/billing/invoices", {
        tipoComprobante: "FB",
        cliente: { razonSocial: "Comprador Normal", condicionIva: "consumidor_final" },
        items: [{
          descripcion: "Circuito Spa", cantidad: 1, precioUnitario: 22000,
          alicuotaIva: "21", subtotalNeto: 18181.82, subtotal: 22000, spaTreatmentId: treatmentId,
        }],
      });
      expect(emitResponse.status).toBe(201);
      invoiceId = Number(emitResponse.body.id);

      const saleRow = await pool.query(
        `SELECT id FROM spa_treatment_sales WHERE sales_invoice_id = $1`, [invoiceId],
      );
      const saleId = saleRow.rows[0].id;

      const vouchers = await pool.query(
        `SELECT id FROM gift_vouchers WHERE linked_treatment_sale_id = $1`, [saleId],
      );
      expect(vouchers.rows).toEqual([]);
    } finally {
      if (invoiceId) {
        await pool.query("DELETE FROM spa_treatment_sales WHERE sales_invoice_id = $1", [invoiceId]);
        await pool.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
      }
      await pool.query("DELETE FROM spa_treatments WHERE id = $1", [treatmentId]);
    }
  });
});
