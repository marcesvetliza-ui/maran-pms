import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verifyFinancialSchema } from "../migrate";

/**
 * "Dale, agregalo para trazabilidad" — cuando una reserva no tiene nada
 * para facturar (tarifa $0, sin cargos), el check-out ahora registra un
 * movimiento informativo de $0 en Caja (paymentMethod "no_fiscal",
 * movementType "informational") para que quede visible/auditable, sin sumar
 * a ningún total del turno (igual que Cuenta Corriente/voucher).
 *
 * Prueba el flujo real POST /api/reservations/:id/check-out contra
 * PostgreSQL: una reserva $0 debe generar exactamente un movimiento así, y
 * repetir el check-out no debe duplicarlo. Una reserva con cargos reales no
 * debe generar ninguno.
 */

vi.mock("../auth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = { username: "recepcion-pg-tester" };
    next();
  },
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));
vi.mock("../email-service", () => ({
  sendCheckoutEmail: vi.fn().mockResolvedValue(undefined),
  sendConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../billing/invoicePdf", () => ({ generarResumenCuentaPDF: vi.fn() }));
vi.mock("../billing/billingConfig", () => ({
  getBillingConfig: vi.fn().mockResolvedValue({ arcaAmbiente: "ficticio" }),
}));
vi.mock("../billing/invoiceService", () => ({
  emitirFactura: vi.fn(),
  buildComprobanteAsociado: vi.fn(),
}));
vi.mock("pdfkit", () => ({
  default: class PDFDocument {
    pipe() { return this; }
    end() {}
    on() { return this; }
    text() { return this; }
    moveDown() { return this; }
    fontSize() { return this; }
    font() { return this; }
    fillColor() { return this; }
    image() { return this; }
    rect() { return this; }
    stroke() { return this; }
    save() { return this; }
    restore() { return this; }
    addPage() { return this; }
    moveTo() { return this; }
    lineTo() { return this; }
    fillAndStroke() { return this; }
    translate() { return this; }
    dash() { return this; }
    undash() { return this; }
    lineWidth() { return this; }
    lineCap() { return this; }
  },
}));

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;

type Fixture = {
  roomTypeId: string;
  roomId: string;
  guestId: string;
  reservationId: string;
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
  const { registerReservationsRoutes } = await import("../routes/reservations");
  const app = express();
  app.use(express.json());
  registerReservationsRoutes(app);

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

async function createFixture(roomTotal: number): Promise<Fixture> {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  const suffix = randomUUID();
  const fixture: Fixture = {
    roomTypeId: `pg-nocharge-rt-${suffix}`,
    roomId: `pg-nocharge-room-${suffix}`,
    guestId: `pg-nocharge-guest-${suffix}`,
    reservationId: `pg-nocharge-res-${suffix}`,
  };

  await testPool.query(
    `INSERT INTO room_types (id, code, name) VALUES ($1, $2, 'Standard de prueba')`,
    [fixture.roomTypeId, `RT-${suffix}`],
  );
  await testPool.query(
    `INSERT INTO rooms (id, room_number, room_type_id, floor, status)
     VALUES ($1, $2, $3, 3, 'occupied')`,
    [fixture.roomId, `301-${suffix.slice(0, 6)}`, fixture.roomTypeId],
  );
  await testPool.query(
    `INSERT INTO guests (id, first_name, last_name) VALUES ($1, 'César', 'Farías')`,
    [fixture.guestId],
  );
  await testPool.query(
    `INSERT INTO reservations
      (id, reservation_code, guest_id, room_type_id, room_id, check_in_date, check_out_date,
       nights, status, source, number_of_guests, total_room_amount, final_rate_per_night, created_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_DATE - 2, CURRENT_DATE, 2, 'checked_in', 'directo', 1, $6, $6, NOW())`,
    [fixture.reservationId, `PGNC-${suffix}`, fixture.guestId, fixture.roomTypeId, fixture.roomId, roomTotal],
  );

  return fixture;
}

async function cleanupFixture(fixture: Fixture) {
  if (!testPool) return;
  await testPool.query(`DELETE FROM cash_movements WHERE source_id = $1`, [fixture.reservationId]);
  await testPool.query(`DELETE FROM charges WHERE reservation_id = $1`, [fixture.reservationId]);
  await testPool.query(`DELETE FROM reservations WHERE id = $1`, [fixture.reservationId]);
  await testPool.query(`DELETE FROM guests WHERE id = $1`, [fixture.guestId]);
  await testPool.query(`DELETE FROM rooms WHERE id = $1`, [fixture.roomId]);
  await testPool.query(`DELETE FROM room_types WHERE id = $1`, [fixture.roomTypeId]);
}

async function postCheckout(reservationId: string) {
  const response = await fetch(`${baseUrl}/api/reservations/${reservationId}/check-out`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return { status: response.status, body: await response.json() as any };
}

async function readNoChargeMovements(reservationId: string) {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  const result = await testPool.query(
    `SELECT payment_method, amount, movement_type, source_type, source_label
     FROM cash_movements WHERE source_id = $1`,
    [reservationId],
  );
  return result.rows;
}

runIfDatabaseIsConfigured("PostgreSQL real: check-out sin cargos registra una salida no fiscal en Caja", () => {
  beforeAll(async () => {
    if (!testPool) return;
    const financialSchema = await verifyFinancialSchema();
    expect(
      financialSchema,
      "La base de datos debe tener todas las columnas e índices requeridos.",
    ).toMatchObject({ ready: true, missingColumns: [], missingIndexes: [] });
    await startApp();
  });

  afterAll(async () => {
    await stopApp();
    await testPool?.end();
    const { pool } = await import("../db");
    await pool.end();
  });

  it("registra un movimiento informativo de $0 al hacer check-out de una reserva con tarifa $0 y sin cargos", async () => {
    const fixture = await createFixture(0);
    try {
      const result = await postCheckout(fixture.reservationId);
      expect(result.status).toBe(200);

      const movements = await readNoChargeMovements(fixture.reservationId);
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({
        payment_method: "no_fiscal",
        amount: "0.00",
        movement_type: "informational",
        source_type: "reservation_checkout_no_charge",
      });
      expect(movements[0].source_label).toMatch(/Check-out sin cargos/i);
    } finally {
      await cleanupFixture(fixture);
    }
  }, 15_000);

  it("no duplica el movimiento si el check-out se repite sobre la misma reserva", async () => {
    const fixture = await createFixture(0);
    try {
      await testPool!.query(`UPDATE reservations SET status = 'checked_in' WHERE id = $1`, [fixture.reservationId]);
      const first = await postCheckout(fixture.reservationId);
      expect(first.status).toBe(200);

      // Reabrir la reserva y repetir el check-out sobre el mismo id, simulando un reintento.
      await testPool!.query(`UPDATE reservations SET status = 'checked_in' WHERE id = $1`, [fixture.reservationId]);
      const second = await postCheckout(fixture.reservationId);
      expect(second.status).toBe(200);

      const movements = await readNoChargeMovements(fixture.reservationId);
      expect(movements).toHaveLength(1);
    } finally {
      await cleanupFixture(fixture);
    }
  }, 15_000);

  it("NO registra el movimiento cuando la reserva tiene una tarifa real (aunque el saldo termine en cero)", async () => {
    const fixture = await createFixture(1000);
    try {
      await testPool!.query(
        `INSERT INTO payments (id, reservation_id, amount, method, date, status)
         VALUES ($1, $2, 1000, 'efectivo', CURRENT_DATE, 'active')`,
        [`pg-nocharge-pay-${fixture.reservationId}`, fixture.reservationId],
      );
      const result = await postCheckout(fixture.reservationId);
      expect(result.status).toBe(200);

      const movements = await readNoChargeMovements(fixture.reservationId);
      expect(movements).toHaveLength(0);
    } finally {
      await testPool!.query(`DELETE FROM payments WHERE reservation_id = $1`, [fixture.reservationId]);
      await cleanupFixture(fixture);
    }
  }, 15_000);
});
