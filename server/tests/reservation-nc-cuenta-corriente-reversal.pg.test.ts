import { randomUUID } from "node:crypto";
import pg from "pg";
import express from "express";
import * as http from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guards the fix for: crediting (Nota de Crédito) a reservation invoice that
 * was settled against a company/agency/guest's cuenta corriente left that
 * account's balance untouched — the debt kept showing the original amount
 * forever, with no trace the invoice was ever corrected. See
 * reconcileReservationCreditNote in server/billing/routes.ts: it now credits
 * back the matching account_movements 'cargo' (found by reservation_id +
 * the original invoice's own reference) by the NC total, capped at what
 * that cargo still has un-reversed so repeated partial NCs on the same
 * invoice never push the account past zero.
 */

const mocks = vi.hoisted(() => ({
  getTokenAuth: vi.fn(),
  feCAESolicitar: vi.fn(),
  feCompConsultar: vi.fn(),
}));

vi.mock("../billing/billingConfig", () => ({
  getBillingConfig: vi.fn(async () => ({
    arcaAmbiente: "homologacion",
    puntoVenta: 1,
    puntoVentaHomolog: 99,
    arcaCuit: "30-12345678-9",
  })),
}));

vi.mock("../billing/wsaaClient", () => ({ getTokenAuth: mocks.getTokenAuth }));
vi.mock("../billing/wsfevClient", () => ({
  feCAESolicitar: mocks.feCAESolicitar,
  feCompConsultar: mocks.feCompConsultar,
}));

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 })
  : null;

let baseUrl = "";
let httpServer: http.Server | null = null;

async function startBillingRoutes() {
  const { registerBillingRoutes } = await import("../billing/routes");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "nc-cc-reversal-test", username: "tester-admin", fullName: "Tester Admin", role: "admin" } as any;
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

async function postNotaCredito(invoiceId: number, body: unknown) {
  const response = await fetch(`${baseUrl}/api/billing/invoices/${invoiceId}/nota-credito`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}

runIfDatabaseIsConfigured("PostgreSQL real: la NC de una factura de reserva a cuenta corriente acredita la cuenta", () => {
  beforeAll(async () => {
    if (pool) await startBillingRoutes();
  });

  beforeEach(() => {
    mocks.getTokenAuth.mockReset();
    mocks.feCAESolicitar.mockReset();
    mocks.feCompConsultar.mockReset();
    mocks.getTokenAuth.mockResolvedValue({ token: "test-token", sign: "test-sign" });
    mocks.feCompConsultar.mockResolvedValue({ cae: "71234567890123", caeFechaVto: new Date("2026-09-10T12:00:00Z") });
    mocks.feCAESolicitar.mockResolvedValue({ cae: "71234567890123", caeFechaVto: new Date("2026-09-10T12:00:00Z") });
  });

  it("acredita el saldo de cuenta corriente exactamente en el monto de la NC, y una segunda NC nunca lo pasa de cero", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const companyId = `nc-cc-company-${suffix}`;
    const reservationId = `nc-cc-reservation-${suffix}`;
    const puntoVenta = 8500 + (parseInt(suffix.slice(0, 4), 16) % 400);
    const originalNumero = 500000 + (parseInt(suffix.slice(4, 10), 16) % 100000);
    let originalInvoiceId: number | null = null;
    const ncInvoiceIds: number[] = [];
    const cargoId = randomUUID();

    try {
      await pool.query(
        `INSERT INTO companies (id, razon_social, cuil_cuit, is_active)
         VALUES ($1, $2, '20-12345678-9', 'true')`,
        [companyId, `Empresa NC Cta Cte ${suffix}`],
      );
      await pool.query(
        `INSERT INTO reservations
           (id, reservation_code, guest_id, room_type_id, room_id, check_in_date, check_out_date, total_room_amount, status, created_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, CURRENT_DATE + 1, '200000.00', 'checked_in', NOW())`,
        [reservationId, `NCC-${suffix}`, `guest-${suffix}`, `type-${suffix}`, `room-${suffix}`],
      );

      const originalNroFac = `FB-${String(originalNumero).padStart(8, "0")}`;
      const invoiceInsert = await pool.query<{ id: number }>(
        `INSERT INTO sales_invoices
           (tipo_comprobante, punto_venta, numero, fecha_emision, cliente_razon_social,
            cliente_condicion_iva, monto_neto, monto_total, estado, reconciliation_status,
            reserva_id, cash_forma_pago, source_charge_ids, source_charge_amounts, items, created_at)
         VALUES
           ('FB', $1, $2, CURRENT_DATE, 'Consumidor Final', 'Consumidor Final',
            '0.00', '200000.00', 'emitida', 'conciliada',
            $3, 'cuenta_corriente', '["accommodation"]'::jsonb,
            '{"accommodation": 200000}'::jsonb, $4::jsonb, NOW())
         RETURNING id`,
        [puntoVenta, originalNumero, reservationId, JSON.stringify([{ descripcion: "Alojamiento", subtotal: 200000 }])],
      );
      originalInvoiceId = invoiceInsert.rows[0].id;

      // The cargo the original invoice's cuenta-corriente settlement would
      // have created (server/db-storage.ts createReservationPaymentWithLedger),
      // tagged with the invoice's own reference exactly as issuance does.
      await pool.query(
        `INSERT INTO account_movements (id, entity_type, entity_id, date, type, description, amount, reservation_id, reference)
         VALUES ($1, 'company', $2, CURRENT_DATE, 'cargo', 'Estadía de prueba', '200000.00', $3, $4)`,
        [cargoId, companyId, reservationId, originalNroFac],
      );

      // Partial NC: the real amount was 150.000, not 200.000 — credit 50.000.
      const first = await postNotaCredito(originalInvoiceId, {
        motivo: "El importe correcto era 150.000",
        monto: 50000,
        items: [{ sourceId: "accommodation", amount: 50000 }],
      });
      expect(first.status).toBe(201);
      ncInvoiceIds.push(Number(first.body.id));

      const movementsAfterFirst = await pool.query(
        `SELECT type, amount, description, reference FROM account_movements
         WHERE reservation_id = $1 ORDER BY created_at`,
        [reservationId],
      );
      const reversalRows = movementsAfterFirst.rows.filter((r: any) => r.type === "pago");
      expect(reversalRows).toHaveLength(1);
      expect(parseFloat(reversalRows[0].amount)).toBeCloseTo(-50000, 2);
      expect(reversalRows[0].description).toContain(originalNroFac);

      // The original cargo itself is untouched — only a compensating entry
      // was added, exactly like the existing "Ajuste por NC" charges pattern.
      const cargoAfterFirst = await pool.query(
        "SELECT amount FROM account_movements WHERE id = $1",
        [cargoId],
      );
      expect(parseFloat(cargoAfterFirst.rows[0].amount)).toBe(200000);

      // Net account balance for this reservation's cargo is now 150.000 —
      // exactly the corrected real amount.
      const netBalance = movementsAfterFirst.rows.reduce((sum: number, r: any) => sum + parseFloat(r.amount), 0);
      expect(netBalance).toBeCloseTo(150000, 2);

      // Second, larger-than-remaining NC on the rest of the invoice: even if
      // requested amount tried to exceed what's left uncredited, the account
      // reversal must never push the account past its own cargo amount.
      const second = await postNotaCredito(originalInvoiceId, {
        motivo: "Se corrige el resto también",
        monto: 150000,
        items: [{ sourceId: "accommodation", amount: 150000 }],
      });
      expect(second.status).toBe(201);
      ncInvoiceIds.push(Number(second.body.id));

      const movementsAfterSecond = await pool.query(
        `SELECT type, amount FROM account_movements WHERE reservation_id = $1`,
        [reservationId],
      );
      const finalBalance = movementsAfterSecond.rows.reduce((sum: number, r: any) => sum + parseFloat(r.amount), 0);
      expect(finalBalance).toBeCloseTo(0, 2);
      const totalReversed = movementsAfterSecond.rows
        .filter((r: any) => r.type === "pago")
        .reduce((sum: number, r: any) => sum + parseFloat(r.amount), 0);
      expect(totalReversed).toBeCloseTo(-200000, 2);
    } finally {
      if (originalInvoiceId) {
        await pool.query(
          "DELETE FROM sales_invoices WHERE id = $1 OR id = ANY($2::int[])",
          [originalInvoiceId, ncInvoiceIds],
        );
      }
      await pool.query("DELETE FROM account_movements WHERE reservation_id = $1", [reservationId]);
      await pool.query("DELETE FROM reservations WHERE id = $1", [reservationId]);
      await pool.query("DELETE FROM companies WHERE id = $1", [companyId]);
      await pool.query(
        "DELETE FROM invoice_counters WHERE punto_venta = $1",
        [puntoVenta],
      );
    }
  }, 20_000);

  it("no crea ningún movimiento de cuenta corriente cuando la factura no estaba a cuenta corriente", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const reservationId = `nc-cash-reservation-${suffix}`;
    const puntoVenta = 8900 + (parseInt(suffix.slice(0, 4), 16) % 400);
    const originalNumero = 600000 + (parseInt(suffix.slice(4, 10), 16) % 100000);
    let originalInvoiceId: number | null = null;
    const ncInvoiceIds: number[] = [];

    try {
      await pool.query(
        `INSERT INTO reservations
           (id, reservation_code, guest_id, room_type_id, room_id, check_in_date, check_out_date, total_room_amount, status, created_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, CURRENT_DATE + 1, '80000.00', 'checked_in', NOW())`,
        [reservationId, `NCASH-${suffix}`, `guest-${suffix}`, `type-${suffix}`, `room-${suffix}`],
      );
      const invoiceInsert = await pool.query<{ id: number }>(
        `INSERT INTO sales_invoices
           (tipo_comprobante, punto_venta, numero, fecha_emision, cliente_razon_social,
            cliente_condicion_iva, monto_neto, monto_total, estado, reconciliation_status,
            reserva_id, cash_forma_pago, source_charge_ids, source_charge_amounts, items, created_at)
         VALUES
           ('FB', $1, $2, CURRENT_DATE, 'Consumidor Final', 'Consumidor Final',
            '0.00', '80000.00', 'emitida', 'conciliada',
            $3, 'efectivo', '["accommodation"]'::jsonb,
            '{"accommodation": 80000}'::jsonb, $4::jsonb, NOW())
         RETURNING id`,
        [puntoVenta, originalNumero, reservationId, JSON.stringify([{ descripcion: "Alojamiento", subtotal: 80000 }])],
      );
      originalInvoiceId = invoiceInsert.rows[0].id;

      const response = await postNotaCredito(originalInvoiceId, {
        motivo: "Corrección de un pago en efectivo",
        monto: 80000,
        items: [{ sourceId: "accommodation", amount: 80000 }],
      });
      expect(response.status).toBe(201);
      ncInvoiceIds.push(Number(response.body.id));

      const movements = await pool.query(
        "SELECT id FROM account_movements WHERE reservation_id = $1",
        [reservationId],
      );
      expect(movements.rows).toEqual([]);
    } finally {
      if (originalInvoiceId) {
        await pool.query(
          "DELETE FROM sales_invoices WHERE id = $1 OR id = ANY($2::int[])",
          [originalInvoiceId, ncInvoiceIds],
        );
      }
      await pool.query("DELETE FROM reservations WHERE id = $1", [reservationId]);
      await pool.query("DELETE FROM invoice_counters WHERE punto_venta = $1", [puntoVenta]);
    }
  }, 20_000);

  afterAll(async () => {
    if (httpServer) {
      await new Promise<void>((resolve, reject) => httpServer!.close((error) => error ? reject(error) : resolve()));
    }
    await pool?.end();
  });
});
