import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verifyFinancialSchema } from "../migrate";

vi.mock("../auth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = { username: "recepcion-pg-tester" };
    next();
  },
}));

/**
 * Bug reportado: "realicé un pago desde el folio de eventos a cta cte, que
 * luego anulé y lo agrego pero no lo quito". Causa raíz: PATCH
 * /api/events/:eventId/payments/:payId/anular marcaba el pago como anulado
 * pero nunca revertía el cargo que había creado en account_movements ni
 * corregía el folio del evento — el cargo en Cuenta Corriente quedaba de pie
 * para siempre.
 *
 * Esta suite prueba el flujo real contra PostgreSQL: crear un pago CC de
 * evento (que genera un cargo en account_movements), anularlo, y confirmar
 * que queda un movimiento de ajuste compensatorio que deja el saldo neto en
 * cero — y que una segunda anulación no duplica la reversión.
 */

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;

type Fixture = {
  eventRoomId: string;
  eventId: string;
  companyId: string;
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
    eventRoomId: `pg-event-cc-room-${suffix}`,
    eventId: `pg-event-cc-event-${suffix}`,
    companyId: `pg-event-cc-company-${suffix}`,
  };

  await testPool.query(
    `INSERT INTO event_rooms (id, name, capacity, status) VALUES ($1, 'Salón de prueba', 50, 'available')`,
    [fixture.eventRoomId],
  );
  await testPool.query(
    `INSERT INTO companies (id, razon_social, cuil_cuit) VALUES ($1, 'Empresa de Prueba Eventos SA', '30-71111111-1')`,
    [fixture.companyId],
  );
  await testPool.query(
    `INSERT INTO events
      (id, event_code, name, event_room_id, event_type, contact_name, company_id, start_date, end_date, status, created_at)
     VALUES ($1, $2, 'Evento de prueba CC', $3, 'corporate', 'Contacto de prueba', $4, DATE '2026-08-26', DATE '2026-08-26', 'confirmed', NOW())`,
    [fixture.eventId, `PGEVCC-${suffix}`, fixture.eventRoomId, fixture.companyId],
  );

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

async function anularPayment(fixture: Fixture, paymentId: string, motivoAnulacion: string) {
  const response = await fetch(
    `${baseUrl}/api/events/${fixture.eventId}/payments/${paymentId}/anular`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivoAnulacion }),
    },
  );
  return { status: response.status, body: await response.json() as any };
}

async function readAccountMovements(companyId: string) {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  const result = await testPool.query(
    `SELECT type, amount, reference, description FROM account_movements
     WHERE entity_type = 'company' AND entity_id = $1 ORDER BY created_at`,
    [companyId],
  );
  return result.rows;
}

async function readFolioBalance(eventId: string) {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  const result = await testPool.query(
    `SELECT f.balance FROM folios f WHERE f.entity_type = 'event' AND f.entity_id = $1`,
    [eventId],
  );
  return result.rows[0]?.balance ?? null;
}

runIfDatabaseIsConfigured("PostgreSQL real: anular un pago CC de evento revierte el cargo en Cuenta Corriente", () => {
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

  it("deja el saldo de Cuenta Corriente en cero tras anular el único pago CC del evento", async () => {
    const fixture = await createFixture();
    try {
      const posted = await postCcPayment(fixture, 5000);
      expect(posted.status).toBe(201);
      const paymentId = posted.body.id as string;

      const beforeVoid = await readAccountMovements(fixture.companyId);
      expect(beforeVoid).toHaveLength(1);
      expect(beforeVoid[0]).toMatchObject({ type: "cargo", amount: "5000.00", reference: paymentId });

      const voided = await anularPayment(fixture, paymentId, "El cliente pidió anular el pago");
      expect(voided.status).toBe(200);
      expect(voided.body.status).toBe("anulado");

      const afterVoid = await readAccountMovements(fixture.companyId);
      expect(afterVoid).toHaveLength(2);
      const netTotal = afterVoid.reduce((sum, row) => sum + parseFloat(row.amount), 0);
      expect(netTotal).toBeCloseTo(0, 2);
      const adjustment = afterVoid.find((row) => row.type === "ajuste");
      expect(adjustment).toMatchObject({ reference: `void:${paymentId}`, amount: "-5000.00" });

      const folioBalance = await readFolioBalance(fixture.eventId);
      expect(parseFloat(folioBalance)).toBeCloseTo(0, 2);
    } finally {
      await cleanupFixture(fixture);
    }
  }, 15_000);

  it("no duplica la reversión si /anular se llama dos veces sobre el mismo pago (double-reversal guard)", async () => {
    const fixture = await createFixture();
    try {
      const posted = await postCcPayment(fixture, 3000);
      const paymentId = posted.body.id as string;

      const firstVoid = await anularPayment(fixture, paymentId, "Primera anulación");
      expect(firstVoid.status).toBe(200);

      const secondVoid = await anularPayment(fixture, paymentId, "Segundo intento");
      expect(secondVoid.status).toBe(400);
      expect(secondVoid.body.error).toMatch(/ya está anulado/i);

      const rows = await readAccountMovements(fixture.companyId);
      expect(rows).toHaveLength(2);
      const netTotal = rows.reduce((sum, row) => sum + parseFloat(row.amount), 0);
      expect(netTotal).toBeCloseTo(0, 2);
    } finally {
      await cleanupFixture(fixture);
    }
  }, 15_000);

  it("no crea ningún movimiento de Cuenta Corriente para un pago en efectivo, ni al anularlo", async () => {
    const fixture = await createFixture();
    try {
      const response = await fetch(`${baseUrl}/api/events/${fixture.eventId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 2000, method: "efectivo" }),
      });
      const posted = await response.json() as any;
      expect(response.status).toBe(201);

      const beforeVoid = await readAccountMovements(fixture.companyId);
      expect(beforeVoid).toHaveLength(0);

      const voided = await anularPayment(fixture, posted.id, "Anulación de pago en efectivo");
      expect(voided.status).toBe(200);

      const afterVoid = await readAccountMovements(fixture.companyId);
      expect(afterVoid).toHaveLength(0);
    } finally {
      await cleanupFixture(fixture);
    }
  }, 15_000);
});
