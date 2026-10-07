import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPrefacturaSubmission } from "../../client/src/lib/prefactura-submission";

// Never infer permission to modify a database from ambient DATABASE_URL.
const testUrl = process.env.RESERVATION_FLOW_TEST_DATABASE_URL;
if (testUrl) {
  const parsed = new URL(testUrl);
  if (parsed.hostname !== "127.0.0.1"
      || !parsed.pathname.startsWith("/reservation_flow_test")
      || process.env.DATABASE_URL !== testUrl) {
    throw new Error("Operational flow tests require their explicitly opted-in, disposable local database.");
  }
}
const runIsolated = testUrl ? describe : describe.skip;
let testPool: pg.Pool;
let server: http.Server | undefined;
let baseUrl = "";
let cookie = "";
const username = `flow-${randomUUID()}`;
const password = randomUUID(); // Synthetic, only used in this disposable test.
const realFetch = globalThis.fetch;

async function api(method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return { status: response.status, body: await response.json() };
}

runIsolated("Reservation circuit in disposable PostgreSQL, through real authenticated API", () => {
  beforeAll(async () => {
    vi.stubEnv("SESSION_SECRET", randomUUID());
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY", "unused-isolated-test");
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_BASE_URL", "http://127.0.0.1:1");
    vi.stubEnv("OPENAI_API_KEY", "unused-isolated-test");
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.hostname !== "127.0.0.1") throw new Error("External fetch is prohibited in isolated financial tests.");
      return realFetch(input, init);
    });
    testPool = new pg.Pool({ connectionString: testUrl, max: 3 });
    const { RESERVATION_PAYMENT_REQUEST_SCHEMA_SQL } = await import("../reservationPaymentRequest");
    await testPool.query(RESERVATION_PAYMENT_REQUEST_SCHEMA_SQL);
    await testPool.query(RESERVATION_PAYMENT_REQUEST_SCHEMA_SQL); // Startup is repeatable.
    // Only the disposable database's empty session table is removed, to prove
    // setupAuth itself supports the first login without manual provisioning.
    expect((await testPool.query("SELECT count(*) FROM sessions")).rows[0].count).toBe("0");
    await testPool.query("DROP TABLE sessions");
    const { setupAuth, hashPassword } = await import("../auth");
    await testPool.query(
      `INSERT INTO system_users (id, username, password, email, full_name, role, is_active, created_at)
       VALUES ($1, $2, $3, 'flow@example.invalid', 'Isolated validation', 'admin', 'true', NOW())`,
      [randomUUID(), username, await hashPassword(password)],
    );
    const { verifyFinancialSchema } = await import("../migrate");
    expect((await verifyFinancialSchema()).ready).toBe(true);
    // Match server/index.ts: migrations run in a separate CI process, so
    // this API process must load its own permission snapshot before serving.
    const { loadRolePermissionsCache } = await import("../permissions");
    await loadRolePermissionsCache();
    const app = express();
    app.use(express.json());
    setupAuth(app);
    server = http.createServer(app);
    const { registerRoutes } = await import("../routes");
    await registerRoutes(server, app);
    app.use((error: any, _req: any, res: any, _next: any) => {
      res.status(error.statusCode ?? error.status ?? 500).json({ error: error.message });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await testPool?.end();
    const { pool } = await import("../db");
    await pool.end();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("first login creates sessions; concurrent bootstrap preserves the saved session", async () => {
    expect((await api("GET", "/api/auth/me")).status).toBe(401);
    const login = await api("POST", "/api/auth/login", { username, password });
    expect(login.status).toBe(200);
    expect((await api("GET", "/api/auth/me")).body.username).toBe(username);
    const before = Number((await testPool.query("SELECT count(*) FROM sessions")).rows[0].count);
    expect(before).toBeGreaterThan(0);
    const { ensureSessionStoreSchema } = await import("../sessionStoreSchema");
    await Promise.all(Array.from({ length: 4 }, () => ensureSessionStoreSchema(testPool)));
    expect(Number((await testPool.query("SELECT count(*) FROM sessions")).rows[0].count)).toBe(before);
    expect((await testPool.query("SELECT to_regclass('sessions_expire_idx') IS NOT NULL AS present")).rows[0].present).toBe(true);
    expect((await api("GET", "/api/auth/me")).status).toBe(200);
  });

  it("voids the mistaken $5,000 once; cash void plus transfer leaves both balances zero", async () => {
    const guestId = randomUUID();
    const typeId = randomUUID();
    const roomId = randomUUID();
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    const nextDate = new Date(`${today}T12:00:00-03:00`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const tomorrow = nextDate.toISOString().slice(0, 10);
    await testPool.query("INSERT INTO guests (id, first_name, last_name) VALUES ($1, 'Isolated', 'Guest')", [guestId]);
    await testPool.query("INSERT INTO room_types (id, code, name) VALUES ($1, $2, 'Isolated room type')", [typeId, `flow-${typeId}`]);
    await testPool.query("INSERT INTO rooms (id, room_number, room_type_id, status) VALUES ($1, $2, $3, 'available')",
      [roomId, `flow-${roomId}`, typeId]);
    const init = await api("POST", "/api/cash/init-shifts");
    expect(init.status).toBe(200);
    const { storage } = await import("../db-storage");
    const shift = await storage.getCurrentShift("reception");
    expect(shift?.area).toBe("recepcion");
    expect((await api("POST", "/api/cash/shifts/open", { area: "reception" })).status).toBe(400);
    const created = await api("POST", "/api/reservations", {
      guestId, roomTypeId: typeId, roomId, checkInDate: today, checkOutDate: tomorrow,
      finalRatePerNight: "100000.00", totalRoomAmount: "100000.00", numberOfGuests: 1,
      status: "confirmed", source: "directo",
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const reservationId = created.body.id;
    expect((await api("POST", `/api/reservations/${reservationId}/check-in`, {})).status).toBe(200);
    expect((await api("POST", "/api/charges", {
      reservationId, amount: "20000.00", description: "Isolated consumption", category: "restaurant", date: today,
    })).status).toBe(201);
    const wrongCharge = await api("POST", "/api/charges", {
      reservationId, amount: "5000.00", description: "Mistaken manual extra", category: "otros", date: today,
    });
    expect(wrongCharge.status).toBe(201);
    const voidPath = `/api/charges/${wrongCharge.body.id}/anular`;
    expect((await api("PATCH", voidPath, { motivoAnulacion: "Entered in error" })).status).toBe(200);
    expect((await api("PATCH", voidPath, { motivoAnulacion: "Retry" })).status).toBe(400);
    const generalFolio = async () => (await testPool.query(
      "SELECT total_charges::text, total_payments::text, balance::text FROM folios WHERE entity_type = 'reservation' AND entity_id = $1",
      [reservationId],
    )).rows[0];
    expect(await generalFolio()).toMatchObject({ total_charges: "120000.00", balance: "120000.00" });
    const cash = await api("POST", "/api/payments", { reservationId, amount: "120000.00", method: "efectivo", date: today });
    expect(cash.status, JSON.stringify(cash.body)).toBe(201);
    expect(await generalFolio()).toMatchObject({ balance: "0.00" });
    expect((await testPool.query("SELECT shift_id FROM cash_movements WHERE payment_id = $1", [cash.body.id])).rows[0].shift_id).toBe(shift!.id);
    expect((await api("PATCH", `/api/payments/${cash.body.id}/anular`, { motivoAnulacion: "Replace with transfer" })).status).toBe(200);
    expect(await generalFolio()).toMatchObject({ balance: "120000.00" });
    const transfer = await api("POST", "/api/payments", { reservationId, amount: "120000.00", method: "transferencia", date: today });
    expect(transfer.status, JSON.stringify(transfer.body)).toBe(201);
    expect(await generalFolio()).toMatchObject({ total_charges: "120000.00", balance: "0.00" });
    const checkout = await api("POST", `/api/reservations/${reservationId}/check-out`, {});
    expect(checkout.status, JSON.stringify(checkout.body)).toBe(200);
    expect((await storage.getReservation(reservationId))?.status).toBe("checked_out");
    expect((await storage.getRoom(roomId))?.status).toBe("dirty");
    expect(await generalFolio()).toMatchObject({ balance: "0.00" });
    const operationalFolio = await api("GET", `/api/reservations/${reservationId}/folio`);
    expect(operationalFolio.status).toBe(200);
    expect(Number(operationalFolio.body.balance)).toBe(0);
    const closing = await api("POST", `/api/cash/shifts/${shift!.id}/close`, {
      closedBy: username, efectivoContado: 0, enviarAAdministracion: false,
    });
    expect(closing.status, JSON.stringify(closing.body)).toBe(200);
    expect((await storage.getCashShifts("reception", "closed")).some(s => s.id === shift!.id)).toBe(true);
    const summary = (await testPool.query("SELECT * FROM cash_closing_summaries WHERE shift_id = $1", [shift!.id])).rows[0];
    expect(Number(summary.total_cash)).toBe(0);
    expect(Number(summary.total_transfer)).toBe(120000);
    expect(Number(summary.total_general)).toBe(120000);
  }, 30_000);
  it("concurrent confirmation and response-loss retries collect once; new operations remain valid", async () => {
    const guestId = randomUUID(), typeId = randomUUID(), roomId = randomUUID();
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    await testPool.query("INSERT INTO guests (id, first_name, last_name) VALUES ($1, 'Duplicate', 'Test')", [guestId]);
    await testPool.query("INSERT INTO room_types (id, code, name) VALUES ($1, $2, 'Duplicate test')", [typeId, `dup-${typeId}`]);
    await testPool.query("INSERT INTO rooms (id, room_number, room_type_id, status) VALUES ($1, $2, $3, 'available')", [roomId, `dup-${roomId}`, typeId]);
    expect((await api("POST", "/api/cash/init-shifts")).status).toBe(200);
    const created = await api("POST", "/api/reservations", {
      guestId, roomTypeId: typeId, roomId, checkInDate: today, checkOutDate: tomorrow,
      finalRatePerNight: "100000.00", totalRoomAmount: "100000.00", numberOfGuests: 1,
      status: "confirmed", source: "directo",
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const reservationId = created.body.id;
    expect((await api("POST", `/api/reservations/${reservationId}/check-in`, {})).status).toBe(200);
    const body = { reservationId, amount: "100000.00", method: "efectivo", date: today, paymentRequestId: randomUUID() };
    const confirmations = await Promise.all([api("POST", "/api/payments", body), api("POST", "/api/payments", body)]);
    expect(confirmations.map(r => r.status).sort()).toEqual([200, 201]);
    expect(confirmations[0].body.id).toBe(confirmations[1].body.id);
    const paymentId = confirmations[0].body.id;
    expect((await api("POST", "/api/payments", body)).body.id).toBe(paymentId);
    expect((await testPool.query("SELECT count(*) AS n, sum(amount)::text AS total FROM payments WHERE reservation_id = $1", [reservationId])).rows[0])
      .toEqual({ n: "1", total: "100000.00" });
    expect((await testPool.query("SELECT count(*) AS n FROM cash_movements WHERE payment_id = $1", [paymentId])).rows[0].n).toBe("1");
    expect((await testPool.query("SELECT count(*) AS n FROM folio_movements WHERE source_type = 'payment' AND source_id = $1", [paymentId])).rows[0].n).toBe("1");
    expect((await testPool.query("SELECT balance::text FROM folios WHERE entity_type = 'reservation' AND entity_id = $1", [reservationId])).rows[0].balance).toBe("0.00");
    expect((await api("POST", "/api/payments", { ...body, amount: "50000.00" })).status).toBe(409);
    expect((await api("POST", "/api/payments", { ...body, paymentRequestId: "invalid" })).status).toBe(400);
    // A different intentional payment is not guessed to be a duplicate by amount/date.
    const second = await api("POST", "/api/payments", { ...body, paymentRequestId: randomUUID() });
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    expect(second.body.id).not.toBe(paymentId);
    // PATCH and void cannot recycle the original operation into another collection.
    expect((await api("PATCH", `/api/payments/${paymentId}`, { paymentRequestId: randomUUID(), paymentRequestFingerprint: "forged" })).status).toBe(200);
    expect((await api("PATCH", `/api/payments/${paymentId}/anular`, { motivoAnulacion: "Synthetic correction" })).status).toBe(200);
    const replayVoided = await api("POST", "/api/payments", body);
    expect(replayVoided.status).toBe(200);
    expect(replayVoided.body.id).toBe(paymentId);
    expect(replayVoided.body.status).toBe("anulado");
    expect((await testPool.query("SELECT count(*) AS n FROM payments WHERE reservation_id = $1", [reservationId])).rows[0].n).toBe("2");
    const { storage } = await import("../db-storage");
    const { parseReservationPaymentRequest } = await import("../reservationPaymentRequest");
    const rollbackBody = { ...body, amount: "500.00", paymentRequestId: randomUUID() };
    const request = parseReservationPaymentRequest(rollbackBody, username)!;
    const input = {
      payment: { reservationId, amount: "500.00", method: "efectivo", date: today },
      paymentRequest: request, sourceLabel: "Fail at Caja insert\0",
    };
    await expect(storage.createReservationPaymentWithLedger(input)).rejects.toThrow();
    expect((await testPool.query("SELECT count(*) AS n FROM payments WHERE payment_request_id = $1", [request.id])).rows[0].n).toBe("0");
    // The failed transaction does not consume the operation ID.
    const recovered = await storage.createReservationPaymentWithLedger({ ...input, sourceLabel: "Recovered synthetic payment" });
    expect(recovered.paymentRequestId).toBe(request.id);
  }, 30_000);

  it.each(["invoice", "net", "retention", "retention-rollback", "split-cc", "single-cc"])(
    "Prefactura recovers %s with one invoice and one ledger entry per intent",
    async failure => {
      const guestId = randomUUID(), typeId = randomUUID(), roomId = randomUUID();
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      await testPool.query("INSERT INTO guests (id, first_name, last_name) VALUES ($1, 'Prefactura', 'Test')", [guestId]);
      await testPool.query("INSERT INTO room_types (id, code, name) VALUES ($1, $2, 'Prefactura test')", [typeId, `pf-${typeId}`]);
      await testPool.query("INSERT INTO rooms (id, room_number, room_type_id, status) VALUES ($1, $2, $3, 'available')", [roomId, `pf-${roomId}`, typeId]);
      expect((await api("POST", "/api/cash/init-shifts")).status).toBe(200);
      const created = await api("POST", "/api/reservations", {
        guestId, roomTypeId: typeId, roomId, checkInDate: today, checkOutDate: tomorrow,
        finalRatePerNight: "100.00", totalRoomAmount: "100.00", numberOfGuests: 1,
        status: "confirmed", source: "directo",
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const reservationId = created.body.id;
      expect((await api("POST", `/api/reservations/${reservationId}/check-in`, {})).status).toBe(200);
      const config = await api("GET", "/api/billing/config");
      expect(config.status).toBe(200);
      await testPool.query("UPDATE billing_config SET arca_ambiente = 'ficticio', modo_arca = false");
      expect((await testPool.query("SELECT arca_ambiente FROM billing_config")).rows.every(row => row.arca_ambiente === "ficticio")).toBe(true);

      const journal = new Map<string, string>();
      const browserStorage = {
        getItem: (key: string) => journal.get(key) ?? null,
        setItem: (key: string, value: string) => { journal.set(key, value); },
        removeItem: (key: string) => { journal.delete(key); },
      };
      const submission = createPrefacturaSubmission(browserStorage);
      const common = { reservationId, date: today, reference: null, receiptType: "factura_b", billingTarget: "guest", companyId: null, agencyId: null };
      const splitCc = failure === "split-cc";
      const singleCc = failure === "single-cc";
      const rows = singleCc ? [{ ...common, method: "cuenta_corriente", amount: "100.00", notes: null }] : [
        { ...common, method: "efectivo", amount: splitCc ? "50.00" : "98.00", notes: null },
        ...(splitCc ? [{ ...common, method: "cuenta_corriente", amount: "48.00", notes: null }] : []),
        { ...common, method: "retencion_iibb", amount: "2.00", notes: JSON.stringify({ retencion: { tipo: "iibb", monto: 2, neto: splitCc ? 50 : 98 } }) },
      ];
      const operationId = randomUUID();
      const attempt = submission.prepare(reservationId, {
        tipoComprobante: "FB",
        cliente: { razonSocial: "Prefactura Test", dni: "12345678", condicionIva: "Consumidor Final" },
        items: [{ descripcion: "Alojamiento", cantidad: 1, precioUnitario: 100, alicuotaIva: "21", subtotalNeto: 82.64, subtotal: 100 }],
        reservaId: reservationId, sourceChargeIds: ["accommodation"], sourceChargeAmounts: { accommodation: 100 },
        cashFormaPago: singleCc ? "cuenta_corriente" : "pago_dividido", cashFormaPagoDetalle: rows.map(row => ({ method: row.method, amount: Number(row.amount) })),
        ordinaryAdvanceApplications: [], creditReapplications: [], creditOperationId: operationId,
        ...(splitCc || singleCc ? { ccEntityType: "guest", ccEntityId: guestId } : {}),
        ...(singleCc ? { reservationSettlementMethod: "cuenta_corriente" } : {}),
      }, singleCc ? [] : rows);
      const statusPath = `/api/billing/reservations/${reservationId}/operations/${operationId}/status`;
      expect((await api("GET", statusPath)).body).toEqual({ exists: false });
      const retentionKey = attempt.payments.at(-1)?.paymentRequestId;
      if (failure === "retention-rollback") {
        // Trigger is installed only in the explicitly isolated disposable DB.
        await testPool.query(`
          CREATE FUNCTION prefactura_fail_retention() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            IF NEW.payment_request_id = '${retentionKey}' THEN RAISE EXCEPTION 'Synthetic retention failure'; END IF;
            RETURN NEW;
          END $$;
          CREATE TRIGGER prefactura_fail_retention BEFORE INSERT ON payments
            FOR EACH ROW EXECUTE FUNCTION prefactura_fail_retention();
        `);
      }
      let lose = true;
      const post = async (url: string, body: Record<string, any>) => {
        const result = await api("POST", url, body);
        if (result.status >= 400) throw new Error(JSON.stringify(result.body));
        const stage = url.endsWith("invoices") ? "invoice" : body.method === "retencion_iibb" ? "retention" : "net";
        if (lose && stage === (singleCc ? "invoice" : splitCc ? "retention" : failure)) {
          lose = false;
          throw new Error("Synthetic response loss after commit");
        }
        return result.body;
      };
      try {
        await expect(submission.run(reservationId, post)).rejects.toThrow();
      } finally {
        if (failure === "retention-rollback") {
          await testPool.query("DROP TRIGGER prefactura_fail_retention ON payments; DROP FUNCTION prefactura_fail_retention()");
        }
      }
      const reopened = createPrefacturaSubmission(browserStorage);
      const completed = await reopened.run(reservationId, post);
      expect(completed.paymentCount).toBe(singleCc ? 0 : rows.length);
      const invoiceId = completed.invoice!.id;
      expect((await api("GET", statusPath)).body).toEqual({ exists: true });
      expect((await testPool.query("SELECT count(*) AS n FROM sales_invoices WHERE reserva_id = $1", [reservationId])).rows[0].n).toBe("1");
      const payments = (await testPool.query("SELECT id, amount, invoice_ref, payment_request_id FROM payments WHERE reservation_id = $1 ORDER BY amount", [reservationId])).rows;
      expect(payments).toHaveLength(rows.length);
      if (!singleCc) expect(new Set(payments.map(row => row.payment_request_id)).size).toBe(rows.length);
      for (const payment of payments) {
        expect(JSON.parse(payment.invoice_ref).id).toBe(invoiceId);
        expect((await testPool.query("SELECT count(*) AS n FROM cash_movements WHERE payment_id = $1", [payment.id])).rows[0].n).toBe("1");
        expect((await testPool.query("SELECT count(*) AS n FROM folio_movements WHERE source_type = 'payment' AND source_id = $1", [payment.id])).rows[0].n).toBe("1");
      }
      expect((await testPool.query("SELECT total_payments::text, balance::text FROM folios WHERE entity_type = 'reservation' AND entity_id = $1", [reservationId])).rows[0])
        .toEqual({ total_payments: "100.00", balance: "0.00" });
      const cash = (await testPool.query("SELECT movement_type, sum(amount)::text AS total FROM cash_movements WHERE payment_id = ANY($1) GROUP BY movement_type ORDER BY movement_type", [payments.map(p => p.id)])).rows;
      expect(cash).toEqual(singleCc ? [{ movement_type: "informational", total: "100.00" }] : [
        { movement_type: "income", total: splitCc ? "50.00" : "98.00" },
        { movement_type: "informational", total: splitCc ? "50.00" : "2.00" },
      ]);
      if (splitCc || singleCc) {
        expect((await testPool.query("SELECT count(*) AS n, sum(amount)::text AS total FROM account_movements WHERE entity_type = 'guest' AND entity_id = $1 AND type = 'cargo'", [guestId])).rows[0])
          .toEqual({ n: "1", total: singleCc ? "100.00" : "48.00" });
      }
      // A changed fiscal reference cannot reuse this payment operation.
      const stored = reopened.pending(reservationId)!;
      if (!singleCc) expect((await api("POST", "/api/payments", { ...stored.payments[0], invoiceData: { id: Number(invoiceId) + 1 } })).status).toBe(409);
      reopened.complete(reservationId);
    }, 30_000,
  );
});
