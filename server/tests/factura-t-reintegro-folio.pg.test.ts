/**
 * Factura T (turismo, Decreto 1043/2016) charges the guest the net-of-VAT
 * amount (see PrefacturaDialog's ÷1.21), but the reservation's original
 * charge (reservation.total_room_amount) stays at the gross tariff — a real
 * production emission (room 201) left the Folio showing a permanent "Saldo
 * pendiente" equal to the reintegrated 21%, as if the legally-waived amount
 * were still owed. This end-to-end test drives the real POST
 * /api/billing/invoices and POST /api/billing/invoices/:id/nota-credito
 * routes against Postgres and asserts the Folio's own numbers, matching the
 * exact figures reported: a $153,000 room charge, $126,446.28 charged/
 * collected, and $0 (not $26,553.72) left pending.
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
  const [{ registerReservationsRoutes }, { registerBillingRoutes }] = await Promise.all([
    import("../routes/reservations"),
    import("../billing/routes"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: "factura-t-reintegro-pg",
      username: "factura-t-reintegro-pg",
      fullName: "Factura T Reintegro PG",
      role: "admin",
    } as any;
    req.isAuthenticated = () => true;
    next();
  });
  registerReservationsRoutes(app);
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

async function request(method: "GET" | "POST", path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}

runIfDatabaseIsConfigured("Factura T — el reintegro no deja saldo fantasma en el Folio", () => {
  beforeAll(async () => {
    if (pool) await startServer();
  });

  afterAll(async () => {
    await stopServer();
    await pool?.end();
  });

  it("emitir una Factura T salda el Folio por completo; su NC repone el 21% como pendiente", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const reservationId = `ft-reintegro-reservation-${suffix}`;
    const paymentId = `ft-reintegro-payment-${suffix}`;
    let invoiceId: number | null = null;
    let ncId: number | null = null;

    try {
      await pool.query(
        `INSERT INTO reservations
           (id, reservation_code, guest_id, room_type_id, room_id, check_in_date, check_out_date, total_room_amount, status, created_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, CURRENT_DATE + 1, '153000.00', 'checked_in', NOW())`,
        [reservationId, `FTR-${suffix}`, `guest-${suffix}`, `type-${suffix}`, `room-${suffix}`],
      );
      await pool.query(
        `INSERT INTO payments (id, reservation_id, amount, method, date, status)
         VALUES ($1, $2, '126446.28', 'efectivo', CURRENT_DATE, 'active')`,
        [paymentId, reservationId],
      );

      const emitResponse = await request("POST", "/api/billing/invoices", {
        tipoComprobante: "FT",
        cliente: {
          razonSocial: "Cardoso Angel",
          dni: "AB123456",
          documentType: "passport",
          condicionIva: "no_categorizado",
        },
        items: [{
          descripcion: "Alojamiento",
          cantidad: 1,
          precioUnitario: 126446.28,
          alicuotaIva: "no_gravado",
          subtotalNeto: 0,
          subtotal: 126446.28,
        }],
        reservaId: reservationId,
        sourceChargeIds: ["accommodation"],
        sourceChargeAmounts: { accommodation: 126446.28 },
        folioContext: { billingTarget: "guest", nationalityCode: "BRA", nationality: "Brasil", hasAccommodation: true },
      });
      expect(emitResponse.status).toBe(201);
      expect(emitResponse.body).toMatchObject({ tipoComprobante: "FT", montoTotal: "126446.28" });
      invoiceId = Number(emitResponse.body.id);

      const chargesAfterEmit = await pool.query(
        `SELECT description, amount, category, status FROM charges WHERE reservation_id = $1`,
        [reservationId],
      );
      expect(chargesAfterEmit.rows).toEqual([
        expect.objectContaining({
          description: expect.stringContaining(`[ft:${invoiceId}:accommodation]`),
          amount: "-26553.72",
          category: "adjustment",
          status: "active",
        }),
      ]);

      const folioAfterEmit = await request("GET", `/api/reservations/${reservationId}/folio`);
      expect(folioAfterEmit.status).toBe(200);
      expect(folioAfterEmit.body).toMatchObject({
        roomTotal: 153000,
        totalCharges: -26553.72,
        grandTotal: 126446.28,
        totalPayments: 126446.28,
        balance: 0,
      });

      // Re-emitting the same POST must not duplicate the waiver charge (the
      // route is retried by the client on network hiccups).
      await request("POST", "/api/billing/invoices", {
        tipoComprobante: "FT",
        cliente: {
          razonSocial: "Cardoso Angel",
          dni: "AB123456",
          documentType: "passport",
          condicionIva: "no_categorizado",
        },
        items: [{
          descripcion: "Alojamiento",
          cantidad: 1,
          precioUnitario: 126446.28,
          alicuotaIva: "no_gravado",
          subtotalNeto: 0,
          subtotal: 126446.28,
        }],
        reservaId: reservationId,
        sourceChargeIds: ["other-accommodation-line"],
        sourceChargeAmounts: { accommodation: 126446.28 },
        folioContext: { billingTarget: "guest", nationalityCode: "BRA", nationality: "Brasil", hasAccommodation: true },
      }).catch(() => undefined);

      const ncResponse = await request("POST", `/api/billing/invoices/${invoiceId}/nota-credito`, {
        motivo: "Anulación de prueba — reintegro turismo",
        items: [{ sourceId: "accommodation", amount: 126446.28 }],
      });
      expect(ncResponse.status).toBe(201);
      ncId = Number(ncResponse.body.id);

      const chargesAfterNc = await pool.query(
        `SELECT description, amount, category FROM charges WHERE reservation_id = $1 ORDER BY description`,
        [reservationId],
      );
      expect(chargesAfterNc.rows).toEqual(expect.arrayContaining([
        expect.objectContaining({
          description: expect.stringContaining(`[ft:${invoiceId}:accommodation]`),
          amount: "-26553.72",
          category: "adjustment",
        }),
        expect.objectContaining({
          description: expect.stringContaining(`[ft-nc:${ncId}:accommodation]`),
          amount: "26553.72",
          category: "adjustment",
        }),
      ]));

      const folioAfterNc = await request("GET", `/api/reservations/${reservationId}/folio`);
      expect(folioAfterNc.status).toBe(200);
      expect(folioAfterNc.body).toMatchObject({
        roomTotal: 153000,
        totalCharges: 0,
        grandTotal: 153000,
        totalPayments: 126446.28,
        balance: 26553.72,
      });
    } finally {
      if (ncId) await pool.query("DELETE FROM sales_invoices WHERE id = $1", [ncId]);
      if (invoiceId) await pool.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
      await pool.query("DELETE FROM charges WHERE reservation_id = $1", [reservationId]);
      await pool.query("DELETE FROM payments WHERE reservation_id = $1", [reservationId]);
      await pool.query("DELETE FROM reservations WHERE id = $1", [reservationId]);
    }
  }, 20_000);
});
