import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verifyFinancialSchema } from "../migrate";

/**
 * "Arreglá también la NC de evento" — la emisión de una Nota de Crédito que
 * cancela toda la factura de un evento escribía movimientos "void" en el
 * folio con el mismo signo que el pago original, así que en vez de devolver
 * el saldo a su estado previo lo empujaba más lejos de cero (ver
 * event-cc-payment-void-account-movement.pg.test.ts para el mismo bug en la
 * anulación de un pago individual). Además, la NC nunca revertía el cargo en
 * Cuenta Corriente de los pagos CC que formaban la factura — quedaba de pie
 * para siempre, igual que la anulación puntual antes de este arreglo.
 *
 * Esta suite prueba el flujo real POST /api/events/:eventId/nc contra
 * PostgreSQL, mockeando solo la emisión fiscal (ARCA) — todo lo demás
 * (rutas, storage, folio, account_movements) corre contra la base real.
 */

vi.mock("../auth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = { username: "recepcion-pg-tester", fullName: "Recepción PG Tester" };
    next();
  },
}));
vi.mock("../eventPdfs", () => ({
  generateHojaFuncionPdf: vi.fn(),
  generateConfirmacionEventoPdf: vi.fn(),
  generateTablesResumenPdf: vi.fn(),
  generateTableReceiptPdf: vi.fn(),
}));
vi.mock("../email-service", () => ({ sendEmailWithPdfAttachment: vi.fn() }));

let nextNcId = 90001;
vi.mock("../billing/invoiceService", () => ({
  emitirFactura: vi.fn(async () => ({ id: nextNcId++, tipoComprobante: "NCB", puntoVenta: 1, numero: nextNcId, cae: "CAE-NC-TEST", montoTotal: "5000.00" })),
  buildComprobanteAsociado: () => ({ tipo: "FB", puntoVenta: 1, numero: 1, fecha: "20260826" }),
}));

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;

type Fixture = {
  eventRoomId: string;
  eventId: string;
  companyId: string;
  invoiceId: number;
};

const testPool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 4,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 1_000,
    })
  : null;

let baseUrl = "";
let httpServer: http.Server | null = null;

async function startApp() {
  const { registerEventsRoutes } = await import("../routes/events");
  const app = express();
  app.use(express.json());
  registerEventsRoutes(app);

  httpServer = await new Promise<http.Server>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
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

async function createFixture(): Promise<Fixture> {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  const suffix = randomUUID();
  const fixture: Fixture = {
    eventRoomId: `pg-event-nc-room-${suffix}`,
    eventId: `pg-event-nc-event-${suffix}`,
    companyId: `pg-event-nc-company-${suffix}`,
    invoiceId: 0,
  };

  await testPool.query(
    `INSERT INTO event_rooms (id, name, capacity, status) VALUES ($1, 'Salón de prueba NC', 50, 'available')`,
    [fixture.eventRoomId],
  );
  await testPool.query(
    `INSERT INTO companies (id, razon_social, cuil_cuit) VALUES ($1, 'Empresa de Prueba NC Eventos SA', '30-72222222-2')`,
    [fixture.companyId],
  );
  await testPool.query(
    `INSERT INTO events
      (id, event_code, name, event_room_id, event_type, contact_name, company_id, start_date, end_date, status, created_at)
     VALUES ($1, $2, 'Evento de prueba NC', $3, 'corporate', 'Contacto de prueba', $4, DATE '2026-08-26', DATE '2026-08-26', 'confirmed', NOW())`,
    [fixture.eventId, `PGEVNC-${suffix}`, fixture.eventRoomId, fixture.companyId],
  );

  const invoiceResult = await testPool.query(
    `INSERT INTO sales_invoices
      (tipo_comprobante, punto_venta, numero, fecha_emision, cliente_razon_social, cliente_condicion_iva,
       monto_neto, monto_iva21, monto_total, cae, estado)
     VALUES ('FB', 1, 1, CURRENT_DATE, 'Empresa de Prueba NC Eventos SA', 'consumidor_final',
       '4132.23', '867.77', '5000.00', 'CAE-ORIGINAL', 'emitida')
     RETURNING id`,
  );
  fixture.invoiceId = invoiceResult.rows[0].id;
  await testPool.query(`UPDATE events SET invoice_id = $1 WHERE id = $2`, [fixture.invoiceId, fixture.eventId]);

  return fixture;
}

async function cleanupFixture(fixture: Fixture) {
  if (!testPool) return;
  await testPool.query(
    `DELETE FROM folio_movements WHERE folio_id IN (SELECT id FROM folios WHERE entity_type = 'event' AND entity_id = $1)`,
    [fixture.eventId],
  );
  await testPool.query(`DELETE FROM folios WHERE entity_type = 'event' AND entity_id = $1`, [fixture.eventId]);
  await testPool.query(`DELETE FROM account_movements WHERE entity_id = $1`, [fixture.companyId]);
  await testPool.query(`DELETE FROM cash_movements WHERE source_id = $1`, [fixture.eventId]);
  await testPool.query(`DELETE FROM event_payments WHERE event_id = $1`, [fixture.eventId]);
  await testPool.query(`DELETE FROM events WHERE id = $1`, [fixture.eventId]);
  await testPool.query(`DELETE FROM companies WHERE id = $1`, [fixture.companyId]);
  await testPool.query(`DELETE FROM event_rooms WHERE id = $1`, [fixture.eventRoomId]);
  if (fixture.invoiceId) {
    await testPool.query(`DELETE FROM sales_invoices WHERE id = $1`, [fixture.invoiceId]);
  }
}

async function postCcPayment(fixture: Fixture, amount: number) {
  const response = await fetch(`${baseUrl}/api/events/${fixture.eventId}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount,
      method: "cuenta_corriente",
      ccEntityType: "company",
      ccEntityId: fixture.companyId,
    }),
  });
  return { status: response.status, body: await response.json() as any };
}

async function postNc(fixture: Fixture) {
  const response = await fetch(`${baseUrl}/api/events/${fixture.eventId}/nc`, { method: "POST" });
  return { status: response.status, body: await response.json() as any };
}

async function readAccountMovements(companyId: string) {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  const result = await testPool.query(
    `SELECT type, amount, reference FROM account_movements
     WHERE entity_type = 'company' AND entity_id = $1 ORDER BY created_at`,
    [companyId],
  );
  return result.rows;
}

async function readFolio(eventId: string) {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  const result = await testPool.query(
    `SELECT balance, total_payments FROM folios WHERE entity_type = 'event' AND entity_id = $1`,
    [eventId],
  );
  return result.rows[0] ?? null;
}

runIfDatabaseIsConfigured("PostgreSQL real: la NC de evento revierte el cargo CC y devuelve el saldo del folio a su valor previo", () => {
  beforeAll(async () => {
    if (!testPool) return;
    const financialSchema = await verifyFinancialSchema();
    expect(
      financialSchema,
      "La base de datos debe tener todas las columnas e índices requeridos por Cuenta Corriente.",
    ).toMatchObject({ ready: true, missingColumns: [], missingIndexes: [] });
    await startApp();
  });

  afterAll(async () => {
    await stopApp();
    await testPool?.end();
    const { pool } = await import("../db");
    await pool.end();
  });

  it("tras la NC, el saldo del folio vuelve a su valor previo al pago y el cargo CC queda en cero", async () => {
    const fixture = await createFixture();
    try {
      const posted = await postCcPayment(fixture, 5000);
      expect(posted.status).toBe(201);

      const folioBeforeNc = await readFolio(fixture.eventId);
      expect(parseFloat(folioBeforeNc.balance)).toBeCloseTo(-5000, 2);

      const ncResult = await postNc(fixture);
      expect(ncResult.status).toBe(200);
      expect(ncResult.body.ncId).toBeTruthy();

      const folioAfterNc = await readFolio(fixture.eventId);
      expect(parseFloat(folioAfterNc.balance)).toBeCloseTo(0, 2);

      const movements = await readAccountMovements(fixture.companyId);
      expect(movements).toHaveLength(2);
      const netTotal = movements.reduce((sum, row) => sum + parseFloat(row.amount), 0);
      expect(netTotal).toBeCloseTo(0, 2);
      expect(movements.some((row) => row.type === "ajuste")).toBe(true);
    } finally {
      await cleanupFixture(fixture);
    }
  }, 15_000);
});
