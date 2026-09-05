import { randomUUID } from "node:crypto";
import pg from "pg";
import express from "express";
import * as http from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const originalFetch = global.fetch;

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

vi.mock("../billing/wsaaClient", () => ({
  getTokenAuth: mocks.getTokenAuth,
}));

vi.mock("../billing/wsfevClient", () => ({
  feCAESolicitar: mocks.feCAESolicitar,
  feCompConsultar: mocks.feCompConsultar,
}));
const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 1_000,
    })
  : null;

const { emitirFactura } = await import("../billing/invoiceService");

let baseUrl = "";
let httpServer: http.Server | null = null;
let currentTestRole = "admin";

async function startRecoveryRoutes() {
  const [{ registerReservationsRoutes }, { registerGroupsRoutes }, { registerSpaRoutes }] = await Promise.all([
    import("../routes/reservations"),
    import("../routes/groups"),
    import("../routes/spa"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: "invoice-recovery-pg",
      username: "invoice-recovery-pg",
      fullName: "Invoice Recovery PG",
      role: currentTestRole,
    } as any;
    req.isAuthenticated = () => true;
    next();
  });
  registerReservationsRoutes(app);
  registerGroupsRoutes(app);
  registerSpaRoutes(app);
  httpServer = await new Promise<http.Server>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
  const address = httpServer.address();
  if (!address || typeof address === "string") throw new Error("No se pudo iniciar el servidor de prueba");
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function stopRecoveryRoutes() {
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

const item = [{ descripcion: "Servicio de prueba", cantidad: 1, precioUnitario: 100, alicuotaIva: "no_gravado", subtotalNeto: 0, subtotal: 100 }];

async function insertDraft(data: {
  puntoVenta: number;
  estado?: string;
  reservationId?: string;
  paymentId?: string;
  groupId?: string;
  groupPaymentId?: string;
  groupPaymentIntent?: unknown;
  spaAccountId?: string;
  cashFormaPago?: string;
  sourceChargeAmounts?: unknown;
}) {
  if (!pool) throw new Error("DATABASE_URL no está configurado");
  const result = await pool.query<{ id: number }>(
    `INSERT INTO sales_invoices
       (tipo_comprobante, punto_venta, numero, fecha_emision, cliente_razon_social,
        cliente_condicion_iva, monto_neto, monto_total, estado, reconciliation_status,
        reserva_id, payment_id, group_id, group_payment_id, group_payment_intent,
        spa_account_id, cash_forma_pago, source_charge_amounts, items, created_at)
     VALUES
       ('FB', $1, $2, CURRENT_DATE, 'Consumidor Final', 'Consumidor Final',
        '0.00', '100.00', $3, 'pendiente', $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, NOW())
     RETURNING id`,
    [
      data.puntoVenta, 100000 + (data.puntoVenta % 100000), data.estado || "autorizacion_pendiente",
      data.reservationId || null, data.paymentId || null, data.groupId || null, data.groupPaymentId || null,
      data.groupPaymentIntent ? JSON.stringify(data.groupPaymentIntent) : null, data.spaAccountId || null,
      data.cashFormaPago || null, data.sourceChargeAmounts ? JSON.stringify(data.sourceChargeAmounts) : null,
      JSON.stringify(item),
    ],
  );
  return result.rows[0].id;
}

function configureRecoveredArca() {
  mocks.getTokenAuth.mockReset();
  mocks.feCAESolicitar.mockReset();
  mocks.feCompConsultar.mockReset();
  mocks.getTokenAuth.mockResolvedValue({ token: "test-token", sign: "test-sign" });
  mocks.feCompConsultar.mockResolvedValue({ cae: "71234567890123", caeFechaVto: new Date("2026-09-10T12:00:00Z") });
}

function holdFirstArcaConsultation() {
  let reachedResolve!: () => void;
  let releaseResolve!: () => void;
  const reached = new Promise<void>((resolve) => { reachedResolve = resolve; });
  const release = new Promise<void>((resolve) => { releaseResolve = resolve; });
  mocks.feCompConsultar.mockImplementationOnce(async () => {
    reachedResolve();
    await release;
    return { cae: "71234567890123", caeFechaVto: new Date("2026-09-10T12:00:00Z") };
  });
  return {
    waitUntilHeld: () => new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        releaseResolve();
        reject(new Error("La primera consulta ARCA no alcanzó la barrera"));
      }, 5_000);
      reached.then(() => {
        clearTimeout(timeout);
        resolve();
      });
    }),
    release: () => releaseResolve(),
  };
}

async function waitForAdvisoryLockWaiters(expected: number) {
  if (!pool) throw new Error("DATABASE_URL no está configurado");
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM pg_locks WHERE locktype = 'advisory' AND NOT granted",
    );
    if (Number(result.rows[0]?.count || 0) >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`No se observaron ${expected} solicitudes esperando el bloqueo fiscal SPA`);
}

function expectRecoveredInvoice(body: any, invoiceId: number) {
  expect(body.invoice).toMatchObject({ id: invoiceId, estado: "emitida", cae: "71234567890123" });
}

runIfDatabaseIsConfigured("PostgreSQL real: recuperación de notas de crédito ARCA", () => {
  beforeEach(() => {
    currentTestRole = "admin";
    mocks.getTokenAuth.mockReset();
    mocks.feCAESolicitar.mockReset();
    mocks.feCompConsultar.mockReset();
    mocks.getTokenAuth.mockResolvedValue({ token: "test-token", sign: "test-sign" });
  });

  it("conserva el borrador fallido y lo encuentra en el reintento", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");

    const suffix = randomUUID();
    const puntoVenta = 9000 + (parseInt(suffix.slice(0, 6), 16) % 1000);
    const originalInvoiceId = 700000 + (parseInt(suffix.slice(6, 12), 16) % 100000);
    const firstError = `ARCA no responde — prueba ${suffix}`;
    const retryError = `ARCA sigue sin responder — prueba ${suffix}`;
    const sourceChargeId = `charge-${suffix}`;

    const input = {
      tipoComprobante: "NCB" as const,
      cliente: { razonSocial: "Consumidor Final", condicionIva: "Consumidor Final" },
      items: [{
        descripcion: "Alojamiento",
        cantidad: 1,
        precioUnitario: 100,
        alicuotaIva: "no_gravado" as const,
        subtotalNeto: 0,
        subtotal: 100,
      }],
      reservaId: `reservation-${suffix}`,
      facturaOriginalId: originalInvoiceId,
      sourceChargeIds: [sourceChargeId],
      sourceChargeAmounts: { [sourceChargeId]: 100 },
      puntoVentaOverride: puntoVenta,
      recoverableCreditNote: true,
    };

    global.fetch = vi.fn(async () => new Response(
      "<soap:Envelope><CbteNro>6</CbteNro></soap:Envelope>",
      { status: 200 },
    )) as any;
    mocks.feCAESolicitar.mockRejectedValueOnce(new Error(firstError));

    let draftId: number | null = null;
    try {
      await expect(emitirFactura(input)).rejects.toThrow(firstError);

      const afterAuthorizationFailure = await pool.query(
        `SELECT id, estado, reconciliation_status, reconciliation_error,
                nota_credito_id, punto_venta, source_charge_ids, source_charge_amounts
         FROM sales_invoices
         WHERE reserva_id = $1 AND tipo_comprobante = $2 AND punto_venta = $3`,
        [input.reservaId, input.tipoComprobante, puntoVenta],
      );

      expect(afterAuthorizationFailure.rows).toHaveLength(1);
      const draft = afterAuthorizationFailure.rows[0];
      draftId = Number(draft.id);
      expect(draft).toMatchObject({
        estado: "autorizacion_pendiente",
        reconciliation_status: "pendiente",
        reconciliation_error: firstError,
        nota_credito_id: originalInvoiceId,
        punto_venta: puntoVenta,
      });
      expect(draft.source_charge_ids).toEqual([sourceChargeId]);
      expect(draft.source_charge_amounts).toEqual({ [sourceChargeId]: 100 });

      mocks.feCompConsultar.mockRejectedValueOnce(new Error(retryError));
      await expect(emitirFactura({
        ...input,
        recoverableCreditNote: false,
        recoveryInvoiceId: draftId,
      })).rejects.toThrow(retryError);

      expect(mocks.feCompConsultar).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: "NCB",
          puntoVenta,
          numero: 7,
        }),
        "homologacion",
      );

      const afterRetryFailure = await pool.query(
        `SELECT id, estado, reconciliation_status, reconciliation_error
         FROM sales_invoices
         WHERE id = $1`,
        [draftId],
      );
      expect(afterRetryFailure.rows).toEqual([{
        id: draftId,
        estado: "autorizacion_pendiente",
        reconciliation_status: "pendiente",
        reconciliation_error: retryError,
      }]);

      mocks.feCompConsultar.mockResolvedValueOnce({
        cae: "71234567890123",
        caeFechaVto: new Date("2026-09-10T12:00:00Z"),
      });
      const recovered = await emitirFactura({
        ...input,
        recoverableCreditNote: false,
        recoveryInvoiceId: draftId,
      });
      expect(recovered).toMatchObject({
        id: draftId,
        estado: "emitida",
        reconciliationStatus: "pendiente",
        reconciliationError: null,
      });

      const afterRetrySuccess = await pool.query(
        `SELECT id, estado, reconciliation_status, reconciliation_error, cae
         FROM sales_invoices
         WHERE id = $1`,
        [draftId],
      );
      expect(afterRetrySuccess.rows).toEqual([{
        id: draftId,
        estado: "emitida",
        reconciliation_status: "pendiente",
        reconciliation_error: null,
        cae: "71234567890123",
      }]);

      const sameDraftCount = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM sales_invoices
         WHERE reserva_id = $1 AND tipo_comprobante = $2 AND punto_venta = $3`,
        [input.reservaId, input.tipoComprobante, puntoVenta],
      );
      expect(sameDraftCount.rows[0].count).toBe(1);
    } finally {
      if (draftId !== null) {
        await pool.query("DELETE FROM sales_invoices WHERE id = $1", [draftId]);
      }
      await pool.query(
        "DELETE FROM invoice_counters WHERE tipo_comprobante = $1 AND punto_venta = $2",
        [input.tipoComprobante, puntoVenta],
      );
      global.fetch = originalFetch;
    }
  });
});

runIfDatabaseIsConfigured("PostgreSQL real: rutas de recuperación de facturas concurrentes", () => {
  beforeAll(async () => {
    if (pool) await startRecoveryRoutes();
  });

  beforeEach(() => configureRecoveredArca());

  it("serializa dos reanudaciones individuales y vincula una sola vez", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const reservationId = `recovery-reservation-${suffix}`;
    const paymentId = `recovery-payment-${suffix}`;
    const puntoVenta = 8100 + (parseInt(suffix.slice(0, 4), 16) % 800);
    let invoiceId: number | null = null;
    try {
      await pool.query(`INSERT INTO reservations
        (id, reservation_code, guest_id, room_type_id, room_id, check_in_date, check_out_date, total_room_amount, status, created_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, CURRENT_DATE + 1, '100.00', 'confirmed', NOW())`,
      [reservationId, `REC-${suffix}`, `guest-${suffix}`, `type-${suffix}`, `room-${suffix}`]);
      await pool.query(`INSERT INTO payments (id, reservation_id, amount, method, date, status)
        VALUES ($1, $2, '100.00', 'efectivo', CURRENT_DATE, 'active')`, [paymentId, reservationId]);
      invoiceId = await insertDraft({ puntoVenta, reservationId, paymentId, cashFormaPago: "efectivo" });
      const gate = holdFirstArcaConsultation();
      const first = request("POST", `/api/payments/${paymentId}/resume-invoice`);
      await gate.waitUntilHeld();
      const second = request("POST", `/api/payments/${paymentId}/resume-invoice`);
      gate.release();
      const results = await Promise.all([first, second]);
      expect(results.map((result) => result.status)).toEqual([200, 200]);
      expect(mocks.feCompConsultar).toHaveBeenCalledTimes(1);
      results.forEach((result) => expectRecoveredInvoice(result.body, invoiceId!));
      const state = await pool.query(`SELECT si.estado, p.invoice_ref
        FROM sales_invoices si JOIN payments p ON p.id = si.payment_id WHERE si.id = $1`, [invoiceId]);
      expect(state.rows).toHaveLength(1);
      expect(state.rows[0]).toMatchObject({ estado: "emitida" });
      expect(state.rows[0].invoice_ref).toContain("71234567890123");
      expect((await pool.query("SELECT id FROM sales_invoices WHERE payment_id = $1", [paymentId])).rows).toHaveLength(1);
    } finally {
      if (invoiceId) await pool.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
      await pool.query("DELETE FROM payments WHERE id = $1", [paymentId]);
      await pool.query("DELETE FROM reservations WHERE id = $1", [reservationId]);
    }
  }, 15_000);

  it("recupera una factura directa grupal y hace idempotente su vínculo concurrente", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const groupId = `recovery-direct-group-${suffix}`;
    const puntoVenta = 8900 + (parseInt(suffix.slice(0, 4), 16) % 500);
    let invoiceId: number | null = null;
    try {
      await pool.query(`INSERT INTO groups (id, group_code, name, check_in_date, check_out_date, status, created_at)
        VALUES ($1, $2, 'Grupo recovery directo', CURRENT_DATE, CURRENT_DATE + 1, 'confirmed', NOW())`,
      [groupId, `RD-${suffix}`]);
      invoiceId = await insertDraft({ puntoVenta, groupId, sourceChargeAmounts: { [`charge-${suffix}`]: 100 } });
      const gate = holdFirstArcaConsultation();
      const first = request("POST", `/api/groups/${groupId}/invoices/${invoiceId}/resume-authorization`);
      await gate.waitUntilHeld();
      const second = request("POST", `/api/groups/${groupId}/invoices/${invoiceId}/resume-authorization`);
      gate.release();
      const resumed = await Promise.all([first, second]);
      expect(resumed.map((result) => result.status)).toEqual([200, 200]);
      expect(mocks.feCompConsultar).toHaveBeenCalledTimes(1);
      resumed.forEach((result) => expectRecoveredInvoice(result.body, invoiceId!));
      expect((await pool.query("SELECT id FROM sales_invoices WHERE group_id = $1", [groupId])).rows).toHaveLength(1);
      const invoiceData = { id: invoiceId, tipoComprobante: "FB", puntoVenta, numero: 100000 + (puntoVenta % 100000) };
      const linked = await Promise.all([
        request("POST", `/api/groups/${groupId}/direct-invoice`, { invoiceData }),
        request("POST", `/api/groups/${groupId}/direct-invoice`, { invoiceData }),
      ]);
      expect(linked.map((result) => result.status)).toEqual([200, 200]);
      expect((await pool.query("SELECT id FROM group_invoices WHERE sales_invoice_id = $1", [invoiceId])).rows).toHaveLength(1);
    } finally {
      if (invoiceId) {
        await pool.query("DELETE FROM group_invoices WHERE sales_invoice_id = $1", [invoiceId]);
        await pool.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
      }
      await pool.query("DELETE FROM groups WHERE id = $1", [groupId]);
    }
  }, 15_000);

  it("recupera y vincula un cobro grupal sin duplicar sus efectos financieros", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const groupId = `recovery-payment-group-${suffix}`;
    const reservationId = `recovery-payment-reservation-${suffix}`;
    const groupPaymentId = `recovery-group-payment-${suffix}`;
    const allocationId = `recovery-allocation-${suffix}`;
    const cashId = `recovery-cash-${suffix}`;
    const puntoVenta = 9400 + (parseInt(suffix.slice(0, 4), 16) % 400);
    let invoiceId: number | null = null;
    try {
      await pool.query(`INSERT INTO groups (id, group_code, name, check_in_date, check_out_date, status, created_at)
        VALUES ($1, $2, 'Grupo recovery pago', CURRENT_DATE, CURRENT_DATE + 1, 'confirmed', NOW())`, [groupId, `RP-${suffix}`]);
      await pool.query(`INSERT INTO reservations (id, reservation_code, guest_id, room_type_id, room_id, check_in_date, check_out_date, total_room_amount, status, created_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, CURRENT_DATE + 1, '100.00', 'confirmed', NOW())`,
      [reservationId, `RPR-${suffix}`, `guest-${suffix}`, `type-${suffix}`, `room-${suffix}`]);
      await pool.query("INSERT INTO group_reservation_links (id, group_id, reservation_id) VALUES ($1, $2, $3)", [`link-${suffix}`, groupId, reservationId]);
      await pool.query(`INSERT INTO group_payments (id, group_id, amount, method, date, receiver_details, destination)
        VALUES ($1, $2, '100.00', 'efectivo', CURRENT_DATE, $3::jsonb, 'group_distribution')`,
      [groupPaymentId, groupId, JSON.stringify({ razonSocial: "Consumidor Final" })]);
      await pool.query(`INSERT INTO payments (id, reservation_id, amount, method, date, status, group_payment_id)
        VALUES ($1, $2, '100.00', 'efectivo', CURRENT_DATE, 'active', $3)`, [allocationId, reservationId, groupPaymentId]);
      await pool.query(`INSERT INTO cash_movements (id, area, source_type, source_id, payment_method, amount, movement_type, payment_id)
        VALUES ($1, 'reception', 'group_payment', $2, 'efectivo', '100.00', 'income', $3)`, [cashId, groupId, groupPaymentId]);
      invoiceId = await insertDraft({ puntoVenta, groupId, groupPaymentId, groupPaymentIntent: { amount: 100 }, cashFormaPago: "efectivo" });
      const gate = holdFirstArcaConsultation();
      const first = request("POST", `/api/groups/${groupId}/invoices/${invoiceId}/resume-authorization`);
      await gate.waitUntilHeld();
      const second = request("POST", `/api/groups/${groupId}/invoices/${invoiceId}/resume-authorization`);
      gate.release();
      const resumed = await Promise.all([first, second]);
      expect(resumed.map((result) => result.status)).toEqual([200, 200]);
      expect(mocks.feCompConsultar).toHaveBeenCalledTimes(1);
      resumed.forEach((result) => expectRecoveredInvoice(result.body, invoiceId!));
      expect((await pool.query("SELECT id FROM sales_invoices WHERE group_payment_id = $1", [groupPaymentId])).rows).toHaveLength(1);
      const linked = await Promise.all([
        request("PATCH", `/api/groups/${groupId}/payments/${groupPaymentId}/invoice`, { invoiceData: { id: invoiceId } }),
        request("PATCH", `/api/groups/${groupId}/payments/${groupPaymentId}/invoice`, { invoiceData: { id: invoiceId } }),
      ]);
      expect(linked.map((result) => result.status)).toEqual([200, 200]);
      const groupPayment = await pool.query(`SELECT id, invoice_id, invoice_ref FROM group_payments WHERE id = $1`, [groupPaymentId]);
      expect(groupPayment.rows).toHaveLength(1);
      expect(groupPayment.rows[0]).toMatchObject({ id: groupPaymentId, invoice_id: invoiceId });
      expect(JSON.parse(groupPayment.rows[0].invoice_ref)).toEqual({
        id: invoiceId,
        tipoComprobante: "FB",
        puntoVenta,
        numero: 100000 + (puntoVenta % 100000),
        cae: "71234567890123",
        caeFechaVto: "2026-09-10",
        montoTotal: "100.00",
        estado: "emitida",
      });
      expect((await pool.query(`SELECT reconciliation_status, reconciliation_error FROM sales_invoices WHERE id = $1`, [invoiceId])).rows)
        .toEqual([{ reconciliation_status: "conciliada", reconciliation_error: null }]);
      expect((await pool.query("SELECT id FROM payments WHERE group_payment_id = $1", [groupPaymentId])).rows).toHaveLength(1);
      expect((await pool.query("SELECT id FROM cash_movements WHERE payment_id = $1", [groupPaymentId])).rows).toHaveLength(1);
    } finally {
      if (invoiceId) await pool.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
      await pool.query("DELETE FROM cash_movements WHERE id = $1", [cashId]);
      await pool.query("DELETE FROM payments WHERE id = $1", [allocationId]);
      await pool.query("DELETE FROM group_reservation_links WHERE group_id = $1", [groupId]);
      await pool.query("DELETE FROM group_payments WHERE id = $1", [groupPaymentId]);
      await pool.query("DELETE FROM reservations WHERE id = $1", [reservationId]);
      await pool.query("DELETE FROM groups WHERE id = $1", [groupId]);
    }
  }, 15_000);

  it("recupera y vincula SPA una sola vez, incluidos Caja y movimientos de folio", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const accountId = `recovery-spa-account-${suffix}`;
    const itemId = `recovery-spa-item-${suffix}`;
    const puntoVenta = 9800 + (parseInt(suffix.slice(0, 4), 16) % 150);
    let invoiceId: number | null = null;
    let createdShiftId: string | null = null;
    const suspendedSpaShifts: Array<{
      id: string;
      status: string;
      closed_at: Date | null;
      closed_by: string | null;
    }> = [];
    try {
      // This case specifically proves the no-turno path. Development DBs can
      // legitimately have an open SPA shift, so suspend those rows only for
      // this fixture and restore their complete operational state in finally.
      const activeShifts = await pool.query<{
        id: string;
        status: string;
        closed_at: Date | null;
        closed_by: string | null;
      }>("SELECT id, status, closed_at, closed_by FROM cash_shifts WHERE area = 'spa' AND status = 'open'");
      suspendedSpaShifts.push(...activeShifts.rows);
      for (const shift of suspendedSpaShifts) {
        await pool.query("UPDATE cash_shifts SET status = 'closed' WHERE id = $1", [shift.id]);
      }
      expect((await pool.query("SELECT id FROM cash_shifts WHERE area = 'spa' AND status = 'open'")).rows).toEqual([]);
      await pool.query(`INSERT INTO spa_accounts (id, appointment_id, guest_name, status, opened_at)
        VALUES ($1, $2, 'Huésped recovery SPA', 'open', NOW())`, [accountId, `appointment-${suffix}`]);
      await pool.query(`INSERT INTO spa_account_items (id, account_id, description, quantity, unit_price, subtotal, item_type, created_at)
        VALUES ($1, $2, 'Tratamiento recovery', 1, '100.00', '100.00', 'treatment', NOW())`, [itemId, accountId]);
      invoiceId = await insertDraft({ puntoVenta, spaAccountId: accountId, cashFormaPago: "efectivo" });
      const gate = holdFirstArcaConsultation();
      const first = request("POST", `/api/spa/accounts/${accountId}/resume-invoice`, { confirmation: `AUTORIZAR ${invoiceId}` });
      await gate.waitUntilHeld();
      const second = request("POST", `/api/spa/accounts/${accountId}/resume-invoice`, { confirmation: `AUTORIZAR ${invoiceId}` });
      gate.release();
      const resumed = await Promise.all([first, second]);
      expect(resumed.map((result) => result.status)).toEqual([200, 200]);
      expect(mocks.feCompConsultar).toHaveBeenCalledTimes(1);
      resumed.forEach((result) => expectRecoveredInvoice(result.body, invoiceId!));
      expect((await pool.query("SELECT id FROM sales_invoices WHERE spa_account_id = $1", [accountId])).rows).toHaveLength(1);
      const linked = await Promise.all([
        request("POST", `/api/spa/accounts/${accountId}/link-invoice`, { invoiceId }),
        request("POST", `/api/spa/accounts/${accountId}/link-invoice`, { invoiceId }),
      ]);
      expect(linked.map((result) => result.status)).toEqual([200, 200]);
      expect((await pool.query("SELECT id FROM spa_payments WHERE account_id = $1 AND status = 'active'", [accountId])).rows).toHaveLength(1);
      const movements = await pool.query<{ id: string; shift_id: string }>("SELECT id, shift_id FROM cash_movements WHERE area = 'spa' AND source_type = 'comprobante' AND source_id = $1", [String(invoiceId)]);
      expect(movements.rows).toHaveLength(1);
      createdShiftId = movements.rows[0].shift_id;
      expect((await pool.query("SELECT id FROM cash_shifts WHERE id = $1 AND area = 'spa' AND status = 'open'", [createdShiftId])).rows).toHaveLength(1);
      expect((await pool.query(`SELECT fm.id FROM folio_movements fm JOIN folios f ON f.id = fm.folio_id
        WHERE f.entity_type = 'spa_account' AND f.entity_id = $1 AND fm.type = 'payment'`, [accountId])).rows).toHaveLength(1);
      expect((await pool.query("SELECT status, invoice_id FROM spa_accounts WHERE id = $1", [accountId])).rows)
        .toEqual([{ status: "closed", invoice_id: invoiceId }]);
    } finally {
      try {
        await pool.query(`DELETE FROM folio_movements WHERE folio_id IN
          (SELECT id FROM folios WHERE entity_type = 'spa_account' AND entity_id = $1)`, [accountId]);
        await pool.query("DELETE FROM folios WHERE entity_type = 'spa_account' AND entity_id = $1", [accountId]);
        if (invoiceId) {
          await pool.query("DELETE FROM cash_movements WHERE source_type = 'comprobante' AND source_id = $1", [String(invoiceId)]);
          await pool.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
        }
        await pool.query("DELETE FROM spa_payments WHERE account_id = $1", [accountId]);
        await pool.query("DELETE FROM spa_account_items WHERE account_id = $1", [accountId]);
        await pool.query("DELETE FROM spa_accounts WHERE id = $1", [accountId]);
        if (createdShiftId) await pool.query("DELETE FROM cash_shifts WHERE id = $1", [createdShiftId]);
      } finally {
        for (const shift of suspendedSpaShifts) {
          await pool.query(
            "UPDATE cash_shifts SET status = $2, closed_at = $3, closed_by = $4 WHERE id = $1",
            [shift.id, shift.status, shift.closed_at, shift.closed_by],
          );
        }
      }
    }
  }, 15_000);

  it("bloquea todos los borradores sin consultar ARCA cuando un folio SPA heredado tiene varios pendientes", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const accountId = `recovery-duplicate-spa-${suffix}`;
    const itemId = `recovery-duplicate-spa-item-${suffix}`;
    const puntoVenta = 9900 + (parseInt(suffix.slice(0, 4), 16) % 30);
    const invoiceIds: number[] = [];
    let spaAccountUniqueIndexDropped = false;
    try {
      // Simulate a database from before the SPA ownership index existed. The
      // production index prevents new duplicates; recovery still has to make
      // pre-existing inconsistent rows safe before any ARCA consultation.
      await pool.query("DROP INDEX sales_invoices_spa_account_id_unique");
      spaAccountUniqueIndexDropped = true;
      await pool.query(`INSERT INTO spa_accounts (id, appointment_id, guest_name, status, opened_at)
        VALUES ($1, $2, 'SPA borradores duplicados', 'open', NOW())`, [accountId, `appointment-${suffix}`]);
      await pool.query(`INSERT INTO spa_account_items (id, account_id, description, quantity, unit_price, subtotal, item_type, created_at)
        VALUES ($1, $2, 'Tratamiento recovery', 1, '100.00', '100.00', 'treatment', NOW())`, [itemId, accountId]);
      invoiceIds.push(await insertDraft({ puntoVenta, spaAccountId: accountId, cashFormaPago: "efectivo" }));
      await pool.query("SELECT pg_sleep(0.01)");
      invoiceIds.push(await insertDraft({ puntoVenta: puntoVenta + 1, spaAccountId: accountId, cashFormaPago: "efectivo" }));

      const response = await request("POST", `/api/spa/accounts/${accountId}/resume-invoice`);
      expect(response.status).toBe(409);
      expect(response.body.error).toContain("múltiples autorizaciones ARCA pendientes");
      expect(mocks.getTokenAuth).not.toHaveBeenCalled();
      expect(mocks.feCompConsultar).not.toHaveBeenCalled();
      expect(mocks.feCAESolicitar).not.toHaveBeenCalled();

      const drafts = await pool.query<{
        id: number;
        estado: string;
        reconciliation_status: string;
        reconciliation_error: string | null;
      }>(`SELECT id, estado, reconciliation_status, reconciliation_error
          FROM sales_invoices WHERE id = ANY($1::int[]) ORDER BY id`, [invoiceIds]);
      expect(drafts.rows).toEqual([
        expect.objectContaining({
          id: invoiceIds[0],
          estado: "autorizacion_pendiente",
          reconciliation_status: "requiere_revision",
          reconciliation_error: expect.stringContaining("todos fueron bloqueados"),
        }),
        expect.objectContaining({
          id: invoiceIds[1],
          estado: "autorizacion_pendiente",
          reconciliation_status: "requiere_revision",
          reconciliation_error: expect.stringContaining("todos fueron bloqueados"),
        }),
      ]);

      const reviewQueue = await request("GET", "/api/admin/spa/fiscal-drafts");
      expect(reviewQueue.status).toBe(200);
      expect(reviewQueue.body).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: invoiceIds[0],
          spa_account_id: accountId,
          reconciliation_error: expect.stringContaining("todos fueron bloqueados"),
        }),
        expect.objectContaining({
          id: invoiceIds[1],
          spa_account_id: accountId,
          spa_account_total: "100.00",
        }),
      ]));

      currentTestRole = "spa";
      const forbidden = await request("POST", `/api/admin/spa/fiscal-drafts/${invoiceIds[0]}/resolve`, {
        action: "discard",
        reason: "Intento desde un rol operativo sin autorización",
        confirmation: `DESCARTAR ${invoiceIds[0]}`,
      });
      expect(forbidden.status).toBe(403);
      currentTestRole = "admin";

      const keptId = invoiceIds[1];
      const resolution = await request("POST", `/api/admin/spa/fiscal-drafts/${keptId}/resolve`, {
        action: "keep",
        reason: "Se verificó el número fiscal reservado correcto",
        confirmation: `CONSERVAR ${keptId}`,
      });
      expect(resolution.status).toBe(200);
      expect(resolution.body).toMatchObject({ action: "keep", invoiceId: keptId, arcaContacted: false });
      expect(mocks.getTokenAuth).not.toHaveBeenCalled();
      expect(mocks.feCompConsultar).not.toHaveBeenCalled();
      expect(mocks.feCAESolicitar).not.toHaveBeenCalled();
      const auditResult = await pool.query<{ action: string; module: string; details: string }>(
        `SELECT action, module, details FROM audit_logs
         WHERE entity_type = 'sales_invoice' AND entity_id = $1
         ORDER BY timestamp DESC LIMIT 1`,
        [String(keptId)],
      );
      expect(auditResult.rows[0]).toMatchObject({ action: "update", module: "spa-fiscal-review" });
      expect(JSON.parse(auditResult.rows[0].details)).toMatchObject({ arcaContacted: false, action: "keep" });

      const resolvedDrafts = await pool.query<{
        id: number;
        estado: string;
        reconciliation_status: string;
      }>(`SELECT id, estado, reconciliation_status
          FROM sales_invoices WHERE id = ANY($1::int[]) ORDER BY id`, [invoiceIds]);
      expect(resolvedDrafts.rows).toEqual([
        { id: invoiceIds[0], estado: "descartada", reconciliation_status: "descartada" },
        { id: invoiceIds[1], estado: "autorizacion_pendiente", reconciliation_status: "pendiente" },
      ]);

      const unconfirmedResume = await request("POST", `/api/spa/accounts/${accountId}/resume-invoice`, {});
      expect(unconfirmedResume.status).toBe(400);
      expect(unconfirmedResume.body.error).toContain(`AUTORIZAR ${keptId}`);
      expect(mocks.getTokenAuth).not.toHaveBeenCalled();
      expect(mocks.feCompConsultar).not.toHaveBeenCalled();
      expect(mocks.feCAESolicitar).not.toHaveBeenCalled();
    } finally {
      await pool.query(
        "DELETE FROM audit_logs WHERE entity_type = 'sales_invoice' AND entity_id = ANY($1::text[])",
        [invoiceIds.map(String)],
      );
      await pool.query("DELETE FROM sales_invoices WHERE id = ANY($1::int[])", [invoiceIds]);
      await pool.query("DELETE FROM spa_account_items WHERE account_id = $1", [accountId]);
      await pool.query("DELETE FROM spa_accounts WHERE id = $1", [accountId]);
      if (spaAccountUniqueIndexDropped) {
        await pool.query(`CREATE UNIQUE INDEX sales_invoices_spa_account_id_unique
          ON sales_invoices (spa_account_id) WHERE spa_account_id IS NOT NULL`);
      }
    }
  }, 15_000);

  it("serializa el descarte administrativo contra la reanudación fiscal del mismo folio SPA", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const accountId = `recovery-review-race-${suffix}`;
    const itemId = `recovery-review-race-item-${suffix}`;
    const puntoVenta = 9930 + (parseInt(suffix.slice(0, 4), 16) % 20);
    let invoiceId: number | null = null;
    const lockClient = await pool.connect();
    try {
      await pool.query(`INSERT INTO spa_accounts (id, appointment_id, guest_name, status, opened_at)
        VALUES ($1, $2, 'SPA carrera revisión fiscal', 'open', NOW())`, [accountId, `appointment-${suffix}`]);
      await pool.query(`INSERT INTO spa_account_items (id, account_id, description, quantity, unit_price, subtotal, item_type, created_at)
        VALUES ($1, $2, 'Tratamiento recovery', 1, '100.00', '100.00', 'treatment', NOW())`, [itemId, accountId]);
      invoiceId = await insertDraft({ puntoVenta, spaAccountId: accountId, cashFormaPago: "efectivo" });

      await lockClient.query("SELECT pg_advisory_lock(hashtext($1))", [`spa-invoice:${accountId}`]);
      const resume = request("POST", `/api/spa/accounts/${accountId}/resume-invoice`, {
        confirmation: `AUTORIZAR ${invoiceId}`,
      });
      await waitForAdvisoryLockWaiters(1);

      await pool.query(
        `UPDATE sales_invoices
         SET reconciliation_status = 'requiere_revision',
             reconciliation_error = 'Borrador derivado a revisión administrativa',
             reconciliation_updated_at = NOW()
         WHERE id = $1`,
        [invoiceId],
      );
      const discard = request("POST", `/api/admin/spa/fiscal-drafts/${invoiceId}/resolve`, {
        action: "discard",
        reason: "Se confirmó que el borrador debe descartarse",
        confirmation: `DESCARTAR ${invoiceId}`,
      });
      await waitForAdvisoryLockWaiters(2);

      await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [`spa-invoice:${accountId}`]);
      const [resumeResult, discardResult] = await Promise.all([resume, discard]);

      expect(resumeResult.status).toBe(404);
      expect(resumeResult.body.error).toContain("No hay una autorización ARCA pendiente");
      expect(discardResult.status).toBe(200);
      expect(discardResult.body).toMatchObject({
        action: "discard",
        invoiceId,
        spaAccountId: accountId,
        arcaContacted: false,
      });
      expect(mocks.getTokenAuth).not.toHaveBeenCalled();
      expect(mocks.feCompConsultar).not.toHaveBeenCalled();
      expect(mocks.feCAESolicitar).not.toHaveBeenCalled();

      const finalDraft = await pool.query<{
        estado: string;
        reconciliation_status: string;
        reconciliation_error: string;
      }>(
        `SELECT estado, reconciliation_status, reconciliation_error
         FROM sales_invoices WHERE id = $1`,
        [invoiceId],
      );
      expect(finalDraft.rows).toEqual([{
        estado: "descartada",
        reconciliation_status: "descartada",
        reconciliation_error: expect.stringContaining("Se confirmó que el borrador debe descartarse"),
      }]);

      const auditResult = await pool.query<{ action: string; module: string; details: string }>(
        `SELECT action, module, details FROM audit_logs
         WHERE entity_type = 'sales_invoice' AND entity_id = $1
         ORDER BY timestamp DESC`,
        [String(invoiceId)],
      );
      expect(auditResult.rows).toHaveLength(1);
      expect(auditResult.rows[0]).toMatchObject({ action: "delete", module: "spa-fiscal-review" });
      expect(JSON.parse(auditResult.rows[0].details)).toMatchObject({
        action: "discard",
        reason: "Se confirmó que el borrador debe descartarse",
        spaAccountId: accountId,
        affectedDraftIds: [invoiceId],
        arcaContacted: false,
      });
    } finally {
      await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [`spa-invoice:${accountId}`]).catch(() => undefined);
      lockClient.release();
      if (invoiceId) {
        await pool.query(
          "DELETE FROM audit_logs WHERE entity_type = 'sales_invoice' AND entity_id = $1",
          [String(invoiceId)],
        );
        await pool.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
      }
      await pool.query("DELETE FROM spa_account_items WHERE account_id = $1", [accountId]);
      await pool.query("DELETE FROM spa_accounts WHERE id = $1", [accountId]);
    }
  }, 15_000);

  it("no vincula comprobantes no emitidos aunque los reintentos sean concurrentes", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const groupId = `recovery-unemitted-group-${suffix}`;
    const groupPaymentId = `recovery-unemitted-payment-${suffix}`;
    const accountId = `recovery-unemitted-spa-${suffix}`;
    const puntoVenta = 9950 + (parseInt(suffix.slice(0, 4), 16) % 40);
    let groupInvoiceId: number | null = null;
    let paymentInvoiceId: number | null = null;
    let spaInvoiceId: number | null = null;
    try {
      await pool.query(`INSERT INTO groups (id, group_code, name, check_in_date, check_out_date, status, created_at)
        VALUES ($1, $2, 'Grupo no emitida', CURRENT_DATE, CURRENT_DATE + 1, 'confirmed', NOW())`, [groupId, `RU-${suffix}`]);
      await pool.query(`INSERT INTO group_payments (id, group_id, amount, method, date, destination)
        VALUES ($1, $2, '100.00', 'efectivo', CURRENT_DATE, 'group_distribution')`, [groupPaymentId, groupId]);
      await pool.query(`INSERT INTO spa_accounts (id, appointment_id, guest_name, status, opened_at)
        VALUES ($1, $2, 'SPA no emitida', 'open', NOW())`, [accountId, `appointment-${suffix}`]);
      groupInvoiceId = await insertDraft({ puntoVenta, estado: "rechazada", groupId, sourceChargeAmounts: { [`charge-${suffix}`]: 100 } });
      paymentInvoiceId = await insertDraft({ puntoVenta: puntoVenta + 1, estado: "autorizacion_pendiente", groupId, groupPaymentId });
      spaInvoiceId = await insertDraft({ puntoVenta: puntoVenta + 2, estado: "autorizacion_pendiente", spaAccountId: accountId, cashFormaPago: "efectivo" });
      const responses = await Promise.all([
        request("POST", `/api/groups/${groupId}/direct-invoice`, { invoiceData: { id: groupInvoiceId, tipoComprobante: "FB", puntoVenta, numero: 1 } }),
        request("POST", `/api/groups/${groupId}/direct-invoice`, { invoiceData: { id: groupInvoiceId, tipoComprobante: "FB", puntoVenta, numero: 1 } }),
        request("PATCH", `/api/groups/${groupId}/payments/${groupPaymentId}/invoice`, { invoiceData: { id: paymentInvoiceId } }),
        request("PATCH", `/api/groups/${groupId}/payments/${groupPaymentId}/invoice`, { invoiceData: { id: paymentInvoiceId } }),
        request("POST", `/api/spa/accounts/${accountId}/link-invoice`, { invoiceId: spaInvoiceId }),
        request("POST", `/api/spa/accounts/${accountId}/link-invoice`, { invoiceId: spaInvoiceId }),
      ]);
      expect(responses.every((response) => response.status === 409)).toBe(true);
      expect((await pool.query("SELECT id FROM group_invoices WHERE sales_invoice_id = $1", [groupInvoiceId])).rows).toEqual([]);
      expect((await pool.query("SELECT invoice_id FROM group_payments WHERE id = $1", [groupPaymentId])).rows[0].invoice_id).toBeNull();
      expect((await pool.query("SELECT id FROM spa_payments WHERE account_id = $1", [accountId])).rows).toEqual([]);
      expect((await pool.query("SELECT id FROM cash_movements WHERE source_id = $1", [String(spaInvoiceId)])).rows).toEqual([]);
    } finally {
      await pool.query("DELETE FROM sales_invoices WHERE id = ANY($1::int[])", [[groupInvoiceId, paymentInvoiceId, spaInvoiceId].filter(Boolean)]);
      await pool.query("DELETE FROM spa_accounts WHERE id = $1", [accountId]);
      await pool.query("DELETE FROM group_payments WHERE id = $1", [groupPaymentId]);
      await pool.query("DELETE FROM groups WHERE id = $1", [groupId]);
    }
  }, 15_000);

  afterAll(async () => {
    await stopRecoveryRoutes();
  });
});

afterAll(async () => {
  await pool?.end();
});