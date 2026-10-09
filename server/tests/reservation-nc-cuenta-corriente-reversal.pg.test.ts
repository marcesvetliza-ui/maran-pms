import { randomUUID } from "node:crypto";
import pg from "pg";
import express from "express";
import * as http from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initAppEnv, resetAppEnvForTests } from "../app-env";

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

const originalFetch = global.fetch;

let baseUrl = "";
let httpServer: http.Server | null = null;

async function startBillingRoutes() {
  const { registerBillingRoutes } = await import("../billing/routes");
  const { loadRolePermissionsCache } = await import("../permissions");
  await loadRolePermissionsCache();
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

  // Este archivo mockea wsaaClient/wsfevClient pero ejercita el camino real
  // de invoiceService.ts (incluida su llamada directa a AFIP en
  // getNextInvoiceNumberFromAfip con arcaAmbiente="homologacion"), que no
  // está mockeada. El default global de test es APP_ENV=test (fail-closed
  // — ver server/tests/setup.ts), así que acá se simula production
  // explícitamente y se mockea fetch, igual que en
  // server/tests/invoice-recovery-draft.pg.test.ts.
  const originalFetch = global.fetch;

  beforeEach(() => {
    resetAppEnvForTests();
    initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });
    // Solo se intercepta la llamada real a AFIP (getNextInvoiceNumberFromAfip,
    // sin mockear) — las llamadas de postNotaCredito al servidor local
    // (baseUrl) siguen usando el fetch real.
    global.fetch = vi.fn(async (url: any, init?: any) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("afip.gov.ar")) {
        return new Response("<soap:Envelope><CbteNro>6</CbteNro></soap:Envelope>", { status: 200 });
      }
      return originalFetch(url, init);
    }) as any;
    mocks.getTokenAuth.mockReset();
    mocks.feCAESolicitar.mockReset();
    mocks.feCompConsultar.mockReset();
    mocks.getTokenAuth.mockResolvedValue({ token: "test-token", sign: "test-sign" });
    mocks.feCompConsultar.mockResolvedValue({ cae: "71234567890123", caeFechaVto: new Date("2026-09-10T12:00:00Z") });
    mocks.feCAESolicitar.mockResolvedValue({ cae: "71234567890123", caeFechaVto: new Date("2026-09-10T12:00:00Z") });

    // emitirFactura asks AFIP for its own last-authorized number (FECompUltimoAutorizado)
    // before every NC, not just the first — each one here must get its own
    // fiscal number, exactly like two real, separately-authorized NCs would.
    // Only the outbound call to AFIP's own WSFE host is faked; the test's own
    // requests to its local Express server (postNotaCredito) must go through
    // untouched.
    let lastAuthorized = 0;
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (!url.includes("afip.gov.ar")) return originalFetch(input as any, init);
      const body = `<soap:Envelope><CbteNro>${lastAuthorized}</CbteNro></soap:Envelope>`;
      lastAuthorized += 1;
      return new Response(body, { status: 200 });
    }) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

    resetAppEnvForTests();
  it.each(["legacy", "operation", "payment"])("acredita cuenta corriente con referencia %s y limita las NC parciales", async (referenceMode) => {
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
      if(referenceMode === "operation") await pool.query(
        'UPDATE sales_invoices SET credit_reapplication_intent=$1::jsonb WHERE id=$2',
        [JSON.stringify({operationId:suffix}),originalInvoiceId]);

      // The cargo the original invoice's cuenta-corriente settlement would
      // have created (server/db-storage.ts createReservationPaymentWithLedger),
      // tagged with the invoice's own reference exactly as issuance does.
      await pool.query(
        `INSERT INTO account_movements (id, entity_type, entity_id, date, type, description, amount, reservation_id, reference)
         VALUES ($1, 'company', $2, CURRENT_DATE, 'cargo', 'Estadía de prueba', '200000.00', $3, $4)`,
        [cargoId, companyId, reservationId, referenceMode === "operation" ? `credit-operation:${suffix}` : originalNroFac],
      );

      if(referenceMode === "payment") {
        const paymentId=randomUUID();
        await pool.query("INSERT INTO payments(id,reservation_id,amount,method,date) VALUES($1,$2,'200000','cuenta_corriente',CURRENT_DATE)",[paymentId,reservationId]);
        await pool.query("UPDATE account_movements SET reference=$1,payment_id=$2 WHERE id=$3",[`credit-operation:${suffix}`,paymentId,cargoId]);
        await pool.query("UPDATE sales_invoices SET payment_id=$1 WHERE id=$2",[paymentId,originalInvoiceId]);
      }

      // Partial NC: the real amount was 150.000, not 200.000 — credit 50.000.
      const first = await postNotaCredito(originalInvoiceId, {
        motivo: "El importe correcto era 150.000",
        monto: 50000,
        items: [{ sourceId: "accommodation", amount: 50000 }],
      });
      expect(first.status, JSON.stringify(first.body)).toBe(201);
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

      // Recovery must neither duplicate the credit nor reapply folio adjustments.
      const recovered=await fetch(`${baseUrl}/api/billing/credit-notes/${first.body.id}/reconcile`,{method:"POST"});
      expect(recovered.status).toBe(200);
      expect((await recovered.json() as any).accountRecovery.status).toBe("already_applied");
      // Simulate an already-issued NC missing only its account movement.
      await pool.query("DELETE FROM account_movements WHERE reservation_id=$1 AND type='pago'",[reservationId]);
      const repairs=await Promise.all([1,2].map(()=>fetch(`${baseUrl}/api/billing/credit-notes/${first.body.id}/reconcile`,{method:"POST"})));
      expect(repairs.map(r=>r.status)).toEqual([200,200]);
      const repairResults=await Promise.all(repairs.map(r=>r.json() as Promise<any>));
      expect(repairResults.map(r=>r.accountRecovery.status).sort()).toEqual(["already_applied","applied"]);
      expect(repairResults.find(r=>r.accountRecovery.status==="applied").accountRecovery.amount).toBe(50000);

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
      await pool.query("DELETE FROM payments WHERE reservation_id = $1", [reservationId]);
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
      expect(response.status, JSON.stringify(response.body)).toBe(201);
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
      await pool.query("DELETE FROM payments WHERE reservation_id = $1", [reservationId]);
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
